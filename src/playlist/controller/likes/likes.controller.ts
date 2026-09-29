import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { LikesService } from '../../services/likes/likes.service.js';

interface YoutubeTrackInput {
  youtubeId: string;
  title: string;
  artist: string;
  duration: number;
  thumbnailUrl?: string;
}

@Controller('likes')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  // POST /likes/toggle
  @Post('toggle')
  async toggle(@Body() trackData: YoutubeTrackInput, @Req() req: any) {
    const userId = req.user.id; // Asumiendo middleware/guard de autenticación
    return this.likesService.toggleLike(userId, trackData);
  }

  // GET /likes (Devuelve todas las canciones gustadas para reproducir en cola)
  @Get()
  async getMyLikes(@Req() req: any) {
    const userId = req.user.id;
    return this.likesService.getUserLikedTracks(userId);
  }

  // GET /likes/check/:youtubeId (Para pintar el icono de corazón al reproducir)
  @Get('check/:youtubeId')
  async checkLike(@Param('youtubeId') youtubeId: string, @Req() req: any) {
    const userId = req.user.id;
    const isLiked = await this.likesService.isTrackLiked(userId, youtubeId);
    return { isLiked };
  }
}
