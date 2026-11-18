// ==============================================================================
// Kumaran Chits — Prometheus Metrics Service & Registry Manager
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/non-functional-requirements.md (§3)
// ==============================================================================

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;
  private defaultMetricsInitialized = false;

  // HTTP Metrics
  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDurationSeconds: Histogram<string>;

  // Database Metrics
  public readonly dbConnected: Gauge<string>;
  public readonly dbQueryDurationSeconds: Histogram<string>;

  // BullMQ Queue Telemetry
  public readonly bullMqQueueJobsCount: Gauge<string>;

  // Chit Fund Domain Operational Gauges
  public readonly activeChitGroupsTotal: Gauge<string>;
  public readonly activeSubscribersTotal: Gauge<string>;
  public readonly defaulterTicketsCount: Gauge<string>;
  public readonly makerCheckerPendingCount: Gauge<string>;
  public readonly dailyCollectedAmountRupees: Gauge<string>;

  // External Third-Party Telemetry
  public readonly smsDispatchesTotal: Counter<string>;
  public readonly smsCircuitBreakerState: Gauge<string>;

  constructor() {
    this.registry = new Registry();
    this.registry.setDefaultLabels({
      app: 'kumaran-chits-api',
      company: 'kumaran-finance',
      branch: 'head-office-perundurai',
    });

    // 1. HTTP Telemetry
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total count of processed HTTP requests by method, route, and status code',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    // Buckets tailored for NFR §3: 200ms read target, 500ms financial write target
    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0],
      registers: [this.registry],
    });

    // 2. Database Telemetry
    this.dbConnected = new Gauge({
      name: 'chitflow_db_connected',
      help: 'PostgreSQL connection status (1 = connected, 0 = disconnected)',
      registers: [this.registry],
    });

    this.dbQueryDurationSeconds = new Histogram({
      name: 'chitflow_db_query_duration_seconds',
      help: 'Database query execution time in seconds',
      labelNames: ['model', 'action'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
      registers: [this.registry],
    });

    // 3. BullMQ Queue Telemetry
    this.bullMqQueueJobsCount = new Gauge({
      name: 'bullmq_queue_jobs_count',
      help: 'Number of jobs in BullMQ queues categorized by queue and job state',
      labelNames: ['queue', 'status'],
      registers: [this.registry],
    });

    // 4. Chit Fund Domain Operational Gauges
    this.activeChitGroupsTotal = new Gauge({
      name: 'chitflow_active_chit_groups_total',
      help: 'Total count of active and registered chit schemes',
      registers: [this.registry],
    });

    this.activeSubscribersTotal = new Gauge({
      name: 'chitflow_active_subscribers_total',
      help: 'Total count of active customer subscriptions across all schemes',
      registers: [this.registry],
    });

    this.defaulterTicketsCount = new Gauge({
      name: 'chitflow_defaulter_tickets_count',
      help: 'Count of subscribers in arrears categorized by overdue bucket',
      labelNames: ['bucket'],
      registers: [this.registry],
    });

    this.makerCheckerPendingCount = new Gauge({
      name: 'chitflow_maker_checker_pending_count',
      help: 'Pending Maker-Checker tasks awaiting partner approval',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.dailyCollectedAmountRupees = new Gauge({
      name: 'chitflow_daily_collected_amount_rupees',
      help: 'Cumulative collections recorded today (IST) in whole integer Rupees (BigInt)',
      registers: [this.registry],
    });

    // 5. External Third-Party Telemetry
    this.smsDispatchesTotal = new Counter({
      name: 'kumaran_sms_dispatches_total',
      help: 'Total count of SMS messages dispatched to external telecom providers',
      labelNames: ['provider', 'template', 'status'], // status: 'success' | 'fallback_success' | 'failure' | 'circuit_open' | 'bypassed'
      registers: [this.registry],
    });

    this.smsCircuitBreakerState = new Gauge({
      name: 'kumaran_sms_circuit_breaker_state',
      help: 'Circuit breaker state for SMS gateway (0 = CLOSED/Healthy, 1 = HALF_OPEN, 2 = OPEN/Tripped)',
      labelNames: ['provider'],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    if (this.defaultMetricsInitialized) {
      return;
    }
    this.defaultMetricsInitialized = true;
    // Collect standard V8 / Node.js process and memory metrics
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'nodejs_',
    });
  }

  getRegistry(): Registry {
    return this.registry;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
