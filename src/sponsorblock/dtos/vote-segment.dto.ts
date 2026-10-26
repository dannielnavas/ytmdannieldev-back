import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class VoteSegmentDto {
  @ApiProperty({
    description: 'UUID of the segment being voted on',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  UUID: string;

  @ApiProperty({
    description:
      'Local userID of the voter (client generated string >= 30 chars)',
    example: 'a'.repeat(32),
  })
  @IsString()
  @IsNotEmpty()
  userID: string;

  @ApiPropertyOptional({
    description: 'Type of vote: 0 for downvote, 1 for upvote, 20 to undo vote',
    example: 1,
    enum: [0, 1, 20],
  })
  @IsOptional()
  @IsNumber()
  @IsIn([0, 1, 20])
  type?: number;

  @ApiPropertyOptional({
    description: 'Category to vote to change submission to',
    example: 'music_offtopic',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description:
      'Only required if provided UUID is a trimmed UUID to identify video',
    example: 'dQw4w9WgXcQ',
  })
  @IsOptional()
  @IsString()
  videoID?: string;
}
