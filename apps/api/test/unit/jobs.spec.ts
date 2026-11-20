import { DueStatus, PaymentStatus, Role } from '@prisma/client';
import {
  JOB_DISPATCH_DEFAULT_WARNING,
  JOB_DISPATCH_PAYMENT_RECEIPT,
  NOTIFICATION_QUEUE,
} from '../../src/jobs/constants/queue-names.constant';
import { JobsController } from '../../src/jobs/jobs.controller';
import { BullMqQueueProvider } from '../../src/jobs/providers/bullmq-queue.provider';
import { RedisConnectionProvider } from '../../src/jobs/providers/redis-connection.provider';
import { AuctionReminderSchedulerService } from '../../src/jobs/services/auction-reminder-scheduler.service';
import { DailyArrearsService } from '../../src/jobs/services/daily-arrears.service';
import { NotificationService } from '../../src/jobs/services/notification.service';
import { ReconciliationService } from '../../src/jobs/services/reconciliation.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Component 3: BullMQ Background Queue & Daily Cron Worker Tests', () => {
  let prismaMock: any;
  let notificationService: NotificationService;
  let dailyArrearsService: DailyArrearsService;
  let reconciliationService: ReconciliationService;
  let auctionReminderSchedulerService: AuctionReminderSchedulerService;
  let redisProviderMock: any;
  let queueProvider: BullMqQueueProvider;
  let jobsController: JobsController;

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(async (cb) => cb(prismaMock)),
      installmentDue: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      subscriberTicket: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      receipt: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      auction: {
        findMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
    };

    const pushServiceMock = {
      sendPushNotification: jest.fn().mockResolvedValue({ messageId: 'push-partner-msg-01' }),
    };

    notificationService = new NotificationService(
      undefined,
      pushServiceMock as any,
      prismaMock as unknown as PrismaService,
    );
    notificationService.clearLog();

    dailyArrearsService = new DailyArrearsService(
      prismaMock as unknown as PrismaService,
      notificationService,
    );

    reconciliationService = new ReconciliationService(
      prismaMock as unknown as PrismaService,
      notificationService,
    );

    auctionReminderSchedulerService = new AuctionReminderSchedulerService(
      prismaMock as unknown as PrismaService,
      notificationService,
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
      auctionReminderSchedulerService,
    );
    queueProvider.onModuleInit();

    jobsController = new JobsController(
      dailyArrearsService,
      notificationService,
      reconciliationService,
      auctionReminderSchedulerService,
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

    it('JOB-02: should enqueue default warning via BullMqQueueProvider when queueProvider is present', async () => {
      const mockQueueProvider = {
        addJob: jest.fn().mockResolvedValue({ jobId: 'mock-job-id', status: 'ENQUEUED' }),
      };
      const arrearsServiceWithQueue = new DailyArrearsService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        mockQueueProvider as unknown as BullMqQueueProvider,
      );

      const cutoff = new Date('2026-10-19T00:00:00Z');
      prismaMock.installmentDue.findMany.mockResolvedValue([]);
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'tkt-default-queue',
          ticketNumber: 8,
          consecutiveUnpaidMonths: 2,
          status: 'ACTIVE',
          customer: { fullName: 'R. Ramasamy', phone: '9842199999', fcmToken: 'token-abc' },
          chitGroup: { groupCode: 'KCA-2L-20M-01' },
          dues: [
            { installmentMonth: 3, status: DueStatus.OVERDUE, netPayableAmount: 10000n, paidAmount: 0n },
            { installmentMonth: 2, status: DueStatus.OVERDUE, netPayableAmount: 10000n, paidAmount: 0n },
            { installmentMonth: 1, status: DueStatus.OVERDUE, netPayableAmount: 10000n, paidAmount: 0n },
          ],
        },
      ]);

      const dispatchSpy = jest.spyOn(notificationService, 'dispatchDefaultWarning');

      await arrearsServiceWithQueue.processDailyOverdueAndArrears(cutoff);

      expect(mockQueueProvider.addJob).toHaveBeenCalledWith(
        NOTIFICATION_QUEUE,
        JOB_DISPATCH_DEFAULT_WARNING,
        expect.objectContaining({
          ticketId: 'tkt-default-queue',
          customerName: 'R. Ramasamy',
          customerPhone: '9842199999',
          chitCode: 'KCA-2L-20M-01',
          ticketNumber: 8,
          consecutiveUnpaidMonths: 3,
          totalOverdueAmount: '30000',
          fcmToken: 'token-abc',
        }),
        expect.objectContaining({
          jobId: 'default-warning-tkt-default-queue-2026-10-19',
          priority: 2,
        }),
      );
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });

  describe('2. NotificationService (DLT SMS & Bilingual WhatsApp Engine)', () => {
    it('should format and log Indian DLT SMS notification on payment receipt (SMS sole confirmed channel per Q34)', async () => {
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
        receiptDownloadUrl: 'https://storage.kumaranfinance.in/receipt-00412.pdf',
        passbookAppUrl: 'https://app.kumaranfinance.in/passbook/tkt-7',
      });

      expect(res.smsId).toBeDefined();

      const logs = notificationService.getSentNotificationLog();
      expect(logs.length).toBe(1);

      const sms = logs.find((l) => l.channel === 'SMS_DLT');
      expect(sms?.messageText).toContain('Kumaran Chits: Received Rs.3,750 for Chit KCA-1L-20M-01, Ticket #7');
      expect(sms?.messageText).toContain('Receipt: KC-REC-PRD-2026-00412');

      // Assert that unapproved channels (e.g. WHATSAPP) are not present per Q34
      const whatsapp = logs.find((l) => (l as any).channel === 'WHATSAPP');
      expect(whatsapp).toBeUndefined();
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
        receiptDownloadUrl: 'https://storage.kumaranfinance.in/receipt-00413.pdf',
        passbookAppUrl: 'https://app.kumaranfinance.in/passbook/tkt-7',
        fcmToken: 'fcm-device-token-android-sundaram-phone',
      });

      expect(res.channel).toBe('PUSH_NOTIFICATION');
      expect(res.pushId).toBeDefined();

      const logs = notificationService.getSentNotificationLog();
      const pushNotif = logs.find((l) => l.channel === 'PUSH_NOTIFICATION');
      expect(pushNotif).toBeDefined();
      expect(pushNotif?.messageText).toContain('மாத தவணை தொகை ரூ. 4,100 பெறப்பட்டது! ரசீது எண்: KC-REC-PRD-2026-00413');
    });

    it('should asynchronously trigger receipt PDF pre-rendering when PdfService is injected', async () => {
      const pdfServiceMock = {
        generateReceiptPdf: jest.fn().mockResolvedValue({
          buffer: Buffer.from('%PDF-1.4 mock'),
          key: 'receipts/PRD/2026/KC-REC-PRD-2026-00414.pdf',
          presignedUrl: 'https://storage.kumaranfinance.in/receipt-00414.pdf',
        }),
      };

      const pushServiceMock = {
        sendPushNotification: jest.fn().mockResolvedValue({ messageId: 'push-partner-msg-01' }),
      };

      const serviceWithPdf = new NotificationService(
        undefined,
        pushServiceMock as any,
        prismaMock as unknown as PrismaService,
        undefined,
        pdfServiceMock as any,
      );

      await serviceWithPdf.dispatchPaymentReceipt({
        paymentId: 'pay-003',
        receiptNumber: 'KC-REC-PRD-2026-00414',
        recipientPhone: '9842143210',
        subscriberName: 'S. Sundaram',
        amountPaid: '5000',
        chitCode: 'KCA-1L-20M-01',
        ticketNumber: 7,
        paymentMode: 'CASH',
        transactionTimestamp: '21-Oct-2026 12:00 PM',
        receiptDownloadUrl: 'https://storage.kumaranfinance.in/receipt-00414.pdf',
        passbookAppUrl: 'https://app.kumaranfinance.in/passbook/tkt-7',
      });

      expect(pdfServiceMock.generateReceiptPdf).toHaveBeenCalledWith('pay-003');
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

    it('should route auction reminders to Push for app users and SMS fallback for keypad phone users', async () => {
      notificationService.clearLog();
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
          { name: 'S. Sundaram', phone: '9842143210', fcmToken: 'fcm-token-app-user' },
          { name: 'K. Palanisamy', phone: '9842111222' }, // Keypad phone user
        ],
      });

      expect(res.dispatchedCount).toBe(2);
      expect(res.pushCount).toBe(1);
      expect(res.smsCount).toBe(1);

      const logs = notificationService.getSentNotificationLog();
      const pushNotif = logs.find((l) => l.recipientPhone === '9842143210');
      const smsNotif = logs.find((l) => l.recipientPhone === '9842111222');

      expect(pushNotif?.channel).toBe('PUSH_NOTIFICATION');
      expect(smsNotif?.channel).toBe('SMS_DLT');
    });

    it('should route 3-month default warning to Push when fcmToken is present and SMS fallback when absent', async () => {
      notificationService.clearLog();

      // App user with fcmToken
      const appResult = await notificationService.dispatchDefaultWarning({
        ticketId: 'tkt-app',
        customerName: 'S. Sundaram',
        customerPhone: '9842143210',
        chitCode: 'KCA-1L-20M-01',
        ticketNumber: 7,
        consecutiveUnpaidMonths: 3,
        totalOverdueAmount: '11250',
        fcmToken: 'fcm-sundaram-phone',
      });
      expect(appResult.channel).toBe('PUSH_NOTIFICATION');

      // Keypad user without fcmToken
      const keypadResult = await notificationService.dispatchDefaultWarning({
        ticketId: 'tkt-keypad',
        customerName: 'K. Palanisamy',
        customerPhone: '9842111222',
        chitCode: 'KCA-1L-20M-01',
        ticketNumber: 12,
        consecutiveUnpaidMonths: 3,
        totalOverdueAmount: '11250',
      });
      expect(keypadResult.channel).toBe('SMS_DLT');
    });

    it('should broadcast auction result and dividend credit to subscribers via Push and SMS fallback', async () => {
      notificationService.clearLog();
      const res = await notificationService.dispatchAuctionResult({
        chitGroupId: 'group-001',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 4,
        winningTicketNumber: 7,
        winningDiscountAmount: '25000',
        dividendPerTicket: '1050',
        nextMonthNetPayable: '3950',
        subscribers: [
          { name: 'S. Sundaram', phone: '9842143210', fcmToken: 'fcm-sundaram' },
          { name: 'K. Palanisamy', phone: '9842111222' }, // Keypad phone user
        ],
      });

      expect(res.dispatchedCount).toBe(2);
      expect(res.pushCount).toBe(1);
      expect(res.smsCount).toBe(1);

      const logs = notificationService.getSentNotificationLog();
      const pushNotif = logs.find((l) => l.recipientPhone === '9842143210');
      const smsNotif = logs.find((l) => l.recipientPhone === '9842111222');

      expect(pushNotif?.channel).toBe('PUSH_NOTIFICATION');
      expect(pushNotif?.messageText).toContain('லாபப்பங்கு ரூ. 1,050');
      expect(smsNotif?.channel).toBe('SMS_DLT');
      expect(smsNotif?.messageText).toContain('Your dividend credit is Rs.1,050');
    });

    it('should dispatch high-priority approval push alerts strictly to active statutory partners (Role.PARTNER) and exclude maker user (Guardrails 10 & 11, SEC-01)', async () => {
      notificationService.clearLog();

      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'partner-02',
          name: 'Partner B (Checker)',
          phone: '9842199881',
          fcmToken: 'fcm-partner-b-token',
        },
      ]);

      const res = await notificationService.dispatchApprovalAlert({
        approvalType: 'REVERSAL_APPROVAL',
        title: 'திருப்புதல் ஒப்புதல் தேவை / Reversal Approval Required',
        body: 'Payment reversal of Rs. 3,750 pending checker approval.',
        entityId: 'pay-001',
        amount: '3750',
        excludeUserId: 'partner-01', // Maker is Partner A
        data: { paymentId: 'pay-001' },
      });

      expect(res.dispatchedCount).toBe(1);
      expect(res.partnerCount).toBe(1);

      // Verify that query strictly targets Role.PARTNER and does NOT query SUPER_ADMIN or BRANCH_MANAGER
      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: {
          roles: { has: Role.PARTNER },
          isActive: true,
          fcmToken: { not: null },
          id: { not: 'partner-01' },
        },
        select: {
          id: true,
          name: true,
          phone: true,
          fcmToken: true,
        },
      });

      // Assert that neither SUPER_ADMIN nor BRANCH_MANAGER are queried
      const queryWhere = prismaMock.user.findMany.mock.calls[0][0].where;
      expect(queryWhere.roles).toEqual({ has: Role.PARTNER });
      expect(queryWhere.roles).not.toHaveProperty('hasSome');

      const logs = notificationService.getSentNotificationLog();
      expect(logs).toHaveLength(1);
      expect(logs[0].templateType).toBe('REVERSAL_APPROVAL');
      expect(logs[0].recipientPhone).toBe('9842199881');
      expect(logs[0].channel).toBe('PUSH_NOTIFICATION');
    });

    it('should query active partners without id exclusion when excludeUserId is not specified', async () => {
      notificationService.clearLog();
      prismaMock.user.findMany.mockClear();

      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'partner-01',
          name: 'Partner A',
          phone: '9842199880',
          fcmToken: 'fcm-partner-a-token',
        },
      ]);

      const res = await notificationService.dispatchApprovalAlert({
        approvalType: 'DISBURSEMENT_APPROVAL',
        title: 'பட்டுவாடா ஒப்புதல் தேவை / Disbursement Approval Required',
        body: 'Prize payout pending verification.',
        entityId: 'disb-001',
        amount: '95000',
        data: {},
      });

      expect(res.dispatchedCount).toBe(1);
      expect(res.partnerCount).toBe(1);

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: {
          roles: { has: Role.PARTNER },
          isActive: true,
          fcmToken: { not: null },
        },
        select: {
          id: true,
          name: true,
          phone: true,
          fcmToken: true,
        },
      });

      const queryWhere = prismaMock.user.findMany.mock.calls[0][0].where;
      expect(queryWhere.id).toBeUndefined();
      expect(queryWhere.roles).toEqual({ has: Role.PARTNER });
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
      const mockPayment = {
        id: 'pay-ghost',
        branchId: 'branch-prd-001',
        paymentStatus: PaymentStatus.INITIATED,
        paymentMethod: 'UPI',
        amount: 3750n,
        transactionRef: 'ORDER-GHOST-99',
        notes: null,
        allocations: [
          {
            id: 'alloc-1',
            installmentDueId: 'due-ghost-1',
            ticketId: 'tkt-ghost-1',
            amountAllocated: 3750n,
            due: {
              id: 'due-ghost-1',
              installmentMonth: 3,
              status: DueStatus.UNPAID,
            },
            ticket: {
              id: 'tkt-ghost-1',
              ticketNumber: 5,
              status: 'ACTIVE',
              customer: {
                fullName: 'M. Palanisamy',
                phone: '9842100005',
                fcmToken: null,
              },
              chitGroup: {
                groupCode: 'KCA-1L-20M-01',
                branchId: 'branch-prd-001',
                branch: { code: 'PRD' },
              },
            },
          },
        ],
        receipt: null,
      };

      prismaMock.payment.findFirst.mockResolvedValue(mockPayment);
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.payment.update.mockResolvedValue({
        ...mockPayment,
        paymentStatus: PaymentStatus.SUCCESS,
      });
      prismaMock.installmentDue.update.mockResolvedValue({
        id: 'due-ghost-1',
        status: DueStatus.PAID,
        paidAmount: 3750n,
      });
      prismaMock.installmentDue.findMany.mockResolvedValue([]);
      prismaMock.subscriberTicket.update.mockResolvedValue({
        id: 'tkt-ghost-1',
        consecutiveUnpaidMonths: 0,
      });
      prismaMock.receipt.findUnique.mockResolvedValue(null);
      prismaMock.receipt.findFirst.mockResolvedValue({
        receiptNumber: 'KC-REC-PRD-2026-00010',
      });
      prismaMock.receipt.create.mockResolvedValue({
        id: 'rec-new',
        receiptNumber: 'KC-REC-PRD-2026-00011',
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
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-ghost' },
          data: expect.objectContaining({ paymentStatus: PaymentStatus.SUCCESS }),
        }),
      );
      expect(prismaMock.installmentDue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'due-ghost-1' },
          data: expect.objectContaining({ status: DueStatus.PAID, paidAmount: 3750n }),
        }),
      );
      expect(prismaMock.receipt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentId: 'pay-ghost',
            receiptNumber: 'KC-REC-PRD-2026-00011',
          }),
        }),
      );
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

    it('JOB-02: should enqueue payment receipt via BullMqQueueProvider when queueProvider is present', async () => {
      const mockQueueProvider = {
        addJob: jest.fn().mockResolvedValue({ jobId: 'mock-rec-job', status: 'ENQUEUED' }),
      };
      const reconServiceWithQueue = new ReconciliationService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        mockQueueProvider as unknown as BullMqQueueProvider,
      );

      const mockPayment = {
        id: 'pay-ghost-queue',
        branchId: 'branch-prd-001',
        paymentStatus: PaymentStatus.INITIATED,
        paymentMethod: 'UPI',
        amount: 5000n,
        transactionRef: 'ORDER-GHOST-Q',
        notes: null,
        allocations: [
          {
            id: 'alloc-q',
            installmentDueId: 'due-ghost-q',
            ticketId: 'tkt-ghost-q',
            amountAllocated: 5000n,
            due: { id: 'due-ghost-q', installmentMonth: 2, status: DueStatus.UNPAID },
            ticket: {
              id: 'tkt-ghost-q',
              ticketNumber: 9,
              status: 'ACTIVE',
              customer: { fullName: 'V. Murugan', phone: '9842188888', fcmToken: 'fcm-murugan' },
              chitGroup: { groupCode: 'KCA-1L-20M-01', branchId: 'branch-prd-001', branch: { code: 'PRD' } },
            },
          },
        ],
        receipt: null,
      };

      prismaMock.payment.findFirst.mockResolvedValue(mockPayment);
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.payment.update.mockResolvedValue({ ...mockPayment, paymentStatus: PaymentStatus.SUCCESS });
      prismaMock.installmentDue.update.mockResolvedValue({ id: 'due-ghost-q', status: DueStatus.PAID, paidAmount: 5000n });
      prismaMock.installmentDue.findMany.mockResolvedValue([]);
      prismaMock.subscriberTicket.update.mockResolvedValue({ id: 'tkt-ghost-q', consecutiveUnpaidMonths: 0 });
      prismaMock.receipt.findUnique.mockResolvedValue(null);
      prismaMock.receipt.findFirst.mockResolvedValue({ receiptNumber: 'KC-REC-PRD-2026-00050' });
      prismaMock.receipt.create.mockResolvedValue({ id: 'rec-q-new', receiptNumber: 'KC-REC-PRD-2026-00051' });

      const dispatchReceiptSpy = jest.spyOn(notificationService, 'dispatchPaymentReceipt');

      await reconServiceWithQueue.reconcileSettlement([
        {
          gatewayOrderId: 'ORDER-GHOST-Q',
          gatewayPaymentId: 'pay_gateway_q',
          amount: 5000n,
          status: 'SUCCESS',
          settledAt: new Date('2026-10-29T10:00:00Z'),
        },
      ]);

      expect(mockQueueProvider.addJob).toHaveBeenCalledWith(
        NOTIFICATION_QUEUE,
        JOB_DISPATCH_PAYMENT_RECEIPT,
        expect.objectContaining({
          paymentId: 'pay-ghost-queue',
          receiptNumber: 'KC-REC-PRD-2026-00051',
          recipientPhone: '9842188888',
          subscriberName: 'V. Murugan',
          amountPaid: '5000',
          chitCode: 'KCA-1L-20M-01',
          ticketNumber: 9,
          paymentMode: 'UPI',
          fcmToken: 'fcm-murugan',
        }),
        expect.objectContaining({
          jobId: 'receipt-KC-REC-PRD-2026-00051',
          priority: 1,
        }),
      );
      expect(dispatchReceiptSpy).not.toHaveBeenCalled();
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

    it('should execute JOB_DISPATCH_AUCTION_RESULT and JOB_DISPATCH_APPROVAL_ALERT directly in fallback mode', async () => {
      const auctionRes = await queueProvider.addJob(
        'notification-queue',
        'dispatch-auction-result',
        {
          chitGroupId: 'group-001',
          chitCode: 'KCA-1L-20M-01',
          installmentMonth: 4,
          winningTicketNumber: 7,
          winningDiscountAmount: '25000',
          dividendPerTicket: '1050',
          nextMonthNetPayable: '3950',
          subscribers: [
            { name: 'S. Sundaram', phone: '9842143210', fcmToken: 'fcm-sundaram' },
          ],
        },
      );
      expect(auctionRes.status).toBe('EXECUTED_DIRECT');

      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'partner-02',
          name: 'Partner B',
          phone: '9842199881',
          fcmToken: 'fcm-token-b',
        },
      ]);

      const alertRes = await queueProvider.addJob(
        'notification-queue',
        'dispatch-approval-alert',
        {
          approvalType: 'DISBURSEMENT_APPROVAL',
          title: 'பரிசு தொகை ஒப்புதல் தேவை',
          body: 'Prize money pending authorization',
          entityId: 'auction-01',
          excludeUserId: 'maker-user-01',
          data: { auctionId: 'auction-01' },
        },
      );
      expect(alertRes.status).toBe('EXECUTED_DIRECT');
    });

    it('PERF-01: should execute JOB_GENERATE_STATUTORY_PDF directly in fallback mode via pdfService', async () => {
      const mockPdfService = {
        processAsyncPdfJob: jest.fn().mockResolvedValue({
          jobId: 'stat-job-1',
          status: 'COMPLETED',
        }),
      };

      const providerWithPdf = new BullMqQueueProvider(
        redisProviderMock as unknown as RedisConnectionProvider,
        dailyArrearsService,
        notificationService,
        reconciliationService,
        auctionReminderSchedulerService,
        mockPdfService as any,
      );

      const res = await providerWithPdf.addJob(
        'daily-maintenance-queue',
        'generate-statutory-pdf',
        {
          jobId: 'stat-job-1',
          type: 'PASSBOOK',
          entityId: 'tkt-01',
        },
      );

      expect(res.status).toBe('EXECUTED_DIRECT');
      expect(mockPdfService.processAsyncPdfJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'stat-job-1',
          type: 'PASSBOOK',
          entityId: 'tkt-01',
        }),
      );
    });

    it('should allow JobsController to run daily arrears check and return summary', async () => {
      prismaMock.installmentDue.findMany.mockResolvedValue([]);
      prismaMock.subscriberTicket.findMany.mockResolvedValue([]);

      const result = await jobsController.runDailyArrears('2026-10-19T00:00:00Z');
      expect(result.duesTransitionedToOverdue).toBe(0);
      expect(result.ticketsEvaluated).toBe(0);
    });
  });

  describe('5. Repeatable Cron Schedules & AuctionReminderSchedulerService', () => {
    it('should scan scheduled auctions on target date and dispatch reminders to subscribers', async () => {
      const mockAuctionDate = new Date('2026-10-25T10:30:00Z');
      const mockAuctions = [
        {
          id: 'auc-001',
          installmentMonth: 4,
          auctionDate: mockAuctionDate,
          chitGroup: {
            id: 'group-001',
            groupCode: 'KCA-1L-20M-01',
            branch: {
              name: 'Head Office - Perundurai',
              addressLine1: 'Main Road, Perundurai',
              phone: '0424-2223333',
            },
            tickets: [
              {
                id: 'tkt-01',
                customer: {
                  fullName: 'S. Sundaram',
                  phone: '9842143210',
                  fcmToken: 'fcm-token-app-user',
                },
              },
              {
                id: 'tkt-02',
                customer: {
                  fullName: 'K. Palanisamy',
                  phone: '9842111222',
                  fcmToken: null,
                },
              },
            ],
          },
        },
      ];

      prismaMock.auction.findMany.mockResolvedValue(mockAuctions);

      const res = await auctionReminderSchedulerService.scanAndBroadcastUpcomingAuctions(mockAuctionDate);
      expect(res.chitsCount).toBe(1);
      expect(res.remindersCount).toBe(2);
      expect(res.details[0]).toContain('KCA-1L-20M-01 Month 4: 2 reminders dispatched (1 Push, 1 SMS)');
    });

    it('should handle zero scheduled auctions gracefully', async () => {
      prismaMock.auction.findMany.mockResolvedValue([]);

      const res = await auctionReminderSchedulerService.scanAndBroadcastUpcomingAuctions();
      expect(res.chitsCount).toBe(0);
      expect(res.remindersCount).toBe(0);
      expect(res.details.length).toBe(0);
    });

    it('should allow JobsController to run pre-auction scan manually', async () => {
      prismaMock.auction.findMany.mockResolvedValue([]);

      const res = await jobsController.runPreAuctionScan('2026-10-25T00:00:00Z');
      expect(res.chitsCount).toBe(0);
      expect(res.remindersCount).toBe(0);
    });

    it('should return empty repeatable list when queues are operating in direct fallback mode', async () => {
      const schedules = await jobsController.getRepeatableSchedules();
      expect(Array.isArray(schedules)).toBe(true);
      expect(schedules.length).toBe(0);
    });
  });
});
