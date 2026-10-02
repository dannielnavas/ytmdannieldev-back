import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({
    description:
      'Incluir secciones de YouTube Music en la respuesta (por defecto true)',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return true;
    return value === 'true' || value === true || value === '1';
  })
  @IsBoolean()
  includeYoutube?: boolean = true;

  @ApiPropertyOptional({
    description:
      'Forzar refresco omitiendo caché para YouTube Music',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === '1')
  @IsBoolean()
  refresh?: boolean = false;
}
