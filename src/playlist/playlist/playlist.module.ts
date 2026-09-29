import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserLike } from '../entities/user-like.entity.js';
import { Track } from '../entities/track.entity.js';
import { LikesService } from '../services/likes/likes.service.js';
import { LikesController } from '../controller/likes/likes.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserLike, Track])],
  providers: [LikesService],
  controllers: [LikesController],
  exports: [LikesService],
})
export class PlaylistModule {}
