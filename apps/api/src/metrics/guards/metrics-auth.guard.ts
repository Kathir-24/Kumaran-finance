// ==============================================================================
// Kumaran Chits — Prometheus Metrics Authentication Guard (Bearer + Basic Auth)
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/security-and-access-guardians.md (§2, §7.10)
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

const INSECURE_DEFAULT_SECRET = 'chitflow_secret';

@Injectable()
export class MetricsAuthGuard implements CanActivate {
  private readonly rawBearerToken: string | null;
  private readonly rawMetricsUser: string | null;
  private readonly rawMetricsPass: string | null;

  constructor(private readonly configService: ConfigService) {
    const bearer = this.configService.get<string>('METRICS_BEARER_TOKEN');
    this.rawBearerToken =
      typeof bearer === 'string' && bearer.trim().length > 0 ? bearer.trim() : null;

    const user =
      this.configService.get<string>('METRICS_USER') ||
      this.configService.get<string>('BULL_BOARD_USER') ||
      null;
    const pass =
      this.configService.get<string>('METRICS_PASSWORD') ||
      this.configService.get<string>('BULL_BOARD_PASSWORD') ||
      null;

    this.rawMetricsUser =
      typeof user === 'string' && user.trim().length > 0 ? user.trim() : null;
    this.rawMetricsPass =
      typeof pass === 'string' && pass.trim().length > 0 ? pass : null;
  }

  /**
   * Constant-time string comparison using SHA-256 digests and crypto.timingSafeEqual.
   * Hashing both inputs guarantees equal 32-byte buffer lengths, preventing length-oracle
   * timing leaks and RangeError exceptions.
   */
  private timingSafeStringEqual(expected: string, actual: string): boolean {
    const expectedBuf = crypto.createHash('sha256').update(expected, 'utf8').digest();
    const actualBuf = crypto.createHash('sha256').update(actual, 'utf8').digest();
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }

  private isStrictEnv(nodeEnv?: string | null): boolean {
    const normalized = (nodeEnv || '').trim().toLowerCase();
    return normalized !== 'development' && normalized !== 'test';
  }

  canActivate(context: ExecutionContext): boolean {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const strictEnv = this.isStrictEnv(nodeEnv);

    // Determine active, non-default auth credentials for the current environment
    const activeBearerToken =
      this.rawBearerToken &&
      (!strictEnv || this.rawBearerToken !== INSECURE_DEFAULT_SECRET)
        ? this.rawBearerToken
        : null;

    // Never enable dev Basic Auth default fallback when a Bearer token is configured or in non-dev/test envs
    const allowDevBasicFallback = !strictEnv && !activeBearerToken;
    const effectiveUser =
      this.rawMetricsUser ?? (allowDevBasicFallback ? 'admin' : null);
    const effectivePass =
      this.rawMetricsPass ??
      (allowDevBasicFallback ? INSECURE_DEFAULT_SECRET : null);

    const hasValidBasicAuth = Boolean(
      effectiveUser &&
        effectivePass &&
        (!strictEnv || effectivePass.trim() !== INSECURE_DEFAULT_SECRET),
    );
    const hasValidBearerAuth = Boolean(activeBearerToken);

    // Fail closed in production/staging if neither a strong bearer token nor strong Basic credentials exist
    if (strictEnv && !hasValidBearerAuth && !hasValidBasicAuth) {
      throw new UnauthorizedException(
        'Prometheus metrics authentication misconfigured: Production credentials required',
      );
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const challengeHeader =
      hasValidBearerAuth && !hasValidBasicAuth
        ? 'Bearer realm="Prometheus Metrics"'
        : 'Basic realm="Prometheus Metrics"';

    const authHeader = req.headers?.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      res.setHeader('WWW-Authenticate', challengeHeader);
      throw new UnauthorizedException('Authentication required for Prometheus metrics');
    }

    // 1. Bearer Token Authentication (METRICS_BEARER_TOKEN)
    const bearerMatch = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
    if (bearerMatch) {
      if (!activeBearerToken) {
        res.setHeader('WWW-Authenticate', challengeHeader);
        throw new UnauthorizedException('Bearer authentication is not enabled for Prometheus metrics');
      }

      const providedToken = bearerMatch[1];
      if (this.timingSafeStringEqual(activeBearerToken, providedToken)) {
        return true;
      }

      res.setHeader('WWW-Authenticate', challengeHeader);
      throw new UnauthorizedException('Invalid bearer token for Prometheus metrics');
    }

    // 2. HTTP Basic Authentication (METRICS_USER / METRICS_PASSWORD)
    const basicMatch = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(authHeader.trim());
    if (basicMatch) {
      if (!hasValidBasicAuth || !effectiveUser || !effectivePass) {
        res.setHeader('WWW-Authenticate', challengeHeader);
        throw new UnauthorizedException('Basic authentication is not enabled for Prometheus metrics');
      }

      const credentials = Buffer.from(basicMatch[1], 'base64').toString('utf8');
      // RFC 7617: split on the FIRST colon only so passwords may contain ':' characters
      const colonIndex = credentials.indexOf(':');
      if (colonIndex === -1) {
        res.setHeader('WWW-Authenticate', challengeHeader);
        throw new UnauthorizedException('Malformed Basic credentials for Prometheus metrics');
      }

      const username = credentials.slice(0, colonIndex);
      const password = credentials.slice(colonIndex + 1);

      const userMatches = this.timingSafeStringEqual(effectiveUser, username);
      const passMatches = this.timingSafeStringEqual(effectivePass, password);

      if (userMatches && passMatches) {
        return true;
      }

      res.setHeader('WWW-Authenticate', challengeHeader);
      throw new UnauthorizedException('Invalid credentials for Prometheus metrics');
    }

    res.setHeader('WWW-Authenticate', challengeHeader);
    throw new UnauthorizedException('Authentication required for Prometheus metrics');
  }
}
