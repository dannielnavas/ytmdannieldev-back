import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ViewedSegmentDto {
  @ApiProperty({
    description: 'UUID of the segment that was viewed/skipped',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  UUID: string;
}
