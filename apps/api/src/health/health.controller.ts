import {
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Optional,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { BypassEnvelope } from '../common/decorators/bypass-envelope.decorator';
import { isSentryActive } from '../common/sentry/sentry.config';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import { PrismaService } from '../prisma/prisma.service';
import { HealthCheckResponseDto, LivenessResponseDto } from './dto/health-response.dto';

@ApiTags('Health')
@SkipThrottle()
@BypassEnvelope()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {}

  /**
   * Deep readiness health check: probes PostgreSQL (SELECT 1) and Redis (PING).
   * PostgreSQL is the sole financial truth: fails with HTTP 503 if database is down.
   * Redis is decoupled: reports 'degraded' (HTTP 200) to keep financial operations alive.
   */
  @Get()
  @ApiOperation({
    summary: 'System readiness health check',
    description:
      'Performs deep connectivity verification for PostgreSQL database pool and Redis queue broker.',
  })
  @ApiOkResponse({
    description: 'System and critical backing services are ready (ok or degraded)',
    type: HealthCheckResponseDto,
  })
  async check(): Promise<HealthCheckResponseDto> {
    const checks: { database: string; redis: string } = {
      database: 'skipped',
      redis: 'skipped',
    };
    const errors: string[] = [];

    // 1. Deep PostgreSQL database probe
    if (this.prisma) {
      let dbTimer: NodeJS.Timeout | undefined;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          dbTimer = setTimeout(() => reject(new Error('Database probe timed out after 2000ms')), 2000);
        });
        await Promise.race([this.prisma.$queryRawUnsafe('SELECT 1'), timeoutPromise]);
        checks.database = 'connected';
      } catch (err: any) {
        checks.database = 'error';
        const msg = `Database probe failed: ${err.message}`;
        this.logger.error(`[HealthCheck] ${msg}`);
        errors.push(msg);
      } finally {
        if (dbTimer) clearTimeout(dbTimer);
      }
    }

    // 2. Redis queue & distributed cache probe (Decoupled: non-fatal to financial traffic)
    if (this.redisProvider) {
      const client = this.redisProvider.getClient();
      if (!client) {
        checks.redis = 'disconnected';
        this.logger.warn('[HealthCheck] Redis client is not initialized or disconnected');
      } else {
        let redisTimer: NodeJS.Timeout | undefined;
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            redisTimer = setTimeout(() => reject(new Error('Redis ping timed out after 1500ms')), 1500);
          });
          const pong = await Promise.race([client.ping(), timeoutPromise]);
          if (pong === 'PONG') {
            checks.redis = 'connected';
          } else {
            checks.redis = 'degraded';
            this.logger.warn(`[HealthCheck] Redis unexpected response: ${pong}`);
          }
        } catch (err: any) {
          checks.redis = 'degraded';
          const msg = `Redis probe failed: ${err.message}`;
          this.logger.warn(`[HealthCheck] ${msg}`);
        } finally {
          if (redisTimer) clearTimeout(redisTimer);
        }
      }
    }

    if (errors.length > 0) {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'chitflow-api',
        errors,
        checks,
        time: new Date().toISOString(),
      });
    }

    const isDegraded = checks.redis !== 'connected' && checks.redis !== 'skipped';

    return {
      status: isDegraded ? 'degraded' : 'ok',
      service: 'chitflow-api',
      database: checks.database,
      redis: checks.redis,
      sentryActive: isSentryActive(),
      time: new Date().toISOString(),
    };
  }

  /**
   * Explicit readiness endpoint alias (standard Kubernetes / ALB readiness convention).
   */
  @Get('readiness')
  @ApiOperation({
    summary: 'Explicit container readiness probe',
    description:
      'Probes database and cache connectivity; returns 503 if service cannot process requests.',
  })
  @ApiOkResponse({
    description: 'System readiness health check status',
    type: HealthCheckResponseDto,
  })
  async readiness(): Promise<HealthCheckResponseDto> {
    return this.check();
  }

  /**
   * Shallow process liveness check: verifies Node.js process is alive.
   * Kubernetes / ECS liveness probe will not reboot containers during transient DB spikes.
   */
  @Get('liveness')
  @ApiOperation({
    summary: 'Container process liveness probe',
    description: 'Verifies the Node.js event loop and HTTP server are responsive.',
  })
  @ApiOkResponse({
    description: 'Container process liveness confirmation',
    type: LivenessResponseDto,
  })
  liveness(): LivenessResponseDto {
    return {
      status: 'alive',
      service: 'chitflow-api',
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
