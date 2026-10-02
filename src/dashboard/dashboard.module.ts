import { Module } from '@nestjs/common';
import { PlaylistModule } from '../playlist/playlist/playlist.module.js';
import { LastfmModule } from '../lastfm/lastfm.module.js';
import { YoutubeModule } from '../youtube/youtube.module.js';
import { DashboardController } from './controller/dashboard.controller.js';
import { DashboardService } from './services/dashboard.service.js';

@Module({
  imports: [PlaylistModule, LastfmModule, YoutubeModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
