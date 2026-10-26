import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

export class GetSkipSegmentsQueryDto {
  @ApiPropertyOptional({
    description: 'YouTube Video ID (required if not passed in path)',
    example: 'dQw4w9WgXcQ',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  videoID?: string;

  @ApiPropertyOptional({
    description:
      'Categories to filter by (e.g. sponsor, music_offtopic, intro, outro). Can be repeated, comma-separated, or JSON string array.',
    example: ['sponsor', 'music_offtopic'],
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => transformToStringArray(value))
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({
    description:
      'Action types to filter by (e.g. skip, mute, poi, full, chapter)',
    example: ['skip'],
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => transformToStringArray(value))
  @IsArray()
  @IsString({ each: true })
  actionTypes?: string[];

  @ApiPropertyOptional({
    description: 'Segment UUIDs required even if below minimum votes',
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
}
