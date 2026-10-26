import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

function transformToStringArray(value: any): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        // Fallback
      }
    }
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(value)];
}

export class SegmentInfoQueryDto {
  @ApiProperty({
    description: 'Array or comma-separated list of segment UUIDs (max 10)',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @Transform(({ value }) => transformToStringArray(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  UUIDs: string[];
}
