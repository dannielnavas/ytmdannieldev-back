import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import config from '../../../config.js';
import { Users } from '../../entities/user.entity.js';
import { YoutubeProfileData } from '../../../auth/services/auth/auth.service.js';

@Injectable()
export class UsersService {
  constructor(
    @Inject(config.KEY) private configService: ConfigType<typeof config>,
    @InjectRepository(Users) private userRepo: Repository<Users>,
  ) {}

  async create(data: YoutubeProfileData) {
    const existUser = data.youtube_channel_id
      ? await this.userRepo.findOne({
          where: {
            youtube_channel_id: data.youtube_channel_id,
          },
        })
      : data.email
        ? await this.userRepo.findOne({
            where: {
              email: data.email,
            },
          })
        : null;

    if (existUser) {
      this.userRepo.merge(existUser, {
        email: data.email,
        full_name: data.full_name,
        profile_image:
          data.profile_image ||
          (data.full_name
            ? `https://ui-avatars.com/api/?name=${encodeURIComponent(data.full_name)}`
            : existUser.profile_image),
        youtube_channel_id: data.youtube_channel_id,
        youtube_handle: data.youtube_handle,
        is_youtube_premium: data.is_youtube_premium,
        youtube_cookies: data.youtube_cookies,
        youtube_data: data.youtube_data,
        youtube_connected_at: data.youtube_cookies
          ? new Date()
          : existUser.youtube_connected_at,
      });
      return this.userRepo.save(existUser);
    }

    const newUser = this.userRepo.create({
      email: data.email,
      full_name: data.full_name,
      profile_image:
        data.profile_image ||
        (data.full_name
          ? `https://ui-avatars.com/api/?name=${encodeURIComponent(data.full_name)}`
          : undefined),
      youtube_channel_id: data.youtube_channel_id,
      youtube_handle: data.youtube_handle,
      is_youtube_premium: data.is_youtube_premium,
      youtube_cookies: data.youtube_cookies,
      youtube_data: data.youtube_data,
      youtube_connected_at: data.youtube_cookies ? new Date() : undefined,
    });
    return this.userRepo.save(newUser);
  }

  async findById(id: number) {
    const user = await this.userRepo.findOne({
      where: {
        user_id: id,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      email: user.email,
      full_name: user.full_name,
      profile_image: user.profile_image,
      youtube_handle: user.youtube_handle,
      is_youtube_premium: user.is_youtube_premium,
      youtube_connected_at: user.youtube_connected_at,
    };
  }

  async findByIdReturnYoutubeCookie(id: number) {
    const user = await this.userRepo.findOne({
      where: {
        user_id: id,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.youtube_cookies;
  }

  async findFirstYoutubeCookie(): Promise<string | null> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .where('user.youtube_cookies IS NOT NULL')
      .orderBy('user.youtube_connected_at', 'DESC')
      .getOne();
    return user?.youtube_cookies || null;
  }
}
