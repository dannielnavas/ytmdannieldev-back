import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import pg from 'pg';
import config from '../../config.js';

const API_KEY = config().apiKey;
const API_KEY_PROD = config().apiKeyProd;

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigType<typeof config>) => {
        const { username, host, database, password, port } =
          configService.postgres;
        return {
          type: 'postgres',
          host,
          port,
          username,
          password,
          database,
          synchronize: true, // Solo para desarrollo (no usar en producción)
          autoLoadEntities: true,
          driver: pg,
          ssl: {
            rejectUnauthorized: false,
          },
          extra: {
            max: 3, // Límite estricto para evitar saturar slots de conexión en Aiven/Serverless
            idleTimeoutMillis: 5000,
            connectionTimeoutMillis: 10000,
          },
        };
      },
      inject: [config.KEY],
    }),
    TypeOrmModule.forFeature([]),
  ],
  providers: [
    {
      provide: 'API_KEY',
      useValue: process.env.NODE_ENV === 'prod' ? API_KEY_PROD : API_KEY,
    },
  ],
  exports: ['API_KEY', TypeOrmModule],
})
export class DatabaseModule {}
