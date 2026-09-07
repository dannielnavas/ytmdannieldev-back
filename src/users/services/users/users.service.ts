import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import config from '../../../config.js';
import { Users } from '../../entities/user.entity.js';
import { CreateUserDto, UpdateUserDto } from '../../dtos/user.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @Inject(config.KEY) private configService: ConfigType<typeof config>,
    @InjectRepository(Users) private userRepo: Repository<Users>,
    // private emailsService: EmailsService,
  ) {}
  async create(data: CreateUserDto) {
    const user = await this.userRepo.findOne({
      where: { email: data.email },
    });
    if (user) {
      throw new BadRequestException('User already exists');
    }
    const hashPassword = await bcrypt.hashSync(data.password, 10);
    const newUser = this.userRepo.create({
      ...data,
      password: hashPassword,
      role: 'user',
      profile_image:
        data.profile_image ||
        'https://ui-avatars.com/api/?name=' + data.full_name,
    });
    // await this.emailsService.sendEmail(
    //   newUser.email,
    //   'Welcome to Focus Loop',
    //   newUser.full_name,
    // );
    return this.userRepo.save(newUser);
  }

  async findOneByEmail(email: string) {
    const user = await this.userRepo.findOne({
      where: { email },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findOne(id: number) {
    const user = await this.userRepo.findOne({
      where: { user_id: id },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async update(id: number, data: UpdateUserDto) {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (data.email && data.email !== user.email) {
      const existing = await this.userRepo.findOne({
        where: { email: data.email },
      });
      if (existing) {
        throw new BadRequestException('Email already in use');
      }
    }

    const { subscription_plan_id, ...rest } = data;

    // if (subscription_plan_id) {
    //   user.subscriptionPlan = { subscription_plan_id } as any;
    // }

    this.userRepo.merge(user, rest);
    return this.userRepo.save(user);
  }

  async changePassword(id: number, currentPass: string, newPass: string) {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isMatch = await bcrypt.compare(currentPass, user.password);
    if (!isMatch) {
      throw new BadRequestException('Current password does not match');
    }

    const hashPassword = await bcrypt.hashSync(newPass, 10);
    user.password = hashPassword;
    await this.userRepo.save(user);
    return { message: 'Password changed successfully' };
  }
}
