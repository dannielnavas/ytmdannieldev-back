import { Transform, type TransformCallback } from 'node:stream';

const MAX_HEADER_SCAN_BYTES = 64 * 1024;
const ZERO_DURATION_BOXES = new Set(['mvhd', 'tkhd', 'mdhd']);
const CONTAINER_BOXES = new Set(['trak', 'mdia']);
const TOP_LEVEL_PRE_MOOV_BOXES = new Set(['ftyp', 'free', 'skip', 'wide']);

interface BoxHeader {
  type: string;
  headerSize: number;
  size: number;
}

function readBoxHeader(buffer: Buffer, offset: number, limit: number): BoxHeader | null {
  if (offset + 8 > limit) return null;
  let size = buffer.readUInt32BE(offset);
  const type = buffer.toString('ascii', offset + 4, offset + 8);
  let headerSize = 8;

  if (size === 1) {
    if (offset + 16 > limit) return null;
    size = Number(buffer.readBigUInt64BE(offset + 8));
    headerSize = 16;
  }

  if (size < headerSize || !Number.isFinite(size)) return null;
  return { type, headerSize, size };
}

function hasChildBox(buffer: Buffer, start: number, end: number, targetType: string): boolean {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readBoxHeader(buffer, offset, end);
    if (!box || offset + box.size > end) break;
    if (box.type === targetType) return true;
    offset += box.size;
  }
  return false;
}

function zeroDurationInFullBox(buffer: Buffer, offset: number, headerSize: number, end: number): void {
  const body = offset + headerSize;
  if (body + 4 > end) return;
  const version = buffer[body];
  // mvhd/mdhd: version(1)+flags(3) + creation(4|8) + modification(4|8) + timescale(4) + duration(4|8)
  // tkhd:      version(1)+flags(3) + creation(4|8) + modification(4|8) + trackId(4) + reserved(4) + duration(4|8)
  const boxType = buffer.toString('ascii', offset + 4, offset + 8);
  const isTkhd = boxType === 'tkhd';

  if (version === 0) {
    const durationOffset = body + (isTkhd ? 20 : 16);
    if (durationOffset + 4 <= end) {
      buffer.writeUInt32BE(0, durationOffset);
    }
  } else if (version === 1) {
    const durationOffset = body + (isTkhd ? 28 : 24);
    if (durationOffset + 8 <= end) {
      buffer.writeBigUInt64BE(0n, durationOffset);
    }
  }
}

function zeroDurationsInMoov(buffer: Buffer, start: number, end: number): void {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readBoxHeader(buffer, offset, end);
    if (!box || offset + box.size > end) break;
    const boxEnd = offset + box.size;

    if (ZERO_DURATION_BOXES.has(box.type)) {
      zeroDurationInFullBox(buffer, offset, box.headerSize, boxEnd);
    } else if (CONTAINER_BOXES.has(box.type)) {
      zeroDurationsInMoov(buffer, offset + box.headerSize, boxEnd);
    }

    offset = boxEnd;
  }
}

/**
 * Fragmented MP4 (DASH) streams from YouTube often carry non-zero durations in
 * `mvhd`, `tkhd`, and `mdhd` alongside `mvex` + `moof` fragments. Apple
 * AVFoundation (WKWebView/Safari) sums the header duration and the fragment
 * durations, reporting 2x track length with the second half in silence.
 *
 * Per ISO/IEC 14496-12, those header durations must be 0 when `mvex` is
 * present. Zeroing them in-place preserves all byte offsets and Content-Length.
 *
 * Returns the end byte offset of `moov` if processed (or `-1` if the buffer
 * does not contain a complete `moov` yet, or `0` if no further buffering is
 * needed).
 */
export function patchFragmentedMp4Header(buffer: Buffer): number {
  let offset = 0;
  const limit = buffer.length;

  while (offset + 8 <= limit) {
    const box = readBoxHeader(buffer, offset, limit);
    if (!box) return -1;

    if (box.type === 'moov') {
      const moovEnd = offset + box.size;
      if (moovEnd > limit) return -1;

      const moovBodyStart = offset + box.headerSize;
      if (hasChildBox(buffer, moovBodyStart, moovEnd, 'mvex')) {
        zeroDurationsInMoov(buffer, moovBodyStart, moovEnd);
      }
      return moovEnd;
    }

    if (!TOP_LEVEL_PRE_MOOV_BOXES.has(box.type)) {
      return 0;
    }

    if (offset + box.size > limit) return -1;
    offset += box.size;
  }

  return -1;
}

/**
 * Creates a Transform stream that patches a fragmented MP4 `moov` header on
 * the fly without changing stream length or byte offsets.
 */
export function createMp4HeaderPatchTransform(
  startOffset: number,
  options?: {
    cachedHeader?: Buffer;
    onPatchedHeader?: (header: Buffer) => void;
  },
): Transform {
  let streamPos = startOffset;
  let pending: Buffer = Buffer.alloc(0);
  let passthrough = startOffset > 0;

  return new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      if (passthrough) {
        const cached = options?.cachedHeader;
        if (cached && streamPos < cached.length) {
          const out = Buffer.from(chunk);
          const overlapEnd = Math.min(cached.length, streamPos + out.length);
          for (let pos = streamPos; pos < overlapEnd; pos++) {
            out[pos - streamPos] = cached[pos];
          }
          streamPos += out.length;
          this.push(out);
        } else {
          streamPos += chunk.length;
          this.push(chunk);
        }
        callback();
        return;
      }

      pending = pending.length === 0 ? Buffer.from(chunk) : Buffer.concat([pending, chunk]);
      const moovEnd = patchFragmentedMp4Header(pending);

      if (moovEnd > 0) {
        options?.onPatchedHeader?.(Buffer.from(pending.subarray(0, moovEnd)));
        passthrough = true;
        streamPos += pending.length;
        this.push(pending);
        pending = Buffer.alloc(0);
      } else if (moovEnd === 0 || pending.length >= MAX_HEADER_SCAN_BYTES) {
        passthrough = true;
        streamPos += pending.length;
        this.push(pending);
        pending = Buffer.alloc(0);
      }

      callback();
    },
    flush(callback: TransformCallback) {
      if (pending.length > 0) {
        this.push(pending);
        pending = Buffer.alloc(0);
      }
      callback();
    },
  });
}
