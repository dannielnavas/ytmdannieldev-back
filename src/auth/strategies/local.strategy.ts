import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../services/auth/auth.service.js';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private authService: AuthService) {
    // TODO: llamar al constructor de la clase que se extiende
    super({ usernameField: 'email', passwordField: 'password' });
  }

  async validate(email: string, password: string) {
    // const user = await this.authService.validateUser(email, password);
    // if (!user) {
    //   return new UnauthorizedException('Invalid credentials');
    // }
    return 'user';
  }
}
