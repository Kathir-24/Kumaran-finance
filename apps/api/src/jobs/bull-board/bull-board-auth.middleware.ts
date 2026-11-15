// ==============================================================================
// Kumaran Chits — Bull Board Super Admin Session Authentication Middleware
// Company: Kumaran Finance (Perundurai, Erode, Tamil Nadu)
// Compliance: docs/01-business/permissions-matrix.md (§1, §2) & F11 Remediation
// Restricts BullMQ visual dashboard strictly to active Super Admin JWT sessions
// ==============================================================================

import { Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisConnectionProvider } from '../providers/redis-connection.provider';

@Injectable()
export class BullBoardAuthMiddleware implements NestMiddleware {
  private readonly jwtService: JwtService;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {
    this.jwtService = new JwtService({
      secret: this.configService.get<string>('JWT_SECRET') || 'default_jwt_secret',
    });
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // 1. Primary: Verify active Super Admin JWT session (Bearer header, ?token= param, or cookie)
    const token = this.extractToken(req);

    if (token) {
      try {
        const payload: JwtPayload = this.jwtService.verify(token, {
          secret: this.configService.get<string>('JWT_SECRET'),
        });

        if (payload.tokenType !== 'access') {
          this.sendForbidden(res, 'Access denied: Must supply a valid access token');
          return;
        }

        if (!payload.roles?.includes(Role.SUPER_ADMIN)) {
          this.sendForbidden(
            res,
            'Access denied: Bull Board Queue Monitor requires Super Admin role',
          );
          return;
        }

        // Fast-path / DB assertion: verify user is active and token not revoked
        const isRevoked = await this.isUserRevokedOrInactive(payload);
        if (isRevoked) {
          this.sendUnauthorized(res, 'Session revoked or user deactivated');
          return;
        }

        (req as any).user = payload;
        next();
        return;
      } catch {
        // Token verification failed; fall through to evaluate explicitly configured Basic credentials
      }
    }

    // 2. Secondary: Fallback to Basic Auth ONLY IF explicitly configured with non-default credentials
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      const allowed = this.verifyBasicAuth(authHeader);
      if (allowed) {
        next();
        return;
      }
    }

    this.sendUnauthorized(
      res,
      'Authentication required: Active Super Admin session required to access Bull Board Queue Monitor',
    );
  }

  private extractToken(req: Request): string | null {
    // 1. Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }

    // 2. Query param: ?token=<token>
    if (req.query && typeof req.query.token === 'string') {
      return req.query.token.trim();
    }

    // 3. Parsed cookies (cookie-parser)
    const cookies = (req as any).cookies;
    if (cookies) {
      if (cookies.access_token) return cookies.access_token;
      if (cookies.jwt) return cookies.jwt;
    }

    // 4. Raw Cookie header fallback
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)(?:access_token|jwt)=([^;]+)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }

    return null;
  }

  private async isUserRevokedOrInactive(payload: JwtPayload): Promise<boolean> {
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());

    if (useRedis && redis && payload.iat) {
      try {
        const revokedBeforeStr = await redis.get(`auth:revoked:${payload.sub}`);
        if (revokedBeforeStr) {
          const revokedBefore = parseInt(revokedBeforeStr, 10);
          if (payload.iat * 1000 < revokedBefore) {
            return true;
          }
        }
      } catch {
        // Fallback to database check
      }
    }

    if (this.prisma) {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { isActive: true, tokenRevokedBefore: true },
      });

      if (!user || !user.isActive) {
        return true;
      }

      if (user.tokenRevokedBefore && payload.iat) {
        if (payload.iat * 1000 < user.tokenRevokedBefore.getTime()) {
          return true;
        }
      }
    }

    return false;
  }

  private verifyBasicAuth(authHeader: string): boolean {
    const configuredUser = this.configService.get<string>('BULL_BOARD_USER');
    const configuredPass = this.configService.get<string>('BULL_BOARD_PASSWORD');

    // Never accept empty or default credentials in any environment (F11)
    if (!configuredUser || !configuredPass || configuredPass === 'chitflow_secret') {
      return false;
    }

    const base64Credentials = authHeader.split(' ')[1];
    if (!base64Credentials) return false;
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, ...passParts] = credentials.split(':');
    const password = passParts.join(':');

    const expectedUserBuf = crypto.createHash('sha256').update(configuredUser).digest();
    const actualUserBuf = crypto.createHash('sha256').update(username || '').digest();
    const expectedPassBuf = crypto.createHash('sha256').update(configuredPass).digest();
    const actualPassBuf = crypto.createHash('sha256').update(password || '').digest();

    return (
      crypto.timingSafeEqual(expectedUserBuf, actualUserBuf) &&
      crypto.timingSafeEqual(expectedPassBuf, actualPassBuf)
    );
  }

  private sendUnauthorized(res: Response, message: string): void {
    res.setHeader('WWW-Authenticate', 'Basic realm="Kumaran Chits Queue Monitor"');
    const msg = message || 'Authentication required to access Bull Board Queue Monitor';
    if (typeof (res as any).json === 'function') {
      res.status(401).json({
        statusCode: 401,
        error: 'Unauthorized',
        message: msg,
      });
    } else if (typeof res.send === 'function') {
      res.status(401).send(msg);
    }
  }

  private sendForbidden(res: Response, message: string): void {
    if (typeof (res as any).json === 'function') {
      res.status(403).json({
        statusCode: 403,
        error: 'Forbidden',
        message,
      });
    } else if (typeof res.send === 'function') {
      res.status(403).send(message);
    }
  }
}
