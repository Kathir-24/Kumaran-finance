// ==============================================================================
// Kumaran Chits — Prometheus Metrics Basic Authentication Guard
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/security-and-access-guardians.md (§2)
// ==============================================================================

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';

@Injectable()
export class MetricsAuthGuard implements CanActivate {
  private readonly metricsUser: string;
  private readonly metricsPass: string;

  constructor(private readonly configService: ConfigService) {
    this.metricsUser =
      this.configService.get<string>('METRICS_USER') ||
      this.configService.get<string>('BULL_BOARD_USER') ||
      'admin';
    this.metricsPass =
      this.configService.get<string>('METRICS_PASSWORD') ||
      this.configService.get<string>('BULL_BOARD_PASSWORD') ||
      'chitflow_secret';
  }

  canActivate(context: ExecutionContext): boolean {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (
      nodeEnv === 'production' &&
      (!this.metricsUser || !this.metricsPass || this.metricsPass === 'chitflow_secret')
    ) {
      throw new UnauthorizedException(
        'Prometheus metrics authentication misconfigured: Production credentials required',
      );
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Prometheus Metrics"');
      throw new UnauthorizedException('Authentication required for Prometheus metrics');
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // Bank-Grade Security: Constant-time comparison to prevent side-channel timing attacks
    const expectedUserBuf = crypto.createHash('sha256').update(this.metricsUser).digest();
    const actualUserBuf = crypto.createHash('sha256').update(username || '').digest();
    const expectedPassBuf = crypto.createHash('sha256').update(this.metricsPass).digest();
    const actualPassBuf = crypto.createHash('sha256').update(password || '').digest();

    const userMatches = crypto.timingSafeEqual(expectedUserBuf, actualUserBuf);
    const passMatches = crypto.timingSafeEqual(expectedPassBuf, actualPassBuf);

    if (userMatches && passMatches) {
      return true;
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Prometheus Metrics"');
    throw new UnauthorizedException('Invalid credentials for Prometheus metrics');
  }
}
