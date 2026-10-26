import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

function transformToStringArray(value: any): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        // Fallback to comma split
      }
    }
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(value)];
}

export class GetHashPrefixQueryDto {
  @ApiPropertyOptional({
    description:
      'First 4-32 characters of the SHA-256 hash of the videoID (4 recommended)',
    example: '1a2b',
  })
  @IsOptional()
  @IsString()
  prefix?: string;

  @ApiPropertyOptional({
    description: 'Categories to filter by',
    type: [String],
    example: ['sponsor', 'music_offtopic'],
  })
  @IsOptional()
  @Transform(({ value }) => transformToStringArray(value))
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({
    description: 'Action types to filter by',
    type: [String],
    example: ['skip'],
  })
  @IsOptional()
  @Transform(({ value }) => transformToStringArray(value))
  @IsArray()
  @IsString({ each: true })
  actionTypes?: string[];

  @ApiPropertyOptional({
    description: 'Required segment UUIDs to retrieve',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => transformToStringArray(value))
  @IsArray()
  @IsString({ each: true })
  requiredSegments?: string[];

  @ApiPropertyOptional({
    description: 'Service provider (default: YouTube)',
    example: 'YouTube',
  })
  @IsOptional()
  @IsString()
  service?: string;

  @ApiPropertyOptional({
    description: 'Trim UUIDs to reduce bandwidth',
    example: false,
  })
  @IsOptional()
  @Transform(
    ({ value }) =>
      value === 'true' || value === true || value === 1 || value === '1',
  )
  @IsBoolean()
  trimUUIDs?: boolean;
}
