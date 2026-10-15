import { Module } from '@nestjs/common';
import { SponsorblockController } from './controller/sponsorblock.controller.js';
import { SponsorblockService } from './services/sponsorblock.service.js';

@Module({
  controllers: [SponsorblockController],
  providers: [SponsorblockService],
  exports: [SponsorblockService],
})
export class SponsorblockModule {}
