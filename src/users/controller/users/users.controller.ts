import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guard/jwt-auth/jwt-auth.guard.js';
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from '../../services/users/users.service.js';
import type { Request } from 'express';
import { Token } from '../../../auth/models/token.model.js';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getMeData(@Req() req: Request) {
    const userPayload = req.user as Token;
    return this.usersService.findById(userPayload.sub);
  }
}
