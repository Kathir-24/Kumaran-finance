import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { BypassEnvelope } from '../common/decorators/bypass-envelope.decorator';

@SkipThrottle()
@BypassEnvelope()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'chitflow-api',
      time: new Date().toISOString(),
    };
  }
}

