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

    if (username === this.metricsUser && password === this.metricsPass) {
      return true;
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Prometheus Metrics"');
    throw new UnauthorizedException('Invalid credentials for Prometheus metrics');
  }
}
