import { Module } from '@nestjs/common';
import { LastfmService } from './services/lastfm.service.js';

@Module({
  providers: [LastfmService],
  exports: [LastfmService],
})
export class LastfmModule {}
