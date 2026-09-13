import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { environments } from './environments.js';
import config from './config.js';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { DatabaseModule } from './database/database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { YoutubeModule } from './youtube/youtube.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath:
        environments[
          (process.env.NODE_ENV as keyof typeof environments) || 'dev'
        ],
      load: [config],
      isGlobal: true,
      validationSchema: Joi.object({
        API_KEY: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        DATABASE_NAME: Joi.string().required(),
        DATABASE_PORT: Joi.number().required(),
        POSTGRES_PASSWORD: Joi.string().required(),
        POSTGRES_USER: Joi.string().required(),
        POSTGRES_DB: Joi.string().required(),
        POSTGRES_HOST: Joi.string().required(),
        POSTGRES_PORT: Joi.number().required(),
        API_KEY_RESEND: Joi.string().required(),
        CLOUDINARY_CLOUD_NAME: Joi.string().allow('').optional(),
        CLOUDINARY_API_KEY: Joi.string().allow('').optional(),
        CLOUDINARY_API_SECRET: Joi.string().allow('').optional(),
      }),
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    YoutubeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
