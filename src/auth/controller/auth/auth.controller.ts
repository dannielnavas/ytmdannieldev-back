import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from '../../services/auth/auth.service.js';
import { AuthGuard } from '@nestjs/passport';
import { Users } from '../../../users/entities/user.entity.js';
import { UpdateYoutubeCookiesDto } from '../../../users/dtos/user.dto.js';
import type { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // TODO: se usa el nombre dado en la strategy
  @UseGuards(AuthGuard('local'))
  @Post('login')
  login(@Req() req: Request) {
    // console.log(req.user);
    // const user = req.user as Users;
    // if (!user.user_id) {
    //   throw new UnauthorizedException('Invalid credentials');
    // }
    // return this.authService.generateJWT(user);
  }

  @Post('login-cookie')
  async loginCookie(@Body() payload: UpdateYoutubeCookiesDto) {
    const user = await this.authService.loginCookie(payload);
    return this.authService.generateJWT(user);
  }
}
