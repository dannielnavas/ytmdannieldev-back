import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UserStatsQueryDto {
  @ApiPropertyOptional({
    description: 'Local UserID of the user',
    example: 'a'.repeat(32),
  })
  @IsOptional()
  @IsString()
  userID?: string;

  @ApiPropertyOptional({
    description: 'Public UserID of the user',
    example: 'b'.repeat(64),
  })
  @IsOptional()
  @IsString()
  publicUserID?: string;

  @ApiPropertyOptional({
    description: 'Include category breakdown stats',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === 1 || value === '1')
  @IsBoolean()
  fetchCategoryStats?: boolean;

  @ApiPropertyOptional({
    description: 'Include action type breakdown stats',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === 1 || value === '1')
  @IsBoolean()
  fetchActionTypeStats?: boolean;
}
