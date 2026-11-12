# Sentry Error Monitoring & APM Crash Tracking

> **Module**: `apps/api/src/common/sentry/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Compliance**: Indian Digital Personal Data Protection (DPDP) Act 2023 & Whole-Rupee `BigInt` Serialization Safety  
> **Package**: `@sentry/nestjs`

---

## 1. Overview & Architecture

The **Sentry Error Monitoring** integration provides enterprise crash tracking and real-time failure observability for the Kumaran Chits NestJS backend API.

```
                          +-------------------------------+
                          |     Incoming HTTP Request     |
                          +-------------------------------+
                                          |
                                          v
                          +-------------------------------+
                          |    NestJS Route / Service     |
                          +-------------------------------+
                                          |
                        (Unhandled Exception / 500 Fault)
                                          |
                                          v
                          +-------------------------------+
                          |     GlobalExceptionFilter     |
                          +-------------------------------+
                                          |
                     +--------------------+--------------------+
                     |                                         |
               (Status < 500)                            (Status >= 500)
                     |                                         |
                     v                                         v
         [ Client JSON Error 4xx ]              +-------------------------------+
           (No Sentry Alerting)                 |   Sentry PII Sanitizer Hook   |
                                                |     (scrubPii / beforeSend)   |
                                                +-------------------------------+
                                                               |
                                                 (Masks Phone, Strips Secrets)
                                                               |
                                                               v
                                                +-------------------------------+
                                                |         Sentry Cloud          |
                                                |  (Stack Trace + User Context) |
                                                +-------------------------------+
```

---

## 2. Key Architectural Guarantees

1. **Safe-Bypass Mode (Zero Cost in Dev & CI)**:
   - When `SENTRY_DSN` is empty or omitted, Sentry remains completely disabled. Zero outbound HTTP requests are made, ensuring no crashes or slowdowns during offline development or testing.
2. **Indian DPDP Act 2023 PII Protection**:
   - Every event passes through [`beforeSend`](sentry.config.ts) and [`scrubPii`](sentry.config.ts).
   - Sensitive fields (`password`, `mpin`, `refreshToken`, `token`, `totpSecret`, `aadhaar`, `pan`) are automatically redacted to `[FILTERED]`.
   - Customer phone numbers are normalized and masked as `+91******3210` via [`PhoneHelper.maskPhone()`](../../notification/helpers/phone.helper.ts).
3. **4xx vs 5xx Separation**:
   - Normal client validation errors (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found) are returned to the caller without creating noise in Sentry.
   - Only true server-side failures (500 Internal Server Errors, database timeouts, uncaught runtime errors) are captured.
4. **`BigInt` Serialization Protection**:
   - All `bigint` properties in diagnostic payloads are converted to strings before event capture to prevent JSON serialization errors.
5. **Non-Blocking Safety**:
   - Any failure during Sentry event transmission is caught silently and logged, never crashing or delaying the HTTP response to the client.

---

## 3. Environment Configuration

Add to `apps/api/.env`:

```env
# Sentry Error Monitoring & APM Crash Tracking
# Leave empty for safe-bypass mode during local dev / testing
SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0

# Environment Tag ('development', 'staging', 'production', 'test')
SENTRY_ENVIRONMENT=production

# Performance Tracing Sample Rate (0.0 to 1.0; 0.1 = 10% in production, 1.0 = 100% in staging)
SENTRY_TRACES_SAMPLE_RATE=0.1
```

---

## 4. Usage in Application Code

### Automatic Global Error Capture
All unhandled 5xx exceptions and system crashes are captured automatically by [`GlobalExceptionFilter`](../filters/global-exception.filter.ts).

### Manual Error Capture via `SentryService`
```typescript
import { Injectable } from '@nestjs/common';
import { SentryService } from '../common/sentry/sentry.service';

@Injectable()
export class ReconciliationService {
  constructor(private readonly sentry: SentryService) {}

  handleGatewayAnomaly(error: Error, orderId: string, amount: bigint) {
    this.sentry.captureException(error, {
      tags: { orderId },
      extra: { amount }, // BigInt automatically stringified
    });
  }
}
```

### Diagnostic Verification Endpoint
To test that error reporting is working properly in a staging environment:
```bash
curl http://localhost:3000/health/sentry-test
```
This triggers an intentional 500 error: `InternalServerErrorException('Sentry Verification Diagnostic Test Error')`.

---

## 5. Verification & Testing

Run the automated test suite verifying bypass, PII scrubbing, BigInt compatibility, JWT `sub` user attribution (`DEF-BE-03`), and 4xx/5xx filtering:

```bash
# Run Sentry unit tests (16 passing tests)
pnpm --filter api test -- test/sentry.spec.ts

# Run all API tests (54 suites, 821 passing unit tests)
pnpm --filter api test
```
