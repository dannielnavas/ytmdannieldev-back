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
  getDashboardData(@Req() req: Request) {
    const userPayload = (req as any).user as Token;

    return this.youtubeService.getDashboardData(userPayload.sub);
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
      res.json({
        videoId: id,
        streamUrl: `/youtube/stream/${id}`,
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
      const url =
        format.url ??
        (await format.decipher(this.youtubeService.yt.session.player));
      const cpn = Utils.generateRandomString(16);

      const headers: Record<string, string> = {
        accept: '*/*',
        origin: 'https://www.youtube.com',
        referer: 'https://www.youtube.com',
        DNT: '?1',
      };
      if ((req.headers as any)?.['range']) {
        headers['Range'] = (req.headers as any)['range'] as string;
      }

      const upstream = await fetch(`${url}&cpn=${cpn}`, { headers });
      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status || 502).end();
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

      Readable.fromWeb(upstream.body as any).pipe(res);
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

  @Get('playlist/:id')
  async viewPlaylist(@Param('id') id: string) {
    return this.youtubeService.viewPlaylist(id);
  }

  @Get('album/:id')
  async viewAlbum(@Param('id') id: string) {
    return this.youtubeService.viewAlbum(id);
  }
}
