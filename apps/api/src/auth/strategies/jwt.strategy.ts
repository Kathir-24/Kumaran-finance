import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RedisConnectionProvider } from '../../jobs/providers/redis-connection.provider';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import {
  isTokenIssuedBeforeRevocation,
  isTokenRevokedInRedis,
} from '../utils/token-revocation.util';

const USER_STATUS_CACHE_TTL_SECONDS = 120; // 2 minutes

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is missing');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException('Invalid token type for authorized request');
    }

    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());
    const cacheKey = `user:status:${payload.sub}`;

    // Fast Path 1: Check if user or client-family session has been revoked
    if (useRedis && redis) {
      try {
        if (await isTokenRevokedInRedis(redis, payload)) {
          throw new UnauthorizedException('Session terminated or token revoked. Please sign in again.');
        }
      } catch (err: any) {
        if (err instanceof UnauthorizedException) {
          throw err;
        }
        // Fall back to DB checks on cache read error
      }
    }

    // Fast Path 2: Check high-throughput Redis status cache (120s TTL)
    if (useRedis && redis) {
      try {
        const cachedStatus = await redis.get(cacheKey);
        if (cachedStatus === 'ACTIVE') {
          return payload;
        }
        if (cachedStatus === 'INACTIVE') {
          throw new UnauthorizedException('User account is deactivated or no longer exists');
        }
      } catch (err: any) {
        if (err instanceof UnauthorizedException) {
          throw err;
        }
        // Fall back to PostgreSQL on cache read error
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, isPartner: true, tokenRevokedBefore: true, roles: true },
    });

    if (!user || !user.isActive) {
      if (payload.roles?.includes(Role.CUSTOMER)) {
        const customer = await this.prisma.customer.findUnique({
          where: { id: payload.sub },
          select: { id: true, tokenRevokedBefore: true },
        });
        if (customer) {
          if (
            customer.tokenRevokedBefore &&
            isTokenIssuedBeforeRevocation(payload, customer.tokenRevokedBefore.getTime().toString())
          ) {
            throw new UnauthorizedException('Session terminated or token revoked. Please sign in again.');
          }
          if (useRedis && redis) {
            await redis.set(cacheKey, 'ACTIVE', 'EX', USER_STATUS_CACHE_TTL_SECONDS).catch(() => {});
          }
          return payload;
        }
      }

      if (useRedis && redis) {
        await redis.set(cacheKey, 'INACTIVE', 'EX', USER_STATUS_CACHE_TTL_SECONDS).catch(() => {});
      }
      throw new UnauthorizedException('User account is deactivated or no longer exists');
    }

    if (
      user.tokenRevokedBefore &&
      isTokenIssuedBeforeRevocation(payload, user.tokenRevokedBefore.getTime().toString())
    ) {
      throw new UnauthorizedException('Session terminated or credentials updated. Please sign in again.');
    }

    payload.roles = user.roles;
    payload.isPartner = user.isPartner;

    if (useRedis && redis) {
      await redis.set(cacheKey, 'ACTIVE', 'EX', USER_STATUS_CACHE_TTL_SECONDS).catch(() => {});
    }

    return payload;
  }
}

