import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsEmail()
  @IsOptional()
  @ApiProperty({ description: 'The email of the User.', required: false })
  readonly email?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'The full name of the User.', required: false })
  readonly full_name?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The profile image of the User.',
    required: false,
  })
  readonly profile_image?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'YouTube session cookies (e.g. HSID, SSID, APISID, SAPISID, etc.)',
    required: false,
  })
  readonly youtube_cookies?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'YouTube Channel ID',
    required: false,
  })
  readonly youtube_channel_id?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'YouTube Handle (e.g. @username)',
    required: false,
  })
  readonly youtube_handle?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Indicates if user has YouTube Music Premium',
    required: false,
  })
  readonly is_youtube_premium?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Indicates if user is authenticated with YouTube',
    required: false,
  })
  readonly is_authenticated?: boolean;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Extra YouTube account and session metadata',
    required: false,
  })
  readonly youtube_data?: Record<string, any>;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UpdateYoutubeCookiesDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'YouTube session cookies string',
    example: 'HSID=AkfmcdTOSacWt-vcP; SSID=Ade2HLHqJ4Do8qoEh; ...',
  })
  readonly youtube_cookies: string;
}

export class SyncYoutubeSessionDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'YouTube session cookies string',
    example: 'HSID=AkfmcdTOSacWt-vcP; SSID=Ade2HLHqJ4Do8qoEh; ...',
  })
  readonly youtube_cookies: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'YouTube Channel ID',
    required: false,
  })
  readonly youtube_channel_id?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'YouTube Channel / User display name',
    required: false,
  })
  readonly youtube_channel_title?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'YouTube Handle',
    required: false,
  })
  readonly youtube_handle?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Is YouTube Music Premium user',
    required: false,
  })
  readonly is_youtube_premium?: boolean;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Extra YouTube metadata (avatarUrl, account switcher, etc.)',
    required: false,
  })
  readonly youtube_data?: Record<string, any>;
}
