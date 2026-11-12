import { ApiProperty } from '@nestjs/swagger';

export class EnqueuedJobResponseDto {
  @ApiProperty({ example: true, description: 'Whether the job was successfully enqueued' })
  enqueued: boolean;

  @ApiProperty({ example: 'job-uuid-001', description: 'BullMQ Job ID' })
  jobId: string;

  @ApiProperty({ example: 'daily-maintenance-queue', description: 'BullMQ queue name' })
  queue: string;

  @ApiProperty({ example: 'process-daily-arrears', description: 'Job name' })
  name: string;
}

export class DailyArrearsExecutionResultDto {
  @ApiProperty({ example: 40, description: 'Total installment dues checked' })
  totalDuesChecked: number;

  @ApiProperty({ example: 5, description: 'Total overdue dues count' })
  overdueCount: number;

  @ApiProperty({ example: 2, description: 'Dues that turned overdue today' })
  newlyOverdueCount: number;

  @ApiProperty({ example: 1, description: 'Subscribers reaching 3-month default' })
  defaults3MonthsCount: number;

  @ApiProperty({ example: 3, description: 'Active arrears count' })
  arrearsCount: number;

  @ApiProperty({ example: 125, description: 'Execution duration in milliseconds' })
  executionTimeMs: number;
}

export class ReconciliationResultDto {
  @ApiProperty({ example: 10, description: 'Count of matched settlements' })
  matchedCount: number;

  @ApiProperty({ example: 1, description: 'Count of resolved ghost drop transactions' })
  ghostDropsResolvedCount: number;

  @ApiProperty({ example: 0, description: 'Count of settlement discrepancies' })
  exceptionsCount: number;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Matched orders details',
  })
  matchedOrders: any[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Ghost drop orders details',
  })
  ghostDropOrders: any[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Discrepancy orders details',
  })
  exceptionOrders: any[];
}

export class QueueStatusReportDto {
  @ApiProperty({ example: 'daily-maintenance-queue', description: 'Queue identifier' })
  queueName: string;

  @ApiProperty({ example: true, description: 'Whether Redis/BullMQ is operational' })
  isAvailable: boolean;

  @ApiProperty({ example: 0, description: 'Active running jobs' })
  active: number;

  @ApiProperty({ example: 0, description: 'Waiting queued jobs' })
  waiting: number;

  @ApiProperty({ example: 15, description: 'Completed jobs count' })
  completed: number;

  @ApiProperty({ example: 0, description: 'Failed jobs count' })
  failed: number;

  @ApiProperty({ example: 0, description: 'Delayed jobs count' })
  delayed: number;

  @ApiProperty({ example: false, description: 'Whether queue is paused' })
  paused: boolean;
}

export class NotificationLogItemDto {
  @ApiProperty({ example: 'notif-uuid-001', description: 'Log unique ID' })
  id: string;

  @ApiProperty({ example: 'PUSH', description: 'Delivery channel (PUSH or SMS)' })
  type: string;

  @ApiProperty({ example: '9842100001', description: 'Recipient phone or FCM token' })
  recipient: string;

  @ApiProperty({ example: 'Payment Received', description: 'Notification title' })
  title: string;

  @ApiProperty({ example: 'Receipt KC-RCPT-202610-00001 issued', description: 'Notification body' })
  body: string;

  @ApiProperty({ example: 'SENT', description: 'Delivery state' })
  status: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-22T07:28:14.000Z', description: 'Dispatched timestamp' })
  sentAt: Date | string;
}

export class PreAuctionScanResultDto {
  @ApiProperty({ example: 1, description: 'Upcoming auctions identified' })
  auctionsFound: number;

  @ApiProperty({ example: 20, description: 'Reminders dispatched to subscribers' })
  totalRemindersBroadcasted: number;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Auction notification breakdown',
  })
  details: any[];
}

export class RepeatableScheduleDto {
  @ApiProperty({ example: 'daily-midnight-arrears', description: 'Repeatable schedule key' })
  key: string;

  @ApiProperty({ example: 'daily-arrears-job', description: 'Schedule name' })
  name: string;

  @ApiProperty({ example: '0 0 * * *', description: 'Cron expression' })
  cron: string;

  @ApiProperty({ type: Number, example: 1729641600000, description: 'Next scheduled timestamp', nullable: true })
  next?: number | null;
}
