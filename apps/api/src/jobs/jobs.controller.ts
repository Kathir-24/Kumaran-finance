import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  DAILY_MAINTENANCE_QUEUE,
  JOB_DISPATCH_AUCTION_REMINDER,
  JOB_PROCESS_DAILY_ARREARS,
  JOB_RUN_DAILY_RECONCILIATION,
  NOTIFICATION_QUEUE,
  RECONCILIATION_QUEUE,
} from './constants/queue-names.constant';
import { BullMqQueueProvider } from './providers/bullmq-queue.provider';
import { DailyArrearsService } from './services/daily-arrears.service';
import { NotificationService } from './services/notification.service';
import { ReconciliationService } from './services/reconciliation.service';

@ApiTags('Background Jobs & Daily Maintenance')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly dailyArrearsService: DailyArrearsService,
    private readonly notificationService: NotificationService,
    private readonly reconciliationService: ReconciliationService,
    private readonly queueProvider: BullMqQueueProvider,
  ) {}

  @Post('run-daily-arrears')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Manually trigger daily midnight arrears recalculation & default tagging',
    description:
      'Scans for overdue unpaid installments, recalculates consecutive unpaid months, tags 3-month defaults (ADR-07), and sends warning notices.',
  })
  @ApiQuery({
    name: 'cutoffDate',
    required: false,
    type: String,
    description: 'ISO date string to test past or future due dates',
  })
  @ApiResponse({ status: 200, description: 'Daily arrears execution summary returned' })
  async runDailyArrears(@Query('cutoffDate') cutoffDate?: string) {
    const cutoff = cutoffDate ? new Date(cutoffDate) : undefined;
    return this.dailyArrearsService.processDailyOverdueAndArrears(cutoff);
  }

  @Post('enqueue-daily-arrears')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Enqueue daily arrears job to BullMQ queue',
    description: 'Drops the arrears check job onto the daily-maintenance-queue for asynchronous processing.',
  })
  async enqueueDailyArrears(@Query('cutoffDate') cutoffDate?: string) {
    return this.queueProvider.addJob(DAILY_MAINTENANCE_QUEUE, JOB_PROCESS_DAILY_ARREARS, {
      cutoffDate,
    });
  }

  @Post('run-reconciliation')
  @Roles(Role.SUPER_ADMIN, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Trigger payment settlement reconciliation',
    description: 'Reconciles payment records against gateway provider settlement data to resolve ghost drops.',
  })
  async runReconciliation(@Body('records') records: any[]) {
    return this.reconciliationService.reconcileSettlement(records || []);
  }

  @Post('enqueue-reconciliation')
  @Roles(Role.SUPER_ADMIN, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Enqueue reconciliation job to BullMQ queue',
  })
  async enqueueReconciliation(@Body('records') records: any[]) {
    return this.queueProvider.addJob(RECONCILIATION_QUEUE, JOB_RUN_DAILY_RECONCILIATION, {
      records: records || [],
    });
  }

  @Post('send-auction-reminder/:chitGroupId/:month')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Broadcast bilingual auction reminder to chit subscribers',
  })
  async sendAuctionReminder(
    @Param('chitGroupId') chitGroupId: string,
    @Param('month', ParseIntPipe) month: number,
    @Body()
    body: {
      chitCode: string;
      auctionDate: string;
      auctionTime: string;
      branchName: string;
      branchAddress: string;
      branchPhone: string;
      subscribers: Array<{ name: string; phone: string; fcmToken?: string }>;
    },
  ) {
    return this.queueProvider.addJob(NOTIFICATION_QUEUE, JOB_DISPATCH_AUCTION_REMINDER, {
      chitGroupId,
      chitCode: body.chitCode,
      installmentMonth: month,
      auctionDate: body.auctionDate,
      auctionTime: body.auctionTime,
      branchName: body.branchName,
      branchAddress: body.branchAddress,
      branchPhone: body.branchPhone,
      subscribers: body.subscribers || [],
    });
  }

  @Get('queue-status')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.AUDITOR)
  @ApiOperation({
    summary: 'Get BullMQ queue health and job counts',
  })
  async getQueueStatus() {
    return this.queueProvider.getQueueStatusReports();
  }

  @Get('notification-audit-logs')
  @Roles(Role.SUPER_ADMIN, Role.AUDITOR)
  @ApiOperation({
    summary: 'Get audit logs of dispatched Push Notifications and DLT SMS messages',
  })
  getNotificationLogs(@Query('limit') limit?: number) {
    return this.notificationService.getSentNotificationLog(limit ? Number(limit) : 50);
  }
}
