import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from './auth/decorators/public.decorator.js';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('stream/:id')
  streamParamRedirect(@Param('id') id: string, @Res() res: Response) {
    res.redirect(307, `/youtube/stream/${encodeURIComponent(id)}`);
  }

  @Public()
  @Get('stream')
  streamQueryRedirect(
    @Query('videoId') videoId: string,
    @Query('id') queryId: string,
    @Res() res: Response,
  ) {
    const id = videoId || queryId;
    res.redirect(307, `/youtube/stream?videoId=${encodeURIComponent(id || '')}`);
  }
}
