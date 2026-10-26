import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ToggleLikeDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'YouTube video/track ID' })
  readonly youtubeId: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Track title' })
  readonly title: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Artist name' })
  readonly artist: string;

  @IsNumber()
  @IsNotEmpty()
  @ApiProperty({ description: 'Duration in seconds' })
  readonly duration: number;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Thumbnail URL', required: false })
  readonly thumbnailUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Album name', required: false })
  readonly album?: string;
}

export class GetLikesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ description: 'Items per page', default: 30 })
  limit?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Search term for title or artist' })
  search?: string;

  @IsOptional()
  @IsIn(['likedAt', 'title', 'artist', 'duration'])
  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: ['likedAt', 'title', 'artist', 'duration'],
    default: 'likedAt',
  })
  sortBy?: 'likedAt' | 'title' | 'artist' | 'duration';

  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
  })
  order?: 'ASC' | 'DESC' | 'asc' | 'desc';
}

export class CheckLikesBulkDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  @ApiProperty({
    description: 'List of YouTube IDs to check',
    type: [String],
  })
  readonly youtubeIds: string[];
}
