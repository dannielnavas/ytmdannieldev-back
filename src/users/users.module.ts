import { Module } from '@nestjs/common';
import { UsersController } from './controller/users/users.controller.js';
import { UsersService } from './services/users/users.service.js';
import { Users } from './entities/user.entity.js';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Users])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
