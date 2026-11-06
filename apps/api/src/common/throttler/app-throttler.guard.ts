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

/**
 * Bank-Grade AppThrottlerGuard:
 * Resolves the "Branch Office NAT Collision" problem where multiple partners,
 * accountants, and field staff share a single office broadband router IP.
 *
 * For authenticated requests (Bearer JWT): tracks by `usr_<userId>`.
 * For public/unauthenticated requests (Login, OTP request): tracks by `ip:<normalizedIp>`.
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

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    // 1. If req.user is already populated
    if (req.user?.sub) {
      return `usr_${req.user.sub}`;
    }

    // 2. Inspect Bearer Authorization header to isolate authenticated staff/customers
    const authHeader = req.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ') && this.jwtService) {
      try {
        const token = authHeader.slice(7).trim();
        const decoded = this.jwtService.decode(token) as { sub?: string } | null;
        if (decoded?.sub) {
          return `usr_${decoded.sub}`;
        }
      } catch {
        // Fall back to IP on invalid / malformed token
      }
    }

    // 3. Fallback to client IP address (public or unauthenticated calls)
    return super.getTracker(req);
  }
}
