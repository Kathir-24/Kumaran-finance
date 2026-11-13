// ==============================================================================
// Kumaran Chits — Ambiguous Failure & Network Disconnect Chaos Integration Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/document-and-storage-architecture.md
// Invariants: Zero Orphan S3 DB Records & Financial Ledger Telecom Non-Blocking
// ==============================================================================

import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, PaymentMethod, DueStatus } from '@prisma/client';
import { AuthService } from '../../src/auth/auth.service';
import { CustomerService } from '../../src/customer/customer.service';
import { DisbursementService } from '../../src/disbursement/disbursement.service';
import { PaymentService } from '../../src/payment/payment.service';
import { StorageService } from '../../src/storage/storage.service';
import { Msg91SmsDriver } from '../../src/notification/drivers/msg91-sms.driver';
import { NotificationService } from '../../src/jobs/services/notification.service';
import { PushService } from '../../src/notification/services/push.service';
import { KycDocumentType } from '../../src/customer/dto/upload-customer-document.dto';

describe('Ambiguous Failure & Network Disconnect Chaos Integration Tests (Real DB)', () => {
  let prisma: PrismaClient;
  let isDbConnected = false;
  let storageService: StorageService;
  let customerService: CustomerService;
  let disbursementService: DisbursementService;

  let makerUserId = '';
  let branchId = '';
  let activeChitGroupId = '';
  let activeTicketId = '';

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ||
            'postgresql://chitflow:chitflow_dev_only@localhost:5433/chitflow_dev',
        },
      },
    });

    try {
      await prisma.$queryRaw`SELECT 1`;
      isDbConnected = true;

      storageService = new StorageService(
        { get: (key: string) => (key === 'STORAGE_DRIVER' ? 'local' : null) } as any,
      );
      customerService = new CustomerService(prisma as any, storageService);
      disbursementService = new DisbursementService(prisma as any, storageService);

      // Resolve Maker
      const maker = await prisma.user.findFirst({ where: { phone: '9876543210' } });
      makerUserId = maker?.id || '';

      // Resolve branch
      const branch = await prisma.branch.findFirst();
      branchId = branch?.id || '';

      // Resolve active chit group and ticket
      const ticket = await prisma.subscriberTicket.findFirst({
        where: { status: 'ACTIVE', chitGroup: { status: 'ACTIVE' } },
        include: { chitGroup: true, customer: true },
      });
      if (ticket) {
        activeChitGroupId = ticket.chitGroupId;
        activeTicketId = ticket.id;
      }
    } catch {
      isDbConnected = false;
      console.warn(
        '⚠️ PostgreSQL 17 is not accessible. Skipping live database chaos tests.',
      );
    }
  }, 15000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 1: S3 Mid-Upload Disconnect on KYC Document (Zero Orphan Records)
  // --------------------------------------------------------------------------
  it('CHAOS-S3-1: Network disconnect during KYC upload MUST fail closed without leaving orphan CustomerDocument records in DB', async () => {
    if (!isDbConnected || !branchId) {
      console.warn('Skipping CHAOS-S3-1: DB not connected');
      return;
    }

    const timestamp = Date.now();
    const testCustomer = await prisma.customer.create({
      data: {
        customerCode: `KC-CUST-CHAOS-KYC-${timestamp}`,
        fullName: 'Chaos Test Customer KYC',
        phone: `91993${String(timestamp).slice(-5)}1`,
        addressLine1: 'Chaos Avenue',
        city: 'Perundurai',
        pincode: '638052',
        isKycVerified: false,
        branchId,
      },
    });

    // Mock storageService.uploadFile to simulate mid-stream socket drop / timeout
    const uploadSpy = jest
      .spyOn(storageService, 'uploadFile')
      .mockRejectedValueOnce(new Error('S3 Storage Network Drop: ETIMEDOUT / Connection Reset'));

    const mockFile = {
      originalname: 'aadhaar_front_scan.jpg',
      mimetype: 'image/jpeg',
      size: 1024 * 350,
      buffer: Buffer.from('FAKE_ENCRYPTED_AADHAAR_BYTES'),
    };

    try {
      await expect(
        customerService.uploadDocument(
          testCustomer.id,
          { docType: KycDocumentType.AADHAAR_FRONT },
          mockFile,
        ),
      ).rejects.toThrow('S3 Storage Network Drop: ETIMEDOUT');

      // CRITICAL ASSERTION: Database has ZERO orphan document records
      const docCount = await prisma.customerDocument.count({
        where: { customerId: testCustomer.id },
      });
      expect(docCount).toBe(0);
    } finally {
      uploadSpy.mockRestore();
      await prisma.customer.delete({ where: { id: testCustomer.id } });
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 2: S3 Mid-Upload Disconnect on Safety Proof Collateral
  // --------------------------------------------------------------------------
  it('CHAOS-S3-2: Network disconnect during signed blank cheque upload MUST NOT update AuctionWinner or create orphan audit logs', async () => {
    if (!isDbConnected || !activeChitGroupId || !makerUserId || !branchId) {
      console.warn('Skipping CHAOS-S3-2: DB not connected');
      return;
    }

    const timestamp = Date.now();
    const isolatedCustomer = await prisma.customer.create({
      data: {
        customerCode: `KC-CUST-CHAOS-AUC-${timestamp}`,
        fullName: 'Chaos Cheque Customer',
        phone: `91992${String(timestamp).slice(-5)}2`,
        addressLine1: 'Perundurai Bypass',
        city: 'Erode',
        pincode: '638052',
        isKycVerified: true,
        branchId,
      },
    });

    const isolatedTicket = await prisma.subscriberTicket.create({
      data: {
        chitGroupId: activeChitGroupId,
        customerId: isolatedCustomer.id,
        ticketNumber: 9982,
        status: 'ACTIVE',
      },
    });

    // Create an isolated auction with an AuctionWinner
    const testAuction = await prisma.auction.create({
      data: {
        chitGroupId: activeChitGroupId,
        installmentMonth: 994,
        auctionDate: new Date(),
        status: 'SCHEDULED',
        winner: {
          create: {
            ticketId: isolatedTicket.id,
            disbursementStatus: 'PENDING_VERIFICATION',
            securityDocS3Key: null,
          },
        },
      },
      include: { winner: true },
    });

    const uploadSpy = jest
      .spyOn(storageService, 'uploadFile')
      .mockRejectedValueOnce(new Error('S3 Storage Network Drop: ETIMEDOUT / Connection Reset'));

    const mockChequeFile = {
      originalname: 'signed_blank_cheque_sbi.jpg',
      mimetype: 'image/jpeg',
      size: 1024 * 400,
      buffer: Buffer.from('FAKE_SIGNED_CHEQUE_IMAGE_BYTES'),
    };

    try {
      await expect(
        disbursementService.uploadSafetyProof(
          testAuction.id,
          mockChequeFile,
          makerUserId,
        ),
      ).rejects.toThrow('S3 Storage Network Drop: ETIMEDOUT');

      // CRITICAL ASSERTIONS:
      // 1. securityDocS3Key remains null in DB
      const winner = await prisma.auctionWinner.findUnique({
        where: { id: testAuction.winner!.id },
      });
      expect(winner?.securityDocS3Key).toBeNull();

      // 2. Audit log for document upload was NOT written
      const auditCount = await prisma.auditLog.count({
        where: {
          action: 'SAFETY_PROOF_DOCUMENT_UPLOADED',
          entityId: testAuction.winner!.id,
        },
      });
      expect(auditCount).toBe(0);
    } finally {
      uploadSpy.mockRestore();
      await prisma.auctionWinner.deleteMany({ where: { auctionId: testAuction.id } });
      await prisma.auction.delete({ where: { id: testAuction.id } });
      await prisma.subscriberTicket.delete({ where: { id: isolatedTicket.id } });
      await prisma.customer.delete({ where: { id: isolatedCustomer.id } });
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Telecom 504 Gateway Timeout Financial Isolation
  // --------------------------------------------------------------------------
  it('CHAOS-SMS-1: Downstream Indian telecom 504 Gateway Timeout MUST NOT rollback or delay the financial payment transaction', async () => {
    if (!isDbConnected || !activeTicketId || !makerUserId) {
      console.warn('Skipping CHAOS-SMS-1: DB not connected');
      return;
    }

    const testMonth = 10000 + Math.floor(Math.random() * 80000);

    // Create an isolated installment due in UNPAID status
    const testDue = await prisma.installmentDue.create({
      data: {
        ticketId: activeTicketId,
        chitGroupId: activeChitGroupId,
        installmentMonth: testMonth,
        grossAmount: 5000n,
        dividendDeduction: 1000n,
        netPayableAmount: 4000n,
        dueDate: new Date(),
        status: DueStatus.UNPAID,
      },
    });

    // Create a paymentService with a mock queue provider that simulates a 504 telecom error on enqueue
    const mockQueueProvider = {
      addJob: jest.fn().mockImplementation(() => {
        throw new Error('Telecom SMS Gateway HTTP 504: Gateway Timeout (TRAI DLT Unreachable)');
      }),
    };

    const isolatedPaymentService = new PaymentService(
      prisma as any,
      mockQueueProvider as any,
    );

    let paymentId: string | undefined;
    try {
      // Teller records collection payment
      const startTime = Date.now();
      const paymentResult = await isolatedPaymentService.recordPayment(
        {
          ticketId: activeTicketId,
          installmentMonth: testMonth,
          amount: 4000,
          paymentMethod: PaymentMethod.CASH,
          idempotencyKey: `chaos-telecom-504-${timestampNow()}`,
          notes: 'Chaos test for Indian telecom 504 isolation',
        },
        makerUserId,
        branchId,
      );
      paymentId = paymentResult.payment.id;
      const durationMs = Date.now() - startTime;

      // CRITICAL ASSERTION: Transaction succeeds immediately without blocking for downstream 5s telecom timeout
      expect(paymentResult).toBeDefined();
      expect(paymentResult.payment.paymentStatus).toBe('SUCCESS');
      expect(paymentResult.receipt.receiptNumber).toMatch(/^KC-REC-/);
      expect(durationMs).toBeLessThan(2000); // Unblocked response time (<2s vs 5s+ gateway hang)

      // CRITICAL ASSERTION: PostgreSQL ledger is 100% committed and consistent
      const finalDue = await prisma.installmentDue.findUnique({
        where: { id: testDue.id },
      });
      expect(finalDue?.status).toBe(DueStatus.PAID);
      expect(finalDue?.paidAmount).toBe(4000n);

      const allocation = await prisma.paymentAllocation.findFirst({
        where: { paymentId: paymentResult.payment.id },
      });
      expect(allocation?.amountAllocated).toBe(4000n);
    } finally {
      await prisma.paymentAllocation.deleteMany({ where: { installmentDueId: testDue.id } });
      if (paymentId) {
        await prisma.receipt.deleteMany({ where: { paymentId } });
        await prisma.payment.deleteMany({ where: { id: paymentId } });
      }
      await prisma.installmentDue.deleteMany({ where: { id: testDue.id } });
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Msg91SmsDriver Exponential Backoff Retry on 504 Timeout
  // --------------------------------------------------------------------------
  it('CHAOS-SMS-2: Msg91SmsDriver MUST retry with exponential backoff on HTTP 504 and succeed when gateway recovers', async () => {
    const driver = new Msg91SmsDriver({
      authKey: 'test-auth-key-chaos',
      senderId: 'KMRCHT',
      maxRetries: 2,
      retryBaseDelayMs: 25, // Fast delays for test execution
      timeoutMs: 2000,
    });

    let attemptCount = 0;
    const httpRequestSpy = jest.spyOn(driver as any, 'httpRequest').mockImplementation(async () => {
      attemptCount++;
      if (attemptCount <= 2) {
        // First 2 attempts encounter Indian telecom 504 Gateway Timeout
        return {
          success: false,
          statusCode: 504,
          error: 'HTTP 504: Gateway Timeout from Telecom SMSC',
        };
      }
      // 3rd attempt succeeds when telecom route recovers
      return {
        success: true,
        statusCode: 200,
        data: { request_id: 'dlt-req-recovered-778899' },
      };
    });

    const result = await driver.sendSms({
      to: '9842143210',
      message: 'Test receipt SMS with 504 recovery',
      dltTemplateId: '1407169823412093848',
    });

    expect(attemptCount).toBe(3); // 1 initial + 2 retries
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('dlt-req-recovered-778899');

    httpRequestSpy.mockRestore();
  });

  // --------------------------------------------------------------------------
  // Scenario 5: FCM Push Fallback Preservation on SMS Outage
  // --------------------------------------------------------------------------
  it('CHAOS-SMS-3: NotificationService MUST preserve delivery via Mobile App Push when telecom SMS driver is offline', async () => {
    const mockPushService: Partial<PushService> = {
      sendPushNotification: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'fcm-push-msg-chaos-123',
      }),
    };

    // SMS service simulates complete carrier network partition / offline
    const mockSmsService = {
      sendPaymentReceiptSms: jest.fn().mockRejectedValue(
        new Error('Carrier Partition: ECONNREFUSED control.msg91.com:443'),
      ),
    };

    const notificationService = new NotificationService(
      mockSmsService as any,
      mockPushService as any,
    );

    // Customer has active smartphone with FCM Token
    const payload = {
      paymentId: 'pay-chaos-001',
      receiptNumber: 'KC-REC-PRD-2026-00999',
      recipientPhone: '9842143210',
      fcmToken: 'fcm-token-android-pixel-001',
      subscriberName: 'K. Kathiresan',
      amountPaid: '4000',
      chitCode: 'KCA-1L-20M-01',
      ticketNumber: 7,
      paymentMode: 'CASH',
      transactionTimestamp: '30-Oct-2026 12:30 PM',
      receiptDownloadUrl: 'https://s3.kumaranfinance.in/receipts/KC-REC-00999.pdf',
      passbookAppUrl: 'https://app.kumaranfinance.in/passbook/7',
    };

    const res = await notificationService.dispatchPaymentReceipt(payload);

    // CRITICAL ASSERTION: Dispatched via ₹0 Mobile App Push Notification, bypassing dead SMS gateway
    expect(res.pushId).toBe('fcm-push-msg-chaos-123');
    expect(mockPushService.sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientToken: 'fcm-token-android-pixel-001',
        title: expect.stringContaining('Kumaran Finance'),
      }),
    );
    expect(mockSmsService.sendPaymentReceiptSms).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Redis Crash During Payment Recording (PostgreSQL Financial Truth Non-Blocking)
  // --------------------------------------------------------------------------
  it('CHAOS-REDIS-1: Redis crash during counter payment recording MUST commit PostgreSQL financial truth, while BullMQ degrades gracefully without failing payment', async () => {
    if (!isDbConnected || !activeTicketId || !makerUserId) {
      console.warn('Skipping CHAOS-REDIS-1: DB not connected');
      return;
    }

    const testMonth = 950 + Math.floor(Math.random() * 40);

    // Create an isolated installment due in UNPAID status
    const testDue = await prisma.installmentDue.create({
      data: {
        ticketId: activeTicketId,
        chitGroupId: activeChitGroupId,
        installmentMonth: testMonth,
        grossAmount: 5000n,
        dividendDeduction: 1000n,
        netPayableAmount: 4000n,
        dueDate: new Date(),
        status: DueStatus.UNPAID,
      },
    });

    // Mock BullMQ Queue Provider simulating active Redis Crash (ECONNREFUSED / socket hangup)
    const mockCrashQueueProvider = {
      addJob: jest.fn().mockImplementation(() => {
        throw new Error('RedisConnectionError: Connection is closed. Redis node crashed (ECONNREFUSED 127.0.0.1:6379)');
      }),
    };

    const redisChaosPaymentService = new PaymentService(
      prisma as any,
      mockCrashQueueProvider as any,
    );

    let paymentId: string | undefined;
    try {
      const startTime = Date.now();
      const paymentResult = await redisChaosPaymentService.recordPayment(
        {
          ticketId: activeTicketId,
          installmentMonth: testMonth,
          amount: 4000,
          paymentMethod: PaymentMethod.CASH,
          idempotencyKey: `chaos-redis-crash-${timestampNow()}`,
          notes: 'Chaos test for Redis crash financial ledger non-blocking',
        },
        makerUserId,
        branchId,
      );
      paymentId = paymentResult.payment.id;
      const durationMs = Date.now() - startTime;

      // CRITICAL ASSERTION 1: Payment succeeds and returns standard financial receipt envelope
      expect(paymentResult).toBeDefined();
      expect(paymentResult.payment.paymentStatus).toBe('SUCCESS');
      expect(paymentResult.receipt.receiptNumber).toMatch(/^KC-REC-/);
      expect(durationMs).toBeLessThan(2000);

      // CRITICAL ASSERTION 2: PostgreSQL (financial truth) is 100% committed with zero data loss
      const finalDue = await prisma.installmentDue.findUnique({
        where: { id: testDue.id },
      });
      expect(finalDue?.status).toBe(DueStatus.PAID);
      expect(finalDue?.paidAmount).toBe(4000n);

      const allocation = await prisma.paymentAllocation.findFirst({
        where: { paymentId: paymentResult.payment.id },
      });
      expect(allocation?.amountAllocated).toBe(4000n);

      // CRITICAL ASSERTION 3: BullMQ attempted enqueue, caught the Redis drop, and degraded gracefully
      expect(mockCrashQueueProvider.addJob).toHaveBeenCalledTimes(1);
    } finally {
      await prisma.paymentAllocation.deleteMany({ where: { installmentDueId: testDue.id } });
      if (paymentId) {
        await prisma.receipt.deleteMany({ where: { paymentId } });
        await prisma.payment.deleteMany({ where: { id: paymentId } });
      }
      await prisma.installmentDue.deleteMany({ where: { id: testDue.id } });
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 7: External SMS / DLT Gateway 504 Timeout during OTP Login (Fail-Closed & Uncorrupted Counter)
  // --------------------------------------------------------------------------
  it('CHAOS-SMS-4: Indian telecom gateway times out (504) -> requestOtp fails-closed with BadGatewayException, rolls back cooldown/session, and leaves user OTP attempt counter uncorrupted', async () => {
    if (!isDbConnected || !makerUserId) {
      console.warn('Skipping CHAOS-SMS-4: DB not connected');
      return;
    }

    const testStaffPhone = '9876543210'; // Seeded Super Admin user

    // Mock SMS service simulating Indian telecom 504 Gateway Timeout from TRAI DLT SMSC
    const mockFailingSmsService = {
      sendOtpSms: jest.fn().mockRejectedValue(
        new Error('HTTP 504: Gateway Timeout from TRAI DLT SMSC (Carrier network down)'),
      ),
    };

    const jwtService = new JwtService({ secret: 'chaos-test-jwt-secret-key-12345' });
    const configService = new ConfigService();

    const chaosAuthService = new AuthService(
      prisma as any,
      jwtService,
      configService,
      mockFailingSmsService as any,
    );

    // Initial precondition check: cooldown and lockout must be inactive
    const initialCooldown = await chaosAuthService.checkOtpCooldown(testStaffPhone);
    const initialLockout = await chaosAuthService.checkOtpLockout(testStaffPhone);
    expect(initialCooldown.active).toBe(false);
    expect(initialLockout.locked).toBe(false);

    // INVARIANT 1: requestOtp MUST fail-closed safely with BadGatewayException (HTTP 502/504)
    await expect(
      chaosAuthService.requestOtp({ phone: testStaffPhone }),
    ).rejects.toThrow(BadGatewayException);

    // INVARIANT 2: 60-second cooldown lock MUST be rolled back so the customer is NOT blocked when telecom recovers
    const postCooldown = await chaosAuthService.checkOtpCooldown(testStaffPhone);
    expect(postCooldown.active).toBe(false);
    expect(postCooldown.remainingSeconds).toBe(0);

    // INVARIANT 3: Brute-force lockout counter MUST NOT be incremented or corrupted (0 failed attempts)
    const postLockout = await chaosAuthService.checkOtpLockout(testStaffPhone);
    expect(postLockout.locked).toBe(false);
    expect(postLockout.remainingSeconds).toBe(0);

    // INVARIANT 4: Ghost OTP session MUST be cleared from store
    const verifyAttempt = chaosAuthService.verifyOtp({ phone: testStaffPhone, otp: '123456' });
    await expect(verifyAttempt).rejects.toThrow('OTP has expired or was not requested');

    // INVARIANT 5: Database user profile remains 100% active and uncorrupted
    const userInDb = await prisma.user.findUnique({ where: { phone: testStaffPhone } });
    expect(userInDb?.isActive).toBe(true);
  });
});

function timestampNow() {
  return Date.now().toString().slice(-6);
}
