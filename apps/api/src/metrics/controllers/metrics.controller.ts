// ==============================================================================
// Kumaran Chits — Prometheus Metrics Controller
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/non-functional-requirements.md (§3)
// ==============================================================================

import { Controller, Get, Res, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBasicAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  constructor(
    private readonly metricsService: MetricsService,
    private readonly domainCollector: DomainMetricsCollector,
  ) {}

  @Get()
  @UseGuards(MetricsAuthGuard)
  @ApiBasicAuth('basic')
  @ApiOperation({
    summary: 'Scrape Prometheus Metrics',
    description:
      'Exposes runtime HTTP latencies, process memory, BullMQ queue depths, and real-time chit fund financial KPIs in standard Prometheus format. Strictly protected by HTTP Basic Auth.',
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
    description: 'Unauthorized: Valid HTTP Basic Auth credentials required for scraping',
  })
  async getMetrics(@Res() res: Response): Promise<void> {
    // 1. Refresh live database health, queue job counts, and domain KPIs
    await this.domainCollector.collectAll();

    // 2. Set official Prometheus content type
    res.setHeader('Content-Type', this.metricsService.getContentType());

    // 3. Output serialized metrics buffer
    const metricsOutput = await this.metricsService.getMetrics();
    res.status(200).send(metricsOutput);
  }
}
