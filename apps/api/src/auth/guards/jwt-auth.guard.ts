import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: any, user: any, info: any): TUser {
    if (err || !user) {
      const message = info?.message ?? 'Authentication credentials missing or invalid';
      throw err || new UnauthorizedException(message);
    }
    return user;
  }
}
