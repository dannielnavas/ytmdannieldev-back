import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../auth/guard/jwt-auth/jwt-auth.guard.js';
import { Token } from '../../../auth/models/token.model.js';
import { ToggleLikeDto } from '../../dtos/like.dto.js';
import { LikesService } from '../../services/likes/likes.service.js';

@ApiTags('Likes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('likes')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  private getUserId(req: Request): number {
    const user = (req as any).user as Token;
    const userId = user?.sub ?? (user as any)?.id;
    if (!userId) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    return Number(userId);
  }

  // POST /likes/toggle
  @Post('toggle')
  async toggle(@Body() trackData: ToggleLikeDto, @Req() req: Request) {
    const userId = this.getUserId(req);
    return this.likesService.toggleLike(userId, trackData);
  }

  // GET /likes (Devuelve todas las canciones gustadas para reproducir en cola)
  @Get()
  async getMyLikes(@Req() req: Request) {
    const userId = this.getUserId(req);
    return this.likesService.getUserLikedTracks(userId);
  }

  // GET /likes/check/:youtubeId (Para pintar el icono de corazón al reproducir)
  @Get('check/:youtubeId')
  async checkLike(@Param('youtubeId') youtubeId: string, @Req() req: Request) {
    const userId = this.getUserId(req);
    const isLiked = await this.likesService.isTrackLiked(userId, youtubeId);
    return { isLiked };
  }
}

