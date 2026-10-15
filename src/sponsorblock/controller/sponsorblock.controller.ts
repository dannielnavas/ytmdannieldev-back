import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator.js';
import { SponsorblockService } from '../services/sponsorblock.service.js';
import { GetSkipSegmentsQueryDto } from '../dtos/get-skip-segments-query.dto.js';
import { GetHashPrefixQueryDto } from '../dtos/get-hash-prefix-query.dto.js';
import { SubmitSegmentsDto } from '../dtos/submit-segments.dto.js';
import { VoteSegmentDto } from '../dtos/vote-segment.dto.js';
import { ViewedSegmentDto } from '../dtos/viewed-segment.dto.js';
import { UserInfoQueryDto } from '../dtos/user-info-query.dto.js';
import { UserStatsQueryDto } from '../dtos/user-stats-query.dto.js';
import { SegmentInfoQueryDto } from '../dtos/segment-info-query.dto.js';

@ApiTags('SponsorBlock')
@Controller('sponsorblock')
export class SponsorblockController {
  constructor(private readonly sponsorblockService: SponsorblockService) {}

  @Public()
  @Get('skip-segments')
  @ApiOperation({
    summary: 'Obtener segmentos a omitir por videoID (query param)',
    description:
      'Devuelve los segmentos (sponsors, intros, outros, music_offtopic, etc.) registrados para el video.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de segmentos encontrados (o vacío si no existen)',
  })
  async getSkipSegments(@Query() query: GetSkipSegmentsQueryDto) {
    if (!query.videoID) {
      throw new BadRequestException('videoID query parameter is required');
    }
    return this.sponsorblockService.getSkipSegments(query.videoID, query);
  }

  @Public()
  @Get('segments/:videoId')
  @ApiOperation({
    summary: 'Obtener segmentos a omitir por videoId (path param)',
    description:
      'Endpoint amigable para que el reproductor consulte los segmentos de una canción/video.',
  })
  @ApiParam({
    name: 'videoId',
    description: 'ID del video de YouTube',
    example: 'dQw4w9WgXcQ',
  })
  async getSegmentsByParam(
    @Param('videoId') videoId: string,
    @Query() query: GetSkipSegmentsQueryDto,
  ) {
    return this.sponsorblockService.getSkipSegments(videoId, query);
  }

  @Public()
  @Get('segments/hash/:prefix')
  @ApiOperation({
    summary: 'Obtener segmentos por prefijo SHA-256 (Modo de máxima privacidad)',
    description:
      'Consulta los segmentos usando los primeros 4-32 caracteres del hash sha256 del videoID.',
  })
  @ApiParam({
    name: 'prefix',
    description: 'Prefijo hexadecimal SHA-256 (mínimo 4 caracteres)',
    example: '1a2b',
  })
  async getSegmentsByHash(
    @Param('prefix') prefix: string,
    @Query() query: GetHashPrefixQueryDto,
  ) {
    return this.sponsorblockService.getSkipSegmentsByHashPrefix(prefix, query);
  }

  @Public()
  @Post('skip-segments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar nuevos segmentos a SponsorBlock',
    description: 'Permite reportar un nuevo segmento detectado en un video.',
  })
  async submitSegments(@Body() dto: SubmitSegmentsDto) {
    return this.sponsorblockService.submitSegments(dto);
  }

  @Public()
  @Post('vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Votar en un segmento de SponsorBlock',
    description:
      'Votar upvote (1), downvote (0), deshacer (20) o sugerir cambio de categoría.',
  })
  async voteOnSegment(@Body() dto: VoteSegmentDto) {
    return this.sponsorblockService.voteOnSegment(dto);
  }

  @Public()
  @Post('viewed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reportar que un segmento fue visualizado/omitido',
    description: 'Suma una visualización al segmento en las métricas de SponsorBlock.',
  })
  async recordView(@Body() dto: ViewedSegmentDto) {
    return this.sponsorblockService.recordView(dto);
  }

  @Public()
  @Get('user-info')
  @ApiOperation({
    summary: 'Obtener información de un usuario de SponsorBlock',
  })
  async getUserInfo(@Query() query: UserInfoQueryDto) {
    return this.sponsorblockService.getUserInfo(query);
  }

  @Public()
  @Get('user-stats')
  @ApiOperation({
    summary: 'Obtener estadísticas detalladas de un usuario',
  })
  async getUserStats(@Query() query: UserStatsQueryDto) {
    return this.sponsorblockService.getUserStats(query);
  }

  @Public()
  @Get('segment-info')
  @ApiOperation({
    summary: 'Obtener detalles de segmentos por UUIDs',
  })
  async getSegmentInfo(@Query() query: SegmentInfoQueryDto) {
    return this.sponsorblockService.getSegmentInfo(query.UUIDs);
  }

  @Public()
  @Get('lock-categories/:videoId')
  @ApiOperation({
    summary: 'Obtener categorías bloqueadas para un video',
  })
  @ApiParam({
    name: 'videoId',
    example: 'dQw4w9WgXcQ',
  })
  @ApiQuery({
    name: 'actionTypes',
    required: false,
    isArray: true,
  })
  async getLockCategories(
    @Param('videoId') videoId: string,
    @Query('actionTypes') actionTypes?: string[],
  ) {
    return this.sponsorblockService.getLockCategories(
      videoId,
      Array.isArray(actionTypes) ? actionTypes : actionTypes ? [actionTypes] : undefined,
    );
  }

  @Public()
  @Get('total-stats')
  @ApiOperation({
    summary: 'Obtener estadísticas globales de SponsorBlock',
  })
  async getTotalStats() {
    return this.sponsorblockService.getTotalStats();
  }

  @Public()
  @Get('days-saved')
  @ApiOperation({
    summary: 'Obtener días ahorrados globalmente en formato legible',
  })
  async getDaysSaved() {
    return this.sponsorblockService.getDaysSavedFormatted();
  }
}
