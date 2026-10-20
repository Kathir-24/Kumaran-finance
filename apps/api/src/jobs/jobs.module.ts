import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BullBoardAuthMiddleware } from './bull-board/bull-board-auth.middleware';
import { BullBoardService } from './bull-board/bull-board.service';
import { JobsController } from './jobs.controller';
import { BullMqQueueProvider } from './providers/bullmq-queue.provider';
import { RedisConnectionProvider } from './providers/redis-connection.provider';
import { DailyArrearsService } from './services/daily-arrears.service';
import { NotificationService } from './services/notification.service';
import { ReconciliationService } from './services/reconciliation.service';

@Module({
  imports: [PrismaModule],
  controllers: [JobsController],
  providers: [
    RedisConnectionProvider,
    NotificationService,
    DailyArrearsService,
    ReconciliationService,
    BullMqQueueProvider,
    BullBoardService,
    BullBoardAuthMiddleware,
  ],
  exports: [
    RedisConnectionProvider,
    NotificationService,
    DailyArrearsService,
    ReconciliationService,
    BullMqQueueProvider,
    BullBoardService,
    BullBoardAuthMiddleware,
  ],
})
export class JobsModule {}
