import { Utils } from 'youtubei.js';
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
import { Readable } from 'node:stream';
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
    const id = (videoId || queryId)?.replace(/^RDAM(?:VM|PL)/, '');
    if (!id) {
      res.status(400).send('videoId is required');
      return;
    }

    // Si el cliente solicita JSON (ej. HttpClient de Angular desde _dashboard.stream)
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

    return this.pipeAudioStream(id.replace(/^RDAM(?:VM|PL)/, ''), req, res);
  }

  @Public()
  @Get('stream/:id')
  async streamByParam(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: any,
  ) {
    return this.pipeAudioStream(id, req, res);
  }

  private async pipeAudioStream(id: string, req: Request, res: any) {
    try {
      const format = await this.youtubeService.getAudioStream(id);
      const player =
        (format as any)._innertube?.session?.player ||
        this.youtubeService.yt?.session?.player;
      const url =
        format.url ??
        (await format.decipher(player));
      const cpn = Utils.generateRandomString(16);

      const headers: Record<string, string> = {
        accept: '*/*',
        origin: 'https://www.youtube.com',
        referer: 'https://www.youtube.com',
        DNT: '?1',
      };
      const reqRange = (req.headers as any)?.['range'] as string | undefined;
      let start = 0;
      let end: number | undefined;

      if (reqRange && reqRange.startsWith('bytes=')) {
        const parts = reqRange.replace('bytes=', '').split('-');
        const parsedStart = parseInt(parts[0], 10);
        if (!isNaN(parsedStart)) {
          start = parsedStart;
        }
        if (parts[1] && parts[1].trim() !== '') {
          const parsedEnd = parseInt(parts[1], 10);
          if (!isNaN(parsedEnd)) {
            end = parsedEnd;
          }
        }
      }

      const chunkSize = 1048576; // 1 MB chunk (Google Video maximum chunk size for web/YTMUSIC clients)
      const totalLength = format.content_length
        ? Number(format.content_length)
        : undefined;

      if (totalLength && start >= totalLength) {
        res
          .status(416)
          .setHeader('Content-Range', `bytes */${totalLength}`)
          .end();
        return;
      }

      // Google Video returns 403 Forbidden if Range is open-ended (e.g. 'bytes=0-') or chunk exceeds ~1MB.
      // If client explicitly requested an end within 1MB chunk, respect it.
      // Otherwise, cap to start + chunkSize - 1 (or totalLength - 1 if smaller).
      let boundedEnd: number;
      if (end !== undefined && end >= start && end - start < chunkSize) {
        boundedEnd = end;
      } else if (totalLength && totalLength > 0) {
        boundedEnd = Math.min(start + chunkSize - 1, totalLength - 1);
      } else {
        boundedEnd = start + chunkSize - 1;
      }

      headers['Range'] = `bytes=${start}-${boundedEnd}`;

      const upstream = await fetch(`${url}&cpn=${cpn}`, { headers });
      if (!upstream.ok && upstream.status !== 206) {
        const upstreamText = await upstream.text().catch(() => '');
        const chosenClient = (format as any)?._chosenClient;
        console.warn(
          `Upstream audio fetch error for video ${id}: status=${upstream.status}, client=${chosenClient}, body=${upstreamText}`,
        );
        res.status(upstream.status || 502).json({
          statusCode: upstream.status || 502,
          message: 'Upstream audio fetch error',
          client: chosenClient,
          upstreamBody: upstreamText.slice(0, 500),
        });
        return;
      }

      res.status(upstream.status);
      const contentType =
        upstream.headers.get('content-type') || format.mime_type || 'audio/mp4';
      res.setHeader('Content-Type', contentType);

      const contentRange = upstream.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      res.setHeader('Accept-Ranges', 'bytes');

      if (!upstream.body) {
        res.status(502).end();
        return;
      }

      const bodyStream = Readable.fromWeb(upstream.body as any);
      bodyStream.on('error', (err) => {
        if (!res.writableEnded) {
          res.destroy(err);
        }
      });
      bodyStream.pipe(res);
    } catch (error) {
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
