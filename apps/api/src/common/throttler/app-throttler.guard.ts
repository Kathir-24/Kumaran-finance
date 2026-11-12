import { Inject, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  getOptionsToken,
  getStorageToken,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { normalizeClientIp } from '../context/proxy-ip.util';

/**
 * Bank-Grade AppThrottlerGuard:
 * Resolves the "Branch Office NAT Collision" problem where multiple partners,
 * accountants, and field staff share a single office broadband router IP.
 *
 * For authenticated requests (Cryptographically verified Bearer JWT): tracks by `usr_<userId>`.
 * For public/unauthenticated requests (Login, OTP request): strictly tracks by `ip:<normalizedIp>`.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storageService: ThrottlerStorage,
    reflector: Reflector,
    @Optional() private readonly jwtService?: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  private async resolveIpTracker(req: Record<string, any>): Promise<string> {
    const normalizedIp = normalizeClientIp(
      req.ip || req.ips?.[0] || req.socket?.remoteAddress,
    );
    if (normalizedIp) {
      return `ip:${normalizedIp}`;
    }
    return super.getTracker(req);
  }

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const url = req.originalUrl || req.url || '';
    const isPublicAuthRoute =
      url.includes('/auth/web/login') ||
      url.includes('/auth/web/verify-totp') ||
      url.includes('/auth/mobile/login-mpin') ||
      url.includes('/auth/mobile/request-otp') ||
      url.includes('/auth/mobile/verify-otp');

    // Public authentication endpoints MUST ALWAYS be throttled by client IP to prevent brute-forcing
    if (isPublicAuthRoute) {
      return this.resolveIpTracker(req);
    }

    // 1. If req.user is already populated
    if (req.user?.sub) {
      return `usr_${req.user.sub}`;
    }

    // 2. Cryptographically verify Bearer token (rejects forged/untrusted tokens)
    const authHeader = req.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ') && this.jwtService) {
      try {
        const token = authHeader.slice(7).trim();
        const verified = this.jwtService.verify(token) as { sub?: string } | null;
        if (verified?.sub) {
          return `usr_${verified.sub}`;
        }
      } catch {
        // Fall back to IP on invalid / forged / expired token
      }
    }

    // 3. Fallback to client IP address (public or unauthenticated calls)
    return this.resolveIpTracker(req);
  }
}
