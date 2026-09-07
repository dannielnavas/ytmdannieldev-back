import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import config from '../../config.js';
import { Client } from 'pg';

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
          //sunchronize: false, // en producción
          autoLoadEntities: true,
          ssl: {
            rejectUnauthorized: false,
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
    {
      provide: 'PG',
      useFactory: (configServices: ConfigType<typeof config>) => {
        const { username, host, database, password, port } =
          configServices.postgres;
        const client = new Client({
          user: username,
          host,
          database,
          password,
          port,
          ssl: {
            rejectUnauthorized: false,
          },
        });
        client.connect();
        return client;
      },
      inject: [config.KEY],
    },
  ],
  exports: ['API_KEY', 'PG', TypeOrmModule],
})
export class DatabaseModule {}
