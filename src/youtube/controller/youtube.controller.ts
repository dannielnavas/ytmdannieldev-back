import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { createReadStream } from 'node:fs';
import { JwtAuthGuard } from '../../auth/guard/jwt-auth/jwt-auth.guard.js';
import { Public } from '../../auth/decorators/public.decorator.js';
import { ApiTags } from '@nestjs/swagger';
import { Token } from '../../auth/models/token.model.js';
import { YoutubeService } from '../services/youtube.service.js';

@ApiTags('Youtube')
@Controller('youtube')
@UseGuards(JwtAuthGuard)
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) {}

  @Get('dashboard')
  getDashboardData(@Req() req: Request, @Query('refresh') refresh?: string) {
    const userPayload = (req as any).user as Token;
    const forceRefresh = refresh === 'true' || refresh === '1';

    return this.youtubeService.getDashboardData(userPayload.sub, forceRefresh);
  }

  @Get('recap')
  getRecapData(@Req() req: Request, @Query('refresh') refresh?: string) {
    const userPayload = (req as any).user as Token;
    const forceRefresh = refresh === 'true' || refresh === '1';

    return this.youtubeService.getRecapData(userPayload.sub, forceRefresh);
  }

  @Public()
  @Get('stream')
  async streamByQuery(
    @Query('videoId') videoId: string,
    @Query('id') queryId: string,
    @Req() req: Request,
    @Res() res: any,
  ) {
    const id = (videoId || queryId)?.trim();
    if (!id) {
      res.status(400).send('videoId is required');
      return;
    }

    // Si el cliente solicita JSON (ej. HttpClient de Angular desde _dashboard.stream)
    // Nota: el <audio> del frontend nunca pide application/json; en ese caso
    // servimos bytes con Range (contrato /youtube/stream/:videoId).
    const acceptHeader = (req.headers as any)?.['accept'] || '';
    if (acceptHeader.includes('application/json')) {
      const skipSegments = await this.youtubeService.getSkipSegments(id);
      res.json({
        videoId: id,
        streamUrl: `/youtube/stream/${id}`,
        skipSegments,
      });
      return;
    }

    return this.streamFile(id, req, res);
  }

  @Public()
  @Get('stream/:id')
  async streamByParam(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: any,
  ) {
    return this.streamFile(id, req, res);
  }

  /**
   * Contract (verified in playback.service.ts + electron/main.ts):
   * - GET /youtube/stream/:videoId, no Authorization (audio tag cannot send
   *   headers; endpoint is @Public).
   * - Headers: Accept-Ranges: bytes, Content-Type: audio/mp4,
   *   Access-Control-Allow-Origin: *, Access-Control-Expose-Headers:
   *   Content-Range, Content-Length, Accept-Ranges.
   * - Range bytes=s-e -> 206 + Content-Range: bytes s-e/total.
   * - No Range -> 200 with Content-Length = total.
   * - Out of range -> 416 + Content-Range: bytes ASTERISK/total.
   *   (star-slash form: bytes STAR/total — written without the star to
   *   avoid closing this JSDoc early.)
   * - Bytes are served from a cached file (tmp cache dir, .m4a) so repeated
   *   seeks do not re-transcode.
   */
  private async streamFile(id: string, req: Request, res: any) {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Range, Content-Length, Accept-Ranges',
    );

    const abort = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) {
        abort.abort();
      }
    };
    req.on('close', onClose);

    try {
      const file = await this.youtubeService.getAudioFile(id, {
        signal: abort.signal,
      });
      // Download finished: the close handler must no longer abort anything.
      req.off('close', onClose);

      const size = file.size;
      const range = (req.headers as any)?.['range'] as string | undefined;

      if (!range) {
        res.status(200);
        res.setHeader('Content-Length', size);
        const rs = createReadStream(file.path);
        rs.on('error', (err: any) => {
          if (!res.headersSent && !res.writableEnded) {
            res.status(500).json({
              statusCode: 500,
              message: 'Error streaming audio',
              error: err?.message || String(err),
            });
          } else if (!res.writableEnded) {
            res.destroy(err);
          }
        });
        res.on('close', () => {
          if (!(rs as any).destroyed) (rs as any).destroy();
        });
        rs.pipe(res);
        return;
      }

      const parsed = this.parseRange(range, size);
      if (!parsed) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`);
        return res.end();
      }

      const { start, end } = parsed;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', end - start + 1);

      const rs = createReadStream(file.path, { start, end });
      rs.on('error', (err: any) => {
        if (!res.writableEnded) {
          res.destroy(err);
        }
      });
      res.on('close', () => {
        if (!(rs as any).destroyed) (rs as any).destroy();
      });
      rs.pipe(res);
    } catch (error: any) {
      req.off('close', onClose);
      // Client disconnected during download (pause/seek abort) — nothing to do.
      if (
        error?.name === 'AbortError' ||
        abort.signal.aborted ||
        res.writableEnded
      ) {
        return;
      }
      console.error('Error streaming audio:', error);
      if (!res.headersSent) {
        res.status(500).json({
          statusCode: 500,
          message: 'Error streaming audio',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private parseRange(
    range: string,
    size: number,
  ): { start: number; end: number } | null {
    // Support: bytes=start-end, bytes=start-, bytes=-suffix.
    const m = range.trim().match(/^bytes=(\d*)-(\d*)$/i);
    if (!m) return null;
    const [, startStr, endStr] = m;

    if (startStr === '' && endStr === '') return null;

    if (startStr === '') {
      // Suffix range: last N bytes.
      const suffix = Number(endStr);
      if (Number.isNaN(suffix) || suffix <= 0) return null;
      return { start: Math.max(0, size - suffix), end: size - 1 };
    }

    const start = Number(startStr);
    if (Number.isNaN(start) || start >= size) return null;

    let end: number;
    if (endStr === '') {
      end = size - 1;
    } else {
      end = Number(endStr);
      if (Number.isNaN(end) || end < start) return null;
      if (end >= size) end = size - 1;
    }

    return { start, end };
  }

  @Get('metadata/:id')
  async getMetadata(@Param('id') id: string) {
    return this.youtubeService.getMetadata(id);
  }

  @Get('search')
  async search(@Query('q') q: string) {
    return this.youtubeService.search(q);
  }

  @Get(['playlist/:playlistId', 'playlist/:id'])
  async viewPlaylist(
    @Req() req: Request,
    @Param('playlistId') playlistId?: string,
    @Param('id') id?: string,
  ) {
    const userPayload = (req as any)?.user as Token | undefined;
    const userId = userPayload?.sub ? Number(userPayload.sub) : undefined;
    return this.youtubeService.viewPlaylist(playlistId || id || '', userId);
  }

  @Get('album/:id')
  async viewAlbum(@Param('id') id: string) {
    return this.youtubeService.viewAlbum(id);
  }

  @Get('lyrics')
  async getLyrics(
    @Query('track_name') track_name: string,
    @Query('artist_name') artist_name: string,
    @Query('duration') duration?: string,
  ) {
    const dur = duration ? Number(duration) : undefined;
    return this.youtubeService.getLyrics(track_name, artist_name, dur);
  }
}
