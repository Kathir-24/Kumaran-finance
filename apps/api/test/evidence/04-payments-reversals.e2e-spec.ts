import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { TransformResponseInterceptor } from '../../src/common/interceptors/transform-response.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

describe('Evidence Suite 4: Payments, Discrete Math, Reversals & Idempotency (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let superAdminToken: string;
  let checkerToken: string;
  let branchManagerToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ||
      'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_test?schema=public';
    process.env.STORAGE_DRIVER = 'local';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api', {
      exclude: ['', '/', 'health', 'health/(.*)', 'metrics', 'api/docs', 'admin/queues', 'admin/queues/(.*)'],
    });

    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const reflector = app.get(Reflector);
    app.useGlobalInterceptors(
      new BigIntInterceptor(),
      new TransformResponseInterceptor(reflector),
    );

    app.useGlobalFilters(new GlobalExceptionFilter());

    await app.init();
    prisma = app.get(PrismaService);

    // Login Managing Partner (Super Admin)
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ identifier: '9876543210', password: 'Admin@Kumaran2026' });
    superAdminToken = adminLogin.body.data.accessToken;

    // Login Checker Partner (Super Admin)
    const checkerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ identifier: '9876543211', password: 'Admin@Kumaran2026' });
    checkerToken = checkerLogin.body.data.accessToken;

    // Login Branch Manager (Maker)
    const bmLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ identifier: '9876543212', password: 'Admin@Kumaran2026' });
    branchManagerToken = bmLogin.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ===========================================================================
  // 1. HAPPY PATH SCENARIOS & DEF-03 REGRESSION
  // ===========================================================================
  describe('Category 1 & 10: Happy Path & DEF-03 Notes Persistence', () => {
    it('TC-HP-01 & TC-REG-03: Records discrete counter payment with cashier notes persisted to PostgreSQL', async () => {
      const unpaidDue = await prisma.installmentDue.findFirst({
        where: { status: 'UNPAID' },
      });
      expect(unpaidDue).toBeDefined();

      const exactAmount = Number(unpaidDue!.netPayableAmount);
      const cashierNotes = 'Bilingual physical paper receipt issued at Perundurai head office';

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          ticketId: unpaidDue!.ticketId,
          installmentMonth: unpaidDue!.installmentMonth,
          amount: exactAmount,
          paymentMethod: PaymentMethod.CASH,
          notes: cashierNotes,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.payment.notes).toBe(cashierNotes);
      expect(res.body.data.receipt.receiptNumber).toMatch(/^KC-REC-/);

      // Verify directly in PostgreSQL that Payment.notes was persisted
      const dbPayment = await prisma.payment.findUnique({
        where: { id: res.body.data.payment.id },
        select: { id: true, notes: true, paymentStatus: true },
      });
      expect(dbPayment).toBeDefined();
      expect(dbPayment?.notes).toBe(cashierNotes);
      expect(dbPayment?.paymentStatus).toBe(PaymentStatus.SUCCESS);
    });

    it('TC-HP-02: Retrieves payment record by ID with allocations and receipt details', async () => {
      const recentPayment = await prisma.payment.findFirst({
        where: { paymentStatus: PaymentStatus.SUCCESS },
        orderBy: { createdAt: 'desc' },
      });
      expect(recentPayment).toBeDefined();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/payments/${recentPayment!.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(recentPayment!.id);
      expect(res.body.data.allocations).toBeDefined();
    });
  });

  // ===========================================================================
  // 2. REQUEST INPUT VALIDATION
  // ===========================================================================
  describe('Category 2: Request Input Validation', () => {
    it('TC-VAL-01: Rejects payment with negative amount', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          ticketId: '00000000-0000-0000-0000-000000000000',
          installmentMonth: 1,
          amount: -5000,
          paymentMethod: PaymentMethod.CASH,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details.some((d: string) => d.includes('positive'))).toBe(true);
    });

    it('TC-VAL-02: Rejects payment with invalid payment method enum', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          ticketId: '00000000-0000-0000-0000-000000000000',
          installmentMonth: 1,
          amount: 5000,
          paymentMethod: 'BITCOIN_CRYPTO',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // 3. BUSINESS RULES & ADR-07 DISCRETE PAYMENT MATH
  // ===========================================================================
  describe('Category 7: Business Rules & ADR-07 Math Invariants', () => {
    it('TC-BIZ-01: ADR-07 Partial Payment Rejection - Rejects partial payment amount strictly', async () => {
      const unpaidDue = await prisma.installmentDue.findFirst({
        where: { status: 'UNPAID' },
      });
      expect(unpaidDue).toBeDefined();

      const exactAmount = Number(unpaidDue!.netPayableAmount);
      const partialAmount = exactAmount - 500; // Underpaying by ₹500

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          ticketId: unpaidDue!.ticketId,
          installmentMonth: unpaidDue!.installmentMonth,
          amount: partialAmount,
          paymentMethod: PaymentMethod.CASH,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('PARTIAL_PAYMENTS_NOT_ALLOWED');
    });

    it('TC-BIZ-02: ADR-07 Double Payment Rejection - Rejects payment on already PAID installment due', async () => {
      const paidDue = await prisma.installmentDue.findFirst({
        where: { status: 'PAID' },
      });
      expect(paidDue).toBeDefined();

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          ticketId: paidDue!.ticketId,
          installmentMonth: paidDue!.installmentMonth,
          amount: Number(paidDue!.netPayableAmount),
          paymentMethod: PaymentMethod.CASH,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already been paid in full');
    });
  });

  // ===========================================================================
  // 4. MAKER != CHECKER PAYMENT REVERSAL SEPARATION OF DUTIES
  // ===========================================================================
  describe('Category 5 & 7: Maker != Checker Reversals (ADR-10)', () => {
    it('TC-BIZ-03: Dual Control - Maker cannot approve own payment reversal (403 Forbidden)', async () => {
      const unpaidDue = await prisma.installmentDue.findFirst({
        where: { status: 'UNPAID' },
      });

      if (!unpaidDue) return;

      // 1. Record payment to reverse
      const paymentRes = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          ticketId: unpaidDue.ticketId,
          installmentMonth: unpaidDue.installmentMonth,
          amount: Number(unpaidDue.netPayableAmount),
          paymentMethod: PaymentMethod.CASH,
        });

      const paymentId = paymentRes.body.data.payment.id;

      // 2. Super Admin Kumaran (Maker) requests reversal
      const reqRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/request-reversal`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          reason: 'WRONG_TICKET_ENTERED',
          notes: 'Customer Ticket 7 instead of Ticket 8',
        });

      expect(reqRes.status).toBe(200);

      // 3. Super Admin Kumaran (Maker) tries to approve own reversal -> MUST BE REJECTED 403
      const selfApproveRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/approve-reversal`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ notes: 'Self-approval attempt' });

      expect(selfApproveRes.status).toBe(403);
      expect(selfApproveRes.body.error.message).toContain('MAKER_CHECKER_VIOLATION');

      // 4. Independent Checker Partner Senthil approves reversal -> MUST SUCCEED 200
      const checkerApproveRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/approve-reversal`)
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({ notes: 'Verified reversal by Partner' });

      expect(checkerApproveRes.status).toBe(200);

      // Verify in DB that payment is REVERSED and due restored to UNPAID
      const updatedPayment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { paymentStatus: true },
      });
      expect(updatedPayment?.paymentStatus).toBe(PaymentStatus.REVERSED);

      const restoredDue = await prisma.installmentDue.findUnique({
        where: { id: unpaidDue.id },
        select: { status: true },
      });
      expect(restoredDue?.status).toBe('UNPAID');
    });
  });

  // ===========================================================================
  // 5. RELIABILITY & IDEMPOTENCY
  // ===========================================================================
  describe('Category 9: Reliability & Idempotency Key Handling', () => {
    it('TC-REL-01: Idempotency Key prevents duplicate payment creation on network retry', async () => {
      const unpaidDue = await prisma.installmentDue.findFirst({
        where: { status: 'UNPAID' },
      });

      if (!unpaidDue) return;

      const idempotencyKey = `idemp-key-test-${Date.now()}`;
      const paymentPayload = {
        ticketId: unpaidDue.ticketId,
        installmentMonth: unpaidDue.installmentMonth,
        amount: Number(unpaidDue.netPayableAmount),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey,
      };

      // First submission
      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send(paymentPayload);

      expect(firstRes.status).toBe(201);
      const firstPaymentId = firstRes.body.data.payment.id;

      // Duplicate submission with identical idempotencyKey
      const retryRes = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send(paymentPayload);

      expect(retryRes.status).toBe(201);
      expect(retryRes.body.data.payment.id).toBe(firstPaymentId);
      expect(retryRes.body.data.duplicateIgnored).toBe(true);
    });
  });
});
