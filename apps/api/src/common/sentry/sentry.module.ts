// ==============================================================================
// Kumaran Chits — Sentry APM & Observability Module
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: Indian DPDP Act 2023, Safe Non-Blocking Observability
// ==============================================================================

import { Global, Module } from '@nestjs/common';
import { SentryService } from './sentry.service';

@Global()
@Module({
  providers: [SentryService],
  exports: [SentryService],
})
export class SentryModule {}
