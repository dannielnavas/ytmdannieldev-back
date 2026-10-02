import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guard/jwt-auth/jwt-auth.guard.js';
import { Token } from '../../auth/models/token.model.js';
import { DashboardQueryDto } from '../dtos/dashboard-query.dto.js';
import { DashboardService } from '../services/dashboard.service.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private getUserId(req: Request): number {
    const user = (req as any).user as Token;
    const userId = user?.sub ?? (user as any)?.id;
    if (!userId) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    return Number(userId);
  }

  @Get()
  @ApiOperation({
    summary:
      'Obtener vista de dashboard con convivencia híbrida (Personal + YouTube)',
    description:
      'Si el usuario tiene canciones con like, prioriza el dashboard personal enriquecido con Last.fm y adjunta el feed de YouTube como secundario. Si no tiene likes, activa la vista principal de YouTube Music.',
  })
  async getDashboard(
    @Req() req: Request,
    @Query() query: DashboardQueryDto,
  ) {
    const userId = this.getUserId(req);
    return this.dashboardService.getDashboard(userId, {
      includeYoutube: query.includeYoutube,
      refresh: query.refresh,
    });
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Alias de /dashboard para consulta de estado y métricas',
  })
  async getSummary(
    @Req() req: Request,
    @Query() query: DashboardQueryDto,
  ) {
    const userId = this.getUserId(req);
    return this.dashboardService.getDashboard(userId, {
      includeYoutube: query.includeYoutube,
      refresh: query.refresh,
    });
  }

  @Get('personal')
  @ApiOperation({
    summary: 'Obtener únicamente las estadísticas personales y Last.fm',
  })
  async getPersonal(@Req() req: Request) {
    const userId = this.getUserId(req);
    return this.dashboardService.getPersonalDashboard(userId);
  }
}
