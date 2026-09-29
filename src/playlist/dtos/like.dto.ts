import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

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
}
