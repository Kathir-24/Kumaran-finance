import { Controller, Get, InternalServerErrorException, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { BypassEnvelope } from '../common/decorators/bypass-envelope.decorator';
import { isSentryActive } from '../common/sentry/sentry.config';
import { HealthCheckResponseDto } from './dto/health-response.dto';

@ApiTags('Health')
@SkipThrottle()
@BypassEnvelope()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'System health check',
    description: 'Returns API health status, server timestamp, and Sentry monitoring connectivity.',
  })
  @ApiOkResponse({
    description: 'System is healthy',
    type: HealthCheckResponseDto,
  })
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
  @ApiOperation({
    summary: 'Sentry crash diagnostic test',
    description: 'Triggers an intentional 500 error to verify Sentry event capture.',
  })
  @ApiResponse({
    status: 500,
    description: 'Intentional internal server error thrown for Sentry APM verification',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 500 },
        message: { type: 'string', example: 'Sentry Verification Diagnostic Test Error' },
      },
    },
  })
  triggerSentryTest() {
    throw new InternalServerErrorException('Sentry Verification Diagnostic Test Error');
  }
}

