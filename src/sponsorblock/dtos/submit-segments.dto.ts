import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SegmentSubmissionItemDto {
  @ApiProperty({
    description: '[startTime, endTime] in seconds',
    example: [12.5, 45.2],
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  segment: [number, number];

  @ApiProperty({
    description:
      'Category (sponsor, intro, outro, interaction, selfpromo, music_offtopic, preview, etc.)',
    example: 'music_offtopic',
  })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({
    description: 'Action type (skip, mute, poi, full, chapter)',
    default: 'skip',
    example: 'skip',
  })
  @IsOptional()
  @IsString()
  actionType?: string;

  @ApiPropertyOptional({
    description: 'Chapter title for chapters; empty string otherwise',
    example: '',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class SubmitSegmentsDto {
  @ApiProperty({
    description: 'YouTube Video ID',
    example: 'dQw4w9WgXcQ',
  })
  @IsString()
  @IsNotEmpty()
  videoID: string;

  @ApiProperty({
    description:
      'Randomly generated local userID stored on client (minimum 30 chars)',
    example: 'a'.repeat(32),
  })
  @IsString()
  @MinLength(30)
  userID: string;

  @ApiPropertyOptional({
    description: 'User Agent ("ClientName/Version")',
    example: 'ytmdannieldev/1.0.0',
  })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({
    description: 'Service provider (default: YouTube)',
    default: 'YouTube',
  })
  @IsOptional()
  @IsString()
  service?: string;

  @ApiPropertyOptional({
    description: 'Duration of video in seconds',
    example: 213.5,
  })
  @IsOptional()
  @IsNumber()
  videoDuration?: number;

  @ApiProperty({
    description: 'List of segments to submit',
    type: [SegmentSubmissionItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SegmentSubmissionItemDto)
  segments: SegmentSubmissionItemDto[];
}
