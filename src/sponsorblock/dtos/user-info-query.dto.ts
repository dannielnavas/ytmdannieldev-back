import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';

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
        // Fallback
      }
    }
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [String(value)];
}

export class UserInfoQueryDto {
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
    description: 'Values to retrieve from userInfo',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => transformToStringArray(value))
  @IsArray()
  @IsString({ each: true })
  values?: string[];
}
