import { Readable } from 'node:stream';
import {
  createMp4HeaderPatchTransform,
  patchFragmentedMp4Header,
} from './mp4-duration-patch.js';

function makeBox(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

function makeFullBox(
  type: string,
  version: number,
  bodySize: number,
  fill: (buf: Buffer) => void,
): Buffer {
  const payload = Buffer.alloc(4 + bodySize);
  payload[0] = version;
  fill(payload);
  return makeBox(type, payload);
}

function buildSampleMp4(opts: {
  includeMvex: boolean;
  version?: 0 | 1;
  duration?: number;
}) {
  const v = opts.version ?? 0;
  const dur = opts.duration ?? 9397248;

  const ftyp = makeBox('ftyp', Buffer.from('dash\0\0\0\0iso6mp41', 'ascii'));

  const mvhd = makeFullBox('mvhd', v, v === 0 ? 96 : 108, (p) => {
    if (v === 0) {
      p.writeUInt32BE(44100, 12);
      p.writeUInt32BE(dur, 16);
    } else {
      p.writeUInt32BE(44100, 20);
      p.writeBigUInt64BE(BigInt(dur), 24);
    }
  });

  const tkhd = makeFullBox('tkhd', v, v === 0 ? 80 : 92, (p) => {
    if (v === 0) {
      p.writeUInt32BE(dur, 20);
    } else {
      p.writeBigUInt64BE(BigInt(dur), 28);
    }
  });

  const mdhd = makeFullBox('mdhd', v, v === 0 ? 20 : 32, (p) => {
    if (v === 0) {
      p.writeUInt32BE(44100, 12);
      p.writeUInt32BE(dur, 16);
    } else {
      p.writeUInt32BE(44100, 20);
      p.writeBigUInt64BE(BigInt(dur), 24);
    }
  });

  const mdia = makeBox('mdia', mdhd);
  const trak = makeBox('trak', Buffer.concat([tkhd, mdia]));
  const mvex = opts.includeMvex
    ? makeBox('mvex', makeBox('trex', Buffer.alloc(24)))
    : Buffer.alloc(0);
  const moov = makeBox('moov', Buffer.concat([mvhd, mvex, trak]));
  const mdat = makeBox('mdat', Buffer.from('audio-payload'));

  return {
    full: Buffer.concat([ftyp, moov, mdat]),
    moovEnd: ftyp.length + moov.length,
    ftypLen: ftyp.length,
    mvhdOffset: ftyp.length + 8,
    tkhdOffset: ftyp.length + 8 + mvhd.length + mvex.length + 8,
    mdhdOffset:
      ftyp.length + 8 + mvhd.length + mvex.length + 8 + tkhd.length + 8,
  };
}

async function collectTransform(
  input: Buffer,
  chunkSize: number,
  startOffset: number,
  options?: Parameters<typeof createMp4HeaderPatchTransform>[1],
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    chunks.push(input.subarray(i, i + chunkSize));
  }
  const source = Readable.from(chunks);
  const tx = createMp4HeaderPatchTransform(startOffset, options);
  const out: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    source
      .pipe(tx)
      .on('data', (d: Buffer) => out.push(d))
      .on('end', resolve)
      .on('error', reject);
  });

  return Buffer.concat(out);
}

describe('mp4-duration-patch', () => {
  it('zeros mvhd, tkhd, and mdhd v0 durations when mvex is present', () => {
    const sample = buildSampleMp4({ includeMvex: true, version: 0 });
    const origLen = sample.full.length;

    const moovEnd = patchFragmentedMp4Header(sample.full);

    expect(moovEnd).toBe(sample.moovEnd);
    expect(sample.full.length).toBe(origLen);
    expect(sample.full.readUInt32BE(sample.mvhdOffset + 8 + 16)).toBe(0);
    expect(sample.full.readUInt32BE(sample.tkhdOffset + 8 + 20)).toBe(0);
    expect(sample.full.readUInt32BE(sample.mdhdOffset + 8 + 16)).toBe(0);
  });

  it('zeros mvhd, tkhd, and mdhd v1 durations when mvex is present', () => {
    const sample = buildSampleMp4({ includeMvex: true, version: 1 });
    const moovEnd = patchFragmentedMp4Header(sample.full);

    expect(moovEnd).toBe(sample.moovEnd);
    expect(sample.full.readBigUInt64BE(sample.mvhdOffset + 8 + 24)).toBe(0n);
    expect(sample.full.readBigUInt64BE(sample.tkhdOffset + 8 + 28)).toBe(0n);
    expect(sample.full.readBigUInt64BE(sample.mdhdOffset + 8 + 24)).toBe(0n);
  });

  it('does NOT modify durations for non-fragmented MP4 (no mvex)', () => {
    const sample = buildSampleMp4({
      includeMvex: false,
      version: 0,
      duration: 123456,
    });
    const moovEnd = patchFragmentedMp4Header(sample.full);

    expect(moovEnd).toBe(sample.moovEnd);
    expect(sample.full.readUInt32BE(sample.mvhdOffset + 8 + 16)).toBe(123456);
    expect(sample.full.readUInt32BE(sample.tkhdOffset + 8 + 20)).toBe(123456);
    expect(sample.full.readUInt32BE(sample.mdhdOffset + 8 + 16)).toBe(123456);
  });

  it('streams and patches moov split across small chunks and caches header', async () => {
    const sample = buildSampleMp4({ includeMvex: true, version: 0 });
    let cachedHeader: Buffer | undefined;

    const output = await collectTransform(sample.full, 13, 0, {
      onPatchedHeader: (h) => {
        cachedHeader = h;
      },
    });

    expect(output.length).toBe(sample.full.length);
    expect(cachedHeader?.length).toBe(sample.moovEnd);
    expect(output.readUInt32BE(sample.mvhdOffset + 8 + 16)).toBe(0);
    expect(output.readUInt32BE(sample.tkhdOffset + 8 + 20)).toBe(0);
    expect(output.readUInt32BE(sample.mdhdOffset + 8 + 16)).toBe(0);
  });

  it('applies cachedHeader when a Range request starts mid-moov', async () => {
    const sample = buildSampleMp4({ includeMvex: true, version: 0 });
    const rawCopy = Buffer.from(sample.full);
    patchFragmentedMp4Header(sample.full);
    const cachedHeader = sample.full.subarray(0, sample.moovEnd);

    const startOffset = sample.ftypLen;
    const output = await collectTransform(
      rawCopy.subarray(startOffset),
      17,
      startOffset,
      { cachedHeader },
    );

    expect(output).toEqual(sample.full.subarray(startOffset));
  });

  it('passes through short 2-byte probes untouched', async () => {
    const sample = buildSampleMp4({ includeMvex: true, version: 0 });
    const probe = sample.full.subarray(0, 2);

    const output = await collectTransform(probe, 2, 0);
    expect(output).toEqual(probe);
  });
});
