import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../auth/guard/jwt-auth/jwt-auth.guard.js';
import { Token } from '../../../auth/models/token.model.js';
import {
  CheckLikesBulkDto,
  GetLikesQueryDto,
  ToggleLikeDto,
} from '../../dtos/like.dto.js';
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
  @ApiOperation({ summary: 'Alternar Me Gusta de una canción' })
  async toggle(@Body() trackData: ToggleLikeDto, @Req() req: Request) {
    const userId = this.getUserId(req);
    return this.likesService.toggleLike(userId, trackData);
  }

  // POST /likes/check-bulk (Chequear múltiples canciones en una sola llamada)
  @Post('check-bulk')
  @ApiOperation({
    summary: 'Comprobar el estado de Me Gusta de una lista de canciones',
  })
  async checkBulk(@Body() dto: CheckLikesBulkDto, @Req() req: Request) {
    const userId = this.getUserId(req);
    return this.likesService.checkLikesBulk(userId, dto.youtubeIds);
  }

  // GET /likes/forgotten (Joyas olvidadas entre las favoritas antiguas)
  @Get('forgotten')
  @ApiOperation({
    summary: 'Obtener canciones favoritas antiguas (Joyas olvidadas)',
  })
  async getForgotten(
    @Query('limit') limit?: number,
    @Req() req?: Request,
  ) {
    const userId = this.getUserId(req as Request);
    return this.likesService.getForgottenLikes(
      userId,
      limit ? Number(limit) : 10,
    );
  }

  // GET /likes/radio (Mix dinámico basado en las favoritas del usuario)
  @Get('radio')
  @ApiOperation({ summary: 'Generar radio / mix basado en canciones favoritas' })
  async getRadio(
    @Query('limit') limit?: number,
    @Req() req?: Request,
  ) {
    const userId = this.getUserId(req as Request);
    return this.likesService.getLikedRadio(
      userId,
      limit ? Number(limit) : 20,
    );
  }

  // GET /likes (Devuelve canciones gustadas con soporte de paginación, búsqueda y filtros)
  @Get()
  @ApiOperation({
    summary: 'Obtener canciones gustadas (con paginación y búsqueda opcional)',
  })
  async getMyLikes(
    @Query() query: GetLikesQueryDto,
    @Req() req: Request,
  ) {
    const userId = this.getUserId(req);
    return this.likesService.getUserLikedTracks(userId, query);
  }

  // GET /likes/check/:youtubeId (Para pintar el icono de corazón al reproducir)
  @Get('check/:youtubeId')
  @ApiOperation({ summary: 'Comprobar si una canción concreta tiene Me Gusta' })
  async checkLike(@Param('youtubeId') youtubeId: string, @Req() req: Request) {
    const userId = this.getUserId(req);
    const isLiked = await this.likesService.isTrackLiked(userId, youtubeId);
    return { isLiked };
  }
}
