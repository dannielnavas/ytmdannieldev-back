import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { ConfigType } from '@nestjs/config';
import config from '../config.js';
import { YoutubeController } from './controller/youtube.controller.js';
import { YoutubeService } from './services/youtube.service.js';
import { UsersModule } from '../users/users.module.js';
import { YoutubeCache } from './entities/youtube-cache.entity.js';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([YoutubeCache]),
    JwtModule.registerAsync({
      inject: [config.KEY],
      useFactory: (configService: ConfigType<typeof config>) => ({
        secret: configService.jwtSecret,
      }),
    }),
  ],
  controllers: [YoutubeController],
  providers: [YoutubeService],
  exports: [YoutubeService],
})
export class YoutubeModule {}
