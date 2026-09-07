import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guard/jwt-auth/jwt-auth.guard.js';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from '../../services/users/users.service.js';
import {
  ChangePasswordDto,
  CreateUserDto,
  UpdateUserDto,
} from '../../dtos/user.dto.js';
import { Public } from '../../../auth/decorators/public.decorator.js';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Public()
  create(@Body() payload: CreateUserDto) {
    return this.usersService.create(payload);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateUserDto,
  ) {
    return this.usersService.update(id, payload);
  }

  @Post(':id/change-password')
  changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(
      id,
      payload.current_password,
      payload.new_password,
    );
  }
}
