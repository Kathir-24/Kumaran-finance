import { Controller, Get, InternalServerErrorException, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { BypassEnvelope } from '../common/decorators/bypass-envelope.decorator';
import { isSentryActive } from '../common/sentry/sentry.config';

@SkipThrottle()
@BypassEnvelope()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'chitflow-api',
      sentryActive: isSentryActive(),
      time: new Date().toISOString(),
    };
  }

  /**
   * Diagnostic test endpoint to verify unhandled 500 error reporting in Sentry.
   */
  @Get('sentry-test')
  triggerSentryTest() {
    throw new InternalServerErrorException('Sentry Verification Diagnostic Test Error');
  }
}
