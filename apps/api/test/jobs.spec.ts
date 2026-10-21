import { DueStatus, PaymentStatus } from '@prisma/client';
import { JobsController } from '../src/jobs/jobs.controller';
import { BullMqQueueProvider } from '../src/jobs/providers/bullmq-queue.provider';
import { RedisConnectionProvider } from '../src/jobs/providers/redis-connection.provider';
import { DailyArrearsService } from '../src/jobs/services/daily-arrears.service';
import { NotificationService } from '../src/jobs/services/notification.service';
import { ReconciliationService } from '../src/jobs/services/reconciliation.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Component 3: BullMQ Background Queue & Daily Cron Worker Tests', () => {
  let prismaMock: any;
  let notificationService: NotificationService;
  let dailyArrearsService: DailyArrearsService;
  let reconciliationService: ReconciliationService;
  let redisProviderMock: any;
  let queueProvider: BullMqQueueProvider;
  let jobsController: JobsController;

  beforeEach(() => {
    notificationService = new NotificationService();
    notificationService.clearLog();

    prismaMock = {
      installmentDue: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      subscriberTicket: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    dailyArrearsService = new DailyArrearsService(
      prismaMock as unknown as PrismaService,
      notificationService,
    );

    reconciliationService = new ReconciliationService(
      prismaMock as unknown as PrismaService,
    );

    redisProviderMock = {
      getClient: jest.fn().mockReturnValue(null), // Simulate testing environment
      getIsConnected: jest.fn().mockReturnValue(false),
    };

    queueProvider = new BullMqQueueProvider(
      redisProviderMock as unknown as RedisConnectionProvider,
      dailyArrearsService,
      notificationService,
      reconciliationService,
    );
    queueProvider.onModuleInit();

    jobsController = new JobsController(
      dailyArrearsService,
      notificationService,
      reconciliationService,
      queueProvider,
    );
  });

  describe('1. DailyArrearsService (Midnight Cron & ADR-07 3-Month Arrears)', () => {
    it('should transition past UNPAID dues to OVERDUE status', async () => {
      const cutoff = new Date('2026-10-19T00:00:00Z');

      prismaMock.installmentDue.findMany.mockResolvedValue([
        { id: 'due-01', ticketId: 'tkt-01' },
        { id: 'due-02', ticketId: 'tkt-02' },
      ]);
      prismaMock.installmentDue.updateMany.mockResolvedValue({ count: 2 });
      prismaMock.subscriberTicket.findMany.mockResolvedValue([]);

      const result = await dailyArrearsService.processDailyOverdueAndArrears(cutoff);

      expect(prismaMock.installmentDue.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['due-01', 'due-02'] } },
        data: { status: DueStatus.OVERDUE },
      });
      expect(result.duesTransitionedToOverdue).toBe(2);
    });

    it('should calculate consecutive unpaid months and tag DEFAULT_3_MONTHS with notification (ADR-07)', async () => {
      const cutoff = new Date('2026-10-19T00:00:00Z');

      prismaMock.installmentDue.findMany.mockResolvedValue([]);

      // Ticket with 3 consecutive overdue dues
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'tkt-default',
          ticketNumber: 7,
          consecutiveUnpaidMonths: 2,
          status: 'ACTIVE',
          customer: {
            fullName: 'S. Sundaram',
            phone: '9842143210',
          },
          chitGroup: {
            groupCode: 'KCA-1L-20M-01',
          },
          dues: [
            {
              installmentMonth: 4,
              status: DueStatus.OVERDUE,
              netPayableAmount: 3750n,
              paidAmount: 0n,
            },
            {
              installmentMonth: 3,
              status: DueStatus.OVERDUE,
              netPayableAmount: 3750n,
              paidAmount: 0n,
            },
            {
              installmentMonth: 2,
              status: DueStatus.OVERDUE,
              netPayableAmount: 3750n,
              paidAmount: 0n,
            },
            {
              installmentMonth: 1,
              status: DueStatus.PAID,
              netPayableAmount: 5000n,
              paidAmount: 5000n,
            },
          ],
        },
      ]);

      const result = await dailyArrearsService.processDailyOverdueAndArrears(cutoff);

      expect(prismaMock.subscriberTicket.update).toHaveBeenCalledWith({
        where: { id: 'tkt-default' },
        data: {
          consecutiveUnpaidMonths: 3,
          status: 'DEFAULT_3_MONTHS',
        },
      });

      expect(result.ticketsInDefault3M).toBe(1);
      expect(result.ticketsInArrears).toBe(1);

      // Verify default warning was dispatched
      const logs = notificationService.getSentNotificationLog();
      const warningNotice = logs.find((l) => l.templateType === 'DEFAULT_WARNING');
      expect(warningNotice).toBeDefined();
      expect(warningNotice?.recipientPhone).toBe('9842143210');
      expect(warningNotice?.messageText).toContain('3 மாத தவணைகள் நிலுவையில் உள்ளது');
    });

    it('should restore ticket status from DEFAULT_3_MONTHS back to ACTIVE when dues are cleared', async () => {
      const cutoff = new Date('2026-10-19T00:00:00Z');

      prismaMock.installmentDue.findMany.mockResolvedValue([]);

      // Previously DEFAULT_3_MONTHS, but subscriber has now paid latest dues
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'tkt-restored',
          ticketNumber: 7,
          consecutiveUnpaidMonths: 3,
          status: 'DEFAULT_3_MONTHS',
          customer: { fullName: 'S. Sundaram', phone: '9842143210' },
          chitGroup: { groupCode: 'KCA-1L-20M-01' },
          dues: [
            {
              installmentMonth: 3,
              status: DueStatus.PAID,
              netPayableAmount: 3750n,
              paidAmount: 3750n,
            },
          ],
        },
      ]);

      const result = await dailyArrearsService.processDailyOverdueAndArrears(cutoff);

      expect(prismaMock.subscriberTicket.update).toHaveBeenCalledWith({
        where: { id: 'tkt-restored' },
        data: {
          consecutiveUnpaidMonths: 0,
          status: 'ACTIVE',
        },
      });

      expect(result.ticketsInDefault3M).toBe(0);
      expect(result.ticketsInArrears).toBe(0);
    });
  });

  describe('2. NotificationService (DLT SMS & Bilingual WhatsApp Engine)', () => {
    it('should format and log Indian DLT SMS and WhatsApp notification on payment receipt', async () => {
      const res = await notificationService.dispatchPaymentReceipt({
        paymentId: 'pay-001',
        receiptNumber: 'KC-REC-PRD-2026-00412',
        recipientPhone: '9842143210',
        subscriberName: 'S. Sundaram',
        amountPaid: '3750',
        chitCode: 'KCA-1L-20M-01',
        ticketNumber: 7,
        paymentMode: 'CASH',
        transactionTimestamp: '19-Oct-2026 10:45 AM',
        receiptDownloadUrl: 'https://storage.kumaranfinance.com/receipt-00412.pdf',
        passbookAppUrl: 'https://app.kumaranfinance.com/passbook/tkt-7',
      });

      expect(res.smsId).toBeDefined();
      expect(res.whatsappId).toBeDefined();

      const logs = notificationService.getSentNotificationLog();
      expect(logs.length).toBe(2);

      const sms = logs.find((l) => l.channel === 'SMS_DLT');
      expect(sms?.messageText).toContain('Kumaran Chits: Received Rs.3,750 for Chit KCA-1L-20M-01, Ticket #7');
      expect(sms?.messageText).toContain('Receipt: KC-REC-PRD-2026-00412');

      const whatsapp = logs.find((l) => l.channel === 'WHATSAPP');
      expect(whatsapp?.messageText).toContain('வணக்கம் திரு. *S. Sundaram*');
      expect(whatsapp?.messageText).toContain('செலுத்திய தொகை / Amount: *₹3,750*');
      expect(whatsapp?.messageText).toContain('https://storage.kumaranfinance.com/receipt-00412.pdf');
    });

    it('should dispatch free Mobile App Push Notification when fcmToken is available', async () => {
      const res = await notificationService.dispatchPaymentReceipt({
        paymentId: 'pay-002',
        receiptNumber: 'KC-REC-PRD-2026-00413',
        recipientPhone: '9842143210',
        subscriberName: 'S. Sundaram',
        amountPaid: '4100',
        chitCode: 'KCA-1L-20M-01',
        ticketNumber: 7,
        paymentMode: 'CASH',
        transactionTimestamp: '21-Oct-2026 11:30 AM',
        receiptDownloadUrl: 'https://storage.kumaranfinance.com/receipt-00413.pdf',
        passbookAppUrl: 'https://app.kumaranfinance.com/passbook/tkt-7',
        fcmToken: 'fcm-device-token-android-sundaram-phone',
      });

      expect(res.channel).toBe('PUSH_NOTIFICATION');
      expect(res.pushId).toBeDefined();
      expect(res.whatsappId).toBeDefined();

      const logs = notificationService.getSentNotificationLog();
      const pushNotif = logs.find((l) => l.channel === 'PUSH_NOTIFICATION');
      expect(pushNotif).toBeDefined();
      expect(pushNotif?.messageText).toContain('மாத தவணை தொகை ரூ. 4,100 பெறப்பட்டது! ரசீது எண்: KC-REC-PRD-2026-00413');
    });

    it('should broadcast upcoming auction reminder to subscribers in Tamil', async () => {
      const res = await notificationService.dispatchAuctionReminder({
        chitGroupId: 'group-001',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 4,
        auctionDate: '25-Oct-2026',
        auctionTime: '10:00 AM',
        branchName: 'Head Office',
        branchAddress: 'Perundurai, Erode',
        branchPhone: '+91 98765 43210',
        subscribers: [
          { name: 'S. Sundaram', phone: '9842143210' },
          { name: 'K. Palanisamy', phone: '9842111222' },
        ],
      });

      expect(res.dispatchedCount).toBe(2);
      const logs = notificationService.getSentNotificationLog();
      expect(logs.length).toBe(2);
      expect(logs[0].messageText).toContain('*மாதம் 4* ஏலம் கீழ்கண்ட தேதியில் நடைபெற உள்ளது');
      expect(logs[0].messageText).toContain('25-Oct-2026');
    });
  });

  describe('3. ReconciliationService (06:00 AM Payment Settlement)', () => {
    it('should match and reconcile valid payments when gateway status matches', async () => {
      prismaMock.payment.findFirst.mockResolvedValue({
        id: 'pay-001',
        paymentStatus: PaymentStatus.SUCCESS,
        amount: 3750n,
        transactionRef: 'ORDER-12345',
      });

      const result = await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: 'ORDER-12345',
          gatewayPaymentId: 'pay_9999',
          amount: 3750n,
          status: 'SUCCESS',
          settledAt: new Date(),
        },
      ]);

      expect(result.matchedCount).toBe(1);
      expect(result.autoResolvedGhostDropsCount).toBe(0);
      expect(result.exceptionCount).toBe(0);
    });

    it('should auto-resolve ghost drops when gateway is SUCCESS but internal is INITIATED', async () => {
      prismaMock.payment.findFirst.mockResolvedValue({
        id: 'pay-ghost',
        paymentStatus: PaymentStatus.INITIATED,
        amount: 3750n,
        transactionRef: 'ORDER-GHOST-99',
      });

      const result = await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: 'ORDER-GHOST-99',
          gatewayPaymentId: 'pay_ghost_1',
          amount: 3750n,
          status: 'SUCCESS',
          settledAt: new Date(),
        },
      ]);

      expect(result.autoResolvedGhostDropsCount).toBe(1);
      expect(prismaMock.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-ghost' },
        data: { paymentStatus: PaymentStatus.SUCCESS },
      });
    });

    it('should flag discrepancy when settlement amount does not match internal record', async () => {
      prismaMock.payment.findFirst.mockResolvedValue({
        id: 'pay-mismatch',
        paymentStatus: PaymentStatus.SUCCESS,
        amount: 3750n,
        transactionRef: 'ORDER-MISMATCH',
      });

      const result = await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: 'ORDER-MISMATCH',
          gatewayPaymentId: 'pay_mismatch_1',
          amount: 3000n, // Mismatch: 3000 vs 3750
          status: 'SUCCESS',
          settledAt: new Date(),
        },
      ]);

      expect(result.exceptionCount).toBe(1);
      expect(result.details[0]).toContain('Discrepancy on Order ORDER-MISMATCH');
    });
  });

  describe('4. BullMqQueueProvider & JobsController Endpoints', () => {
    it('should execute jobs directly in fallback mode and return execution status', async () => {
      const res = await queueProvider.addJob(
        'notification-queue',
        'dispatch-default-warning',
        {
          ticketId: 'tkt-01',
          customerName: 'S. Sundaram',
          customerPhone: '9842143210',
          chitCode: 'KCA-1L-20M-01',
          ticketNumber: 7,
          consecutiveUnpaidMonths: 3,
          totalOverdueAmount: '11250',
        },
      );

      expect(res.status).toBe('EXECUTED_DIRECT');
    });

    it('should return queue status reports for all queues', async () => {
      const reports = await queueProvider.getQueueStatusReports();
      expect(reports.length).toBe(3);
      expect(reports.map((r) => r.queueName)).toEqual([
        'daily-maintenance-queue',
        'notification-queue',
        'reconciliation-queue',
      ]);
    });

    it('should allow JobsController to run daily arrears check and return summary', async () => {
      prismaMock.installmentDue.findMany.mockResolvedValue([]);
      prismaMock.subscriberTicket.findMany.mockResolvedValue([]);

      const result = await jobsController.runDailyArrears('2026-10-19T00:00:00Z');
      expect(result.duesTransitionedToOverdue).toBe(0);
      expect(result.ticketsEvaluated).toBe(0);
    });
  });
});
