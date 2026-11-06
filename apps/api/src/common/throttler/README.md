# Common Throttler Module

> **Package**: `@kumaran/api` (NestJS Modular Monolith)  
> **Location**: `apps/api/src/common/throttler/`  
> **Master Architecture Spec**: [`docs/03-architecture/rate-limiting-and-abuse-prevention.md`](../../../../docs/03-architecture/rate-limiting-and-abuse-prevention.md)

---

## Overview

This module provides bank-grade, distributed rate-limiting and anti-abuse components for Kumaran Chits:

1. **`RedisThrottlerStorage`** (`redis-throttler-storage.service.ts`):
   - Implements NestJS `ThrottlerStorage` via atomic Redis Lua script.
   - Redis key namespace: `throttle:<throttlerName>:<key>`.
   - Redis block namespace: `throttle:block:<throttlerName>:<key>`.
   - Automatic fail-closed in-memory fallback store (`Map<string, MemoryRecord>`) if Redis is offline or disconnected.

2. **`AppThrottlerGuard`** (`app-throttler.guard.ts`):
   - Extends NestJS `ThrottlerGuard`.
   - Resolves the Perundurai Head Office NAT collision problem by overriding `getTracker(req)`.
   - Tracks authenticated users by `usr_<userId>` (via `req.user.sub` or Bearer JWT).
   - Tracks unauthenticated calls by `ip:<normalizedIp>`.

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

- Unit tests: [`test/redis-throttler-storage.spec.ts`](../../../test/redis-throttler-storage.spec.ts)
- E2E tests: [`test/throttler.e2e-spec.ts`](../../../test/throttler.e2e-spec.ts)
