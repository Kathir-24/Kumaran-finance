import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { BullBoardAuthMiddleware } from './bull-board/bull-board-auth.middleware';
import { BullBoardService } from './bull-board/bull-board.service';
import { JobsController } from './jobs.controller';
import { BullMqQueueProvider } from './providers/bullmq-queue.provider';
import { RedisConnectionProvider } from './providers/redis-connection.provider';
import { RedisThrottlerStorage } from '../common/throttler/redis-throttler-storage.service';
import { AuctionReminderSchedulerService } from './services/auction-reminder-scheduler.service';
import { DailyArrearsService } from './services/daily-arrears.service';
import { DistributedLockService } from './services/distributed-lock.service';
import { NotificationService } from './services/notification.service';
import { ReconciliationService } from './services/reconciliation.service';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [JobsController],
  providers: [
    RedisConnectionProvider,
    RedisThrottlerStorage,
    DistributedLockService,
    NotificationService,
    DailyArrearsService,
    ReconciliationService,
    AuctionReminderSchedulerService,
    BullMqQueueProvider,
    BullBoardService,
    BullBoardAuthMiddleware,
  ],
  exports: [
    RedisConnectionProvider,
    RedisThrottlerStorage,
    DistributedLockService,
    NotificationService,
    DailyArrearsService,
    ReconciliationService,
    AuctionReminderSchedulerService,
    BullMqQueueProvider,
    BullBoardService,
    BullBoardAuthMiddleware,
  ],
})
export class JobsModule {}
