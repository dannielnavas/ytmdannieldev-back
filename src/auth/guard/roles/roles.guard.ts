import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { ERoles } from '../../models/roles.model.js';
import { ROLE_KEY } from '../../decorators/roles.decorator.js';
import { Token } from '../../models/token.model.js';

@Injectable()
//TODO: implement implementa una interfaz extends hereda
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const roles: ERoles[] = this.reflector.get<ERoles[]>(
      ROLE_KEY,
      context.getHandler(),
    );
    if (!roles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as Token;
    // TODO: some busca uno por uno los valores del array y si encuentra uno que cumpla con la condicion retorna true
    const isAuth = roles.some((role) => role === user.role);
    if (!isAuth) {
      throw new UnauthorizedException(
        'No tienes permisos para realizar esta accion',
      );
    }
    return isAuth;
  }
}
