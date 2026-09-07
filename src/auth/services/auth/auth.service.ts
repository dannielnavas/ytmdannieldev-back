import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Users } from '../../../users/entities/user.entity.js';
import { Token } from '../../models/token.model.js';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../../../users/services/users/users.service.js';

@Injectable()
export class AuthService {
  constructor(
    private usersServices: UsersService,
    private jwtServices: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersServices.findOneByEmail(email);
    if (user) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        const { password, ...result } = user;
        return result;
      }
    }
    return null;
  }

  generateJWT(user: Users) {
    // TODO: el sub es un idetificador unico del usuario
    const payload: Token = { role: user.role, sub: user.user_id };
    return {
      access_token: this.jwtServices.sign(payload),
      user,
    };
  }
}
