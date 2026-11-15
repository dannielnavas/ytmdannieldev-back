import {
  Controller,
  Get,
  Headers,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/guard/jwt-auth/jwt-auth.guard.js';
import { Public } from '../../auth/decorators/public.decorator.js';
import { ApiTags } from '@nestjs/swagger';
import { Token } from '../../auth/models/token.model.js';
import { YoutubeService } from '../services/youtube.service.js';

const MAX_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB
const STREAM_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
    @Headers('range') rangeHeader: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
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

    return this.streamAudio(id, rangeHeader, req, res);
  }

  @Public()
  @Get('stream/:videoId')
  async streamByParam(
    @Param('videoId') videoId: string,
    @Headers('range') rangeHeader: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.streamAudio(videoId, rangeHeader, req, res);
  }

  private async streamAudio(
    videoId: string,
    rangeHeader: string | undefined,
    req: Request,
    res: Response,
  ) {
    const abort = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) {
        abort.abort();
      }
    };
    req.on('close', onClose);

    try {
      let streamInfo = await this.youtubeService.getResolvedStreamInfo(videoId);
      const effectiveRange =
        rangeHeader ?? ((req.headers as any)?.['range'] as string | undefined);

      const computeRange = (total: number) => {
        let start = 0;
        let end =
          total > 0
            ? Math.min(total - 1, MAX_CHUNK_SIZE - 1)
            : MAX_CHUNK_SIZE - 1;

        if (effectiveRange && effectiveRange.startsWith('bytes=')) {
          const [startStr, endStr] = effectiveRange
            .replace(/^bytes=/i, '')
            .split('-');

          if (startStr === '' && endStr && total > 0) {
            const suffix = parseInt(endStr, 10) || 0;
            start = Math.max(0, total - suffix);
            end = total - 1;
          } else {
            start = parseInt(startStr, 10) || 0;
            if (total > 0 && start >= total) {
              return { outOfRange: true as const, start, end, total };
            }
            if (endStr && endStr.length > 0) {
              const parsedEnd = parseInt(endStr, 10);
              end =
                !Number.isNaN(parsedEnd) && parsedEnd >= start
                  ? total > 0
                    ? Math.min(total - 1, parsedEnd)
                    : parsedEnd
                  : start + MAX_CHUNK_SIZE - 1;
              if (end - start + 1 > MAX_CHUNK_SIZE) {
                end = start + MAX_CHUNK_SIZE - 1;
              }
            } else if (total > 0) {
              end = Math.min(total - 1, start + MAX_CHUNK_SIZE - 1);
            } else {
              end = start + MAX_CHUNK_SIZE - 1;
            }
          }
        }

        return { outOfRange: false as const, start, end, total };
      };

      let rangeBounds = computeRange(streamInfo.contentLength);
      if (rangeBounds.outOfRange) {
        req.off('close', onClose);
        res
          .status(416)
          .setHeader('Content-Range', `bytes */${rangeBounds.total}`);
        res.end();
        return;
      }

      const fetchChunk = (url: string, start: number, end: number) =>
        fetch(url, {
          headers: {
            Range: `bytes=${start}-${end}`,
            'User-Agent': STREAM_USER_AGENT,
          },
          signal: abort.signal,
        });

      let upstreamRes = await fetchChunk(
        streamInfo.url,
        rangeBounds.start,
        rangeBounds.end,
      );

      // Si Googlevideo expiró o rechazó la URL en caché, refrescar 1 vez
      if (upstreamRes.status === 401 || upstreamRes.status === 403) {
        this.youtubeService.invalidateStreamCache(videoId);
        streamInfo = await this.youtubeService.getResolvedStreamInfo(
          videoId,
          true,
        );
        rangeBounds = computeRange(streamInfo.contentLength);
        upstreamRes = await fetchChunk(
          streamInfo.url,
          rangeBounds.start,
          rangeBounds.end,
        );
      }

      const upstreamContentRange = upstreamRes.headers.get('content-range');
      if (upstreamContentRange && !streamInfo.contentLength) {
        const totalMatch = upstreamContentRange.match(/\/(\d+)$/);
        if (totalMatch) {
          const learnedTotal = Number(totalMatch[1]);
          if (learnedTotal > 0) {
            streamInfo.contentLength = learnedTotal;
            this.youtubeService.updateStreamContentLength(
              streamInfo.videoId,
              learnedTotal,
            );
          }
        }
      }

      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      req.off('close', onClose);

      const total = streamInfo.contentLength;
      const actualEnd =
        buffer.byteLength > 0
          ? rangeBounds.start + buffer.byteLength - 1
          : rangeBounds.end;
      const contentRange =
        upstreamContentRange ||
        (total > 0
          ? `bytes ${rangeBounds.start}-${actualEnd}/${total}`
          : undefined);
      const contentLength =
        String(buffer.byteLength) ||
        upstreamRes.headers.get('content-length') ||
        undefined;

      res.status(206);
      res.setHeader('Content-Type', streamInfo.mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (contentLength) res.setHeader('Content-Length', contentLength);

      res.end(buffer);
    } catch (error: any) {
      req.off('close', onClose);
      if (
        error?.name === 'AbortError' ||
        abort.signal.aborted ||
        res.writableEnded
      ) {
        return;
      }
      console.error('Error streaming audio:', error);
      const status =
        typeof error?.getStatus === 'function' ? error.getStatus() : 500;
      if (!res.headersSent) {
        res.status(status).json({
          statusCode: status,
          message: 'Error streaming audio',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
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
