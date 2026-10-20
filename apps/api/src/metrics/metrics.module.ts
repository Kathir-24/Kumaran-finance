// ==============================================================================
// Kumaran Chits — Prometheus Metrics Module
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/non-functional-requirements.md (§3)
// ==============================================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DomainMetricsCollector } from './collectors/domain-metrics.collector';
import { MetricsController } from './controllers/metrics.controller';
import { MetricsAuthGuard } from './guards/metrics-auth.guard';
import { HttpMetricsInterceptor } from './interceptors/http-metrics.interceptor';
import { MetricsService } from './services/metrics.service';

@Module({
  imports: [ConfigModule, PrismaModule, JobsModule],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    DomainMetricsCollector,
    MetricsAuthGuard,
    HttpMetricsInterceptor,
  ],
  exports: [MetricsService, HttpMetricsInterceptor],
})
export class MetricsModule {}
