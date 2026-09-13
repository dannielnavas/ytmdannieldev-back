import { Controller, Get, Param, Query, Redirect } from '@nestjs/common';
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
  @Redirect()
  streamParamRedirect(@Param('id') id: string) {
    return {
      url: `/youtube/stream/${encodeURIComponent(id)}`,
      statusCode: 307,
    };
  }

  @Public()
  @Get('stream')
  @Redirect()
  streamQueryRedirect(
    @Query('videoId') videoId: string,
    @Query('id') queryId: string,
  ) {
    const id = videoId || queryId;
    return {
      url: `/youtube/stream?videoId=${encodeURIComponent(id || '')}`,
      statusCode: 307,
    };
  }
}
