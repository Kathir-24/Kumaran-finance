// ==============================================================================
// Kumaran Chits — Bull Board Dashboard Service
// Company: Kumaran Finance (Perundurai, Erode, Tamil Nadu)
// Compliance: docs/03-architecture/completed-modules-api-registry.md (§13)
// ==============================================================================

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Router } from 'express';
import { BullMqQueueProvider } from '../providers/bullmq-queue.provider';

@Injectable()
export class BullBoardService implements OnModuleInit {
  private readonly logger = new Logger(BullBoardService.name);
  private serverAdapter: ExpressAdapter | null = null;

  constructor(private readonly queueProvider: BullMqQueueProvider) {}

  onModuleInit(): void {
    this.serverAdapter = new ExpressAdapter();
    this.serverAdapter.setBasePath('/admin/queues');

    const adapters: BullMQAdapter[] = [];

    const maintenanceQueue = this.queueProvider.getDailyMaintenanceQueue();
    if (maintenanceQueue) {
      adapters.push(new BullMQAdapter(maintenanceQueue));
    }

    const notificationQueue = this.queueProvider.getNotificationQueue();
    if (notificationQueue) {
      adapters.push(new BullMQAdapter(notificationQueue));
    }

    const reconciliationQueue = this.queueProvider.getReconciliationQueue();
    if (reconciliationQueue) {
      adapters.push(new BullMQAdapter(reconciliationQueue));
    }

    createBullBoard({
      queues: adapters,
      serverAdapter: this.serverAdapter,
      options: {
        uiConfig: {
          boardTitle: 'Kumaran Chits — Queue Monitor',
        },
      },
    });

    this.logger.log(
      `Bull Board initialized with ${adapters.length} active BullMQ queue adapters at /admin/queues`,
    );
  }

  getRouter(): Router {
    if (!this.serverAdapter) {
      this.serverAdapter = new ExpressAdapter();
      this.serverAdapter.setBasePath('/admin/queues');
    }
    return this.serverAdapter.getRouter();
  }
}
