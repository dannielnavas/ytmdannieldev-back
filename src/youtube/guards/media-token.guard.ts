import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

@Injectable()
export class MediaTokenGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const queryToken = (req.query as { token?: string }).token;
    const bearer = req.headers.authorization ?? '';
    const token = queryToken || bearer.replace(/^Bearer\s+/i, '');

    if (!token) {
      throw new UnauthorizedException('Token de reproducción requerido');
    }

    try {
      (req as Request & { user?: unknown }).user =
        await this.jwtService.verifyAsync(token);
      return true;
    } catch {
      throw new UnauthorizedException('Token de reproducción inválido');
    }
  }
}