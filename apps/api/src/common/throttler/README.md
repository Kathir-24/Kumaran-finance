# Common Throttler Module

> **Package**: `@kumaran/api` (NestJS Modular Monolith)  
> **Location**: `apps/api/src/common/throttler/`  
> **Master Architecture Spec**: [`docs/03-architecture/rate-limiting-and-abuse-prevention.md`](../../../../../docs/03-architecture/rate-limiting-and-abuse-prevention.md)

---

## Overview

This module provides distributed, NAT-safe rate-limiting and anti-abuse enforcement for Kumaran Chits:

1. **`RedisThrottlerStorage`** (`redis-throttler-storage.service.ts`):
   - Implements NestJS `ThrottlerStorage` via an atomic Redis Lua script.
   - Redis key namespace: `throttle:<throttlerName>:<key>`.
   - Redis block namespace: `throttle:block:<throttlerName>:<key>`.
   - Automatic fail-closed in-memory fallback store (`Map<string, MemoryRecord>`) if Redis is offline or disconnected.

2. **`AppThrottlerGuard`** (`app-throttler.guard.ts`):
   - Extends NestJS `ThrottlerGuard` and resolves the Perundurai Head Office shared-NAT collision problem by overriding `getTracker(req)`.
   - Tracks authenticated requests by `usr_<userId>` from `req.user.sub` or a **cryptographically verified Bearer JWT** (rejecting forged/unverified tokens so attackers cannot spoof user buckets).
   - Tracks unauthenticated/public requests (login, OTP) strictly by `ip:<normalizedIp>` using `normalizeClientIp` (`apps/api/src/common/context/proxy-ip.util.ts`) honoring the validated `TRUST_PROXY` setting.

---

## Usage in Controllers

### Custom Rate Limit on an Endpoint
```typescript
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_PDF_LIMIT, THROTTLE_PDF_TTL_MS } from '../common/constants';

@Get('receipt/:paymentId')
@Throttle({ default: { limit: THROTTLE_PDF_LIMIT, ttl: THROTTLE_PDF_TTL_MS } })
async getReceiptPdf(...) { ... }
```

### Excluding an Infrastructure Endpoint
```typescript
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Controller('health')
export class HealthController { ... }
```

---

## Verification Tests

- **Unit tests (5 passing)**: [`apps/api/test/unit/redis-throttler-storage.spec.ts`](../../../test/unit/redis-throttler-storage.spec.ts)
- **E2E tests (4 passing)**: [`apps/api/test/e2e/throttler.e2e-spec.ts`](../../../test/e2e/throttler.e2e-spec.ts)

```bash
pnpm --filter api test -- test/unit/redis-throttler-storage.spec.ts
pnpm --filter api test:e2e -- test/e2e/throttler.e2e-spec.ts
```
