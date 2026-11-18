// ==============================================================================
// Kumaran Chits — Prometheus Metrics Controller
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/non-functional-requirements.md (§3)
// ==============================================================================

import { Controller, Get, Logger, Res, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBasicAuth, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { BypassEnvelope } from '../../common/decorators/bypass-envelope.decorator';
import { DomainMetricsCollector } from '../collectors/domain-metrics.collector';
import { MetricsAuthGuard } from '../guards/metrics-auth.guard';
import { MetricsService } from '../services/metrics.service';

@ApiTags('Observability & Metrics')
@BypassEnvelope()
@SkipThrottle()
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  constructor(
    private readonly metricsService: MetricsService,
    private readonly domainCollector: DomainMetricsCollector,
  ) {}

  @Get()
  @UseGuards(MetricsAuthGuard)
  @ApiBasicAuth('basic')
  @ApiBearerAuth('metrics-bearer')
  @ApiOperation({
    summary: 'Scrape Prometheus Metrics',
    description:
      'Exposes runtime HTTP latencies, process memory, BullMQ queue depths, and real-time chit fund financial KPIs in standard Prometheus format. Strictly protected by constant-time Bearer Token (METRICS_BEARER_TOKEN) or HTTP Basic Auth.',
  })
  @ApiResponse({
    status: 200,
    description: 'Prometheus metrics exported successfully',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
          example: '# HELP http_requests_total Total count of processed HTTP requests\n...',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized: Valid Bearer Token or HTTP Basic Auth credentials required for scraping',
  })
  async getMetrics(@Res() res: Response): Promise<void> {
    // 1. Refresh live database health, queue job counts, and domain KPIs (strictly non-blocking on error)
    try {
      await this.domainCollector.collectAll();
    } catch (err: any) {
      this.logger.warn(`Domain metrics refresh degraded: ${err?.message || 'unknown error'}`);
    }

    // 2. Set official Prometheus content type & prevent proxy caching
    res.setHeader('Content-Type', this.metricsService.getContentType());
    res.setHeader('Cache-Control', 'no-store');

    // 3. Output serialized metrics buffer
    const metricsOutput = await this.metricsService.getMetrics();
    res.status(200).send(metricsOutput);
  }
}
