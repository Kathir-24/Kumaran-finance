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
  ApiOkResponseEnvelope,
} from '../common/decorators/api-response-envelope.decorator';
import { toWholeRupeeBigInt } from '../common/utils/whole-rupee.util';
import {
  DAILY_MAINTENANCE_QUEUE,
  JOB_DISPATCH_AUCTION_REMINDER,
  JOB_PROCESS_DAILY_ARREARS,
  JOB_RUN_DAILY_RECONCILIATION,
  NOTIFICATION_QUEUE,
  RECONCILIATION_QUEUE,
} from './constants/queue-names.constant';
import {
  DailyArrearsExecutionResultDto,
  EnqueuedJobResponseDto,
  NotificationLogItemDto,
  PreAuctionScanResultDto,
  QueueStatusReportDto,
  ReconciliationResultDto,
  RepeatableScheduleDto,
} from './dto/jobs-response.dto';
import { ReconcileSettlementDto } from './dto/reconcile-settlement.dto';
import { SendAuctionReminderDto } from './dto/send-auction-reminder.dto';
import { BullMqQueueProvider } from './providers/bullmq-queue.provider';
import { AuctionReminderSchedulerService } from './services/auction-reminder-scheduler.service';
import { DailyArrearsService } from './services/daily-arrears.service';
import { NotificationService } from './services/notification.service';
import { ReconciliationService } from './services/reconciliation.service';

@ApiTags('Background Jobs & Daily Maintenance')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 401, description: 'Unauthorized — Invalid or missing Bearer token' })
@ApiResponse({ status: 403, description: 'Forbidden — Insufficient role permissions or BOLA violation' })
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly dailyArrearsService: DailyArrearsService,
    private readonly notificationService: NotificationService,
    private readonly reconciliationService: ReconciliationService,
    private readonly auctionReminderSchedulerService: AuctionReminderSchedulerService,
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
  @ApiOkResponseEnvelope(DailyArrearsExecutionResultDto, { description: 'Daily arrears execution summary returned' })
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
  @ApiQuery({
    name: 'cutoffDate',
    required: false,
    type: String,
    description: 'ISO date string to test past or future due dates',
  })
  @ApiOkResponseEnvelope(EnqueuedJobResponseDto, { description: 'Daily arrears job enqueued to BullMQ' })
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
  @ApiOkResponseEnvelope(ReconciliationResultDto, { description: 'Reconciliation summary returned' })
  async runReconciliation(@Body() dto: ReconcileSettlementDto) {
    const records = (dto.records || []).map((r) => ({
      gatewayOrderId: r.gatewayOrderId,
      gatewayPaymentId: r.gatewayPaymentId,
      amount: toWholeRupeeBigInt(r.amount, 'amount', { min: 1n }),
      status: r.status,
      settledAt: new Date(r.settledAt),
    }));
    return this.reconciliationService.reconcileSettlement(records);
  }

  @Post('enqueue-reconciliation')
  @Roles(Role.SUPER_ADMIN, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Enqueue reconciliation job to BullMQ queue',
    description: 'Drops external gateway settlement records onto the reconciliation-queue for asynchronous processing.',
  })
  @ApiOkResponseEnvelope(EnqueuedJobResponseDto, { description: 'Reconciliation job enqueued to BullMQ' })
  async enqueueReconciliation(@Body() dto: ReconcileSettlementDto) {
    const records = (dto.records || []).map((r) => {
      toWholeRupeeBigInt(r.amount, 'amount', { min: 1n });
      return r;
    });
    return this.queueProvider.addJob(RECONCILIATION_QUEUE, JOB_RUN_DAILY_RECONCILIATION, {
      records,
    });
  }

  @Post('send-auction-reminder/:chitGroupId/:month')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Broadcast bilingual auction reminder to chit subscribers',
    description: 'Enqueues reminder dispatch to push notification and DLT SMS channels for scheduled chit scheme auctions.',
  })
  @ApiOkResponseEnvelope(EnqueuedJobResponseDto, { description: 'Auction reminder broadcast job enqueued' })
  async sendAuctionReminder(
    @Param('chitGroupId') chitGroupId: string,
    @Param('month', ParseIntPipe) month: number,
    @Body() dto: SendAuctionReminderDto,
  ) {
    return this.queueProvider.addJob(
      NOTIFICATION_QUEUE,
      JOB_DISPATCH_AUCTION_REMINDER,
      {
        chitGroupId,
        chitCode: dto.chitCode,
        installmentMonth: month,
        auctionDate: dto.auctionDate,
        auctionTime: dto.auctionTime,
        branchName: dto.branchName,
        branchAddress: dto.branchAddress,
        branchPhone: dto.branchPhone,
        subscribers: dto.subscribers || [],
      },
      {
        jobId: `auction-reminder:${chitGroupId}:m${month}`,
        priority: 10,
      },
    );
  }

  @Get('queue-status')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.AUDITOR)
  @ApiOperation({
    summary: 'Get BullMQ queue health and job counts',
  })
  @ApiOkResponseEnvelope(QueueStatusReportDto, { isArray: true, description: 'BullMQ queue health reports' })
  async getQueueStatus() {
    return this.queueProvider.getQueueStatusReports();
  }

  @Get('notification-audit-logs')
  @Roles(Role.SUPER_ADMIN, Role.AUDITOR)
  @ApiOperation({
    summary: 'Get audit logs of dispatched Push Notifications and DLT SMS messages',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 50,
    description: 'Number of recent notification logs to retrieve (defaults to 50)',
  })
  @ApiOkResponseEnvelope(NotificationLogItemDto, { isArray: true, description: 'Notification audit logs' })
  getNotificationLogs(@Query('limit') limit?: number) {
    return this.notificationService.getSentNotificationLog(limit ? Number(limit) : 50);
  }

  @Post('run-pre-auction-scan')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Manually trigger pre-auction reminders scan (default 3 days ahead)',
    description: 'Scans scheduled auctions and broadcasts bilingual Push Notifications and DLT SMS to subscribers.',
  })
  @ApiQuery({
    name: 'targetDate',
    required: false,
    type: String,
    description: 'ISO date string to test a specific auction date',
  })
  @ApiOkResponseEnvelope(PreAuctionScanResultDto, { description: 'Pre-auction scan completed' })
  async runPreAuctionScan(@Query('targetDate') targetDate?: string) {
    const date = targetDate ? new Date(targetDate) : undefined;
    return this.auctionReminderSchedulerService.scanAndBroadcastUpcomingAuctions(date);
  }

  @Get('repeatable-schedules')
  @Roles(Role.SUPER_ADMIN, Role.AUDITOR)
  @ApiOperation({
    summary: 'List active BullMQ repeatable cron jobs and next execution timestamps',
  })
  @ApiOkResponseEnvelope(RepeatableScheduleDto, { isArray: true, description: 'Active repeatable schedules' })
  async getRepeatableSchedules(): Promise<RepeatableScheduleDto[]> {
    const raw = await this.queueProvider.getRepeatableJobs();
    return raw.map((item, index) => ({
      key: item.id || `${item.queue}-${item.pattern || index}`,
      name: item.queue,
      cron: item.pattern || '',
      next: item.next ?? null,
    }));
  }
}

