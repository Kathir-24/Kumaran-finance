import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { BigIntInterceptor } from '../src/common/interceptors/bigint.interceptor';
import { TransformResponseInterceptor } from '../src/common/interceptors/transform-response.interceptor';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentMethod, PaymentStatus, Role } from '@prisma/client';

describe('Live PostgreSQL Contract & Remediation Verification (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let superAdminToken: string;
  let superAdminId: string;
  let checkerToken: string;
  let branchManagerToken: string;

  beforeAll(async () => {
    // 1. Point to dedicated isolated test database
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
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Health and Unversioned Route Guard', () => {
    it('GET /health - should return healthy status without version prefix', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('chitflow-api');
    });
  });

  describe('2. Authentication Flow & Token Verification', () => {
    it('POST /api/v1/auth/web/login - Managing Partner (Super Admin)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/web/login')
        .send({
          identifier: '9876543210',
          password: 'Admin@Kumaran2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.roles).toContain(Role.SUPER_ADMIN);

      superAdminToken = res.body.data.accessToken;
      superAdminId = res.body.data.user.id;
    });

    it('POST /api/v1/auth/web/login - Checker Partner (Super Admin)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/web/login')
        .send({
          identifier: '9876543211',
          password: 'Admin@Kumaran2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      checkerToken = res.body.data.accessToken;
    });

    it('POST /api/v1/auth/web/login - Branch Manager (Maker)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/web/login')
        .send({
          identifier: '9876543212',
          password: 'Admin@Kumaran2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      branchManagerToken = res.body.data.accessToken;
    });

    it('POST /api/v1/auth/mobile/login-mpin - Field Agent quick unlock via 6-digit MPIN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mobile/login-mpin')
        .send({
          phone: '9876543214',
          mpin: '123456',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.roles).toContain(Role.COLLECTION_AGENT);
    });

    it('GET /api/v1/auth/me - should return authenticated profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(superAdminId);
      expect(res.body.data.roles).toContain(Role.SUPER_ADMIN);
    });
  });

  describe('3. DEF-01 & DEF-02 Verification (FCM Token Updates)', () => {
    it('PATCH /api/v1/auth/fcm-token - updates staff user FCM push token (DEF-02 fix: roles: true)', async () => {
      const testToken = 'fcm_staff_token_test_' + Date.now();
      const res = await request(app.getHttpServer())
        .patch('/api/v1/auth/fcm-token')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ fcmToken: testToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify in PostgreSQL database
      const user = await prisma.user.findUnique({
        where: { id: superAdminId },
        select: { id: true, roles: true, fcmToken: true },
      });
      expect(user).toBeDefined();
      expect(user?.fcmToken).toBe(testToken);
      expect(user?.roles).toContain(Role.SUPER_ADMIN);
    });

    it('PATCH /api/v1/customers/:id/fcm-token - updates customer FCM push token (DEF-01 fix: phone: true)', async () => {
      const customer = await prisma.customer.findFirst({
        where: { isKycVerified: true },
      });
      expect(customer).toBeDefined();

      const testToken = 'fcm_cust_token_test_' + Date.now();
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customer!.id}/fcm-token`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ fcmToken: testToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fcmToken).toBe(testToken);

      // Verify in PostgreSQL database
      const dbCust = await prisma.customer.findUnique({
        where: { id: customer!.id },
        select: { fcmToken: true },
      });
      expect(dbCust?.fcmToken).toBe(testToken);
    });
  });

  describe('4. DEF-03 Verification (Payment Notes Persistence & Zero Silent Data Loss)', () => {
    it('POST /api/v1/payments - persists cashier notes and prevents silent data loss', async () => {
      // Find an unpaid installment due
      const unpaidDue = await prisma.installmentDue.findFirst({
        where: {
          status: 'UNPAID',
        },
        include: {
          ticket: {
            include: { customer: true },
          },
        },
      });

      expect(unpaidDue).toBeDefined();
      const expectedAmount = Number(unpaidDue!.netPayableAmount);
      const testNotes = 'Counter cash collection - bilingual paper receipt handed over';

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          ticketId: unpaidDue!.ticketId,
          installmentMonth: unpaidDue!.installmentMonth,
          amount: expectedAmount,
          paymentMethod: PaymentMethod.CASH,
          notes: testNotes,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.payment.notes).toBe(testNotes);
      const paymentId = res.body.data.payment.id;

      // Verify directly in PostgreSQL database that notes was persisted to disk
      const dbPayment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { id: true, amount: true, notes: true, paymentStatus: true },
      });

      expect(dbPayment).toBeDefined();
      expect(dbPayment?.notes).toBe(testNotes);
      expect(dbPayment?.paymentStatus).toBe(PaymentStatus.SUCCESS);
    });
  });

  describe('5. Dual Control: Maker != Checker Enforcements', () => {
    it('Maker requests payment reversal; Maker cannot approve own reversal (403 Forbidden)', async () => {
      // Find an unpaid installment due to create a fresh payment
      const unpaidDue = await prisma.installmentDue.findFirst({
        where: {
          status: 'UNPAID',
        },
      });

      if (!unpaidDue) {
        return;
      }

      const paymentRes = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          ticketId: unpaidDue.ticketId,
          installmentMonth: unpaidDue.installmentMonth,
          amount: Number(unpaidDue.netPayableAmount),
          paymentMethod: PaymentMethod.CASH,
          notes: 'Payment to test reversal Maker-Checker guard',
        });

      expect(paymentRes.status).toBe(201);
      const paymentId = paymentRes.body.data.payment.id;

      // Step 1: Super Admin Kumaran (Maker) requests reversal
      const reqReversalRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/request-reversal`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          reason: 'ENTRY_MISTAKE',
          notes: 'Accidental duplicate entry test',
        });

      expect(reqReversalRes.status).toBe(200);

      // Step 2: Super Admin Kumaran (Maker) attempts to approve own reversal -> MUST BE REJECTED 403
      const selfApproveRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/approve-reversal`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ notes: 'Self-approval attempt' });

      expect(selfApproveRes.status).toBe(403);
      expect(selfApproveRes.body.error.message).toContain('MAKER_CHECKER_VIOLATION');

      // Step 3: Independent Partner / Checker (Senthil) approves reversal -> MUST SUCCEED 200
      const checkerApproveRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/approve-reversal`)
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({ notes: 'Verified reversal request by Partner' });

      expect(checkerApproveRes.status).toBe(200);

      // Verify in DB that payment is REVERSED and due is restored to UNPAID
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

  describe('6. Auction Ceiling Guard (ADR-06 & 1/4 Chit Value)', () => {
    it('rejects bid discount exceeding 25% of chit value with 400 Bad Request', async () => {
      // Scheme KCA-1L-20M-01 chitValue is 100,000 => Max discount is 25,000 (1/4)
      const group = await prisma.chitGroup.findFirst({
        where: { groupCode: 'KCA-1L-20M-01' },
      });
      expect(group).toBeDefined();

      const memberTicket = await prisma.subscriberTicket.findFirst({
        where: {
          chitGroupId: group!.id,
          ticketNumber: 5,
        },
      });
      expect(memberTicket).toBeDefined();

      // Submit bid of 30,000 (30% > 25% ceiling)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/auctions/${group!.id}/record-bid?month=2`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          ticketId: memberTicket!.id,
          bidDiscount: 30000,
          auctionDate: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('exceeds maximum allowable 1/4 ceiling');
    });
  });

  describe('7. Jobs & Maintenance Endpoints (MIS-02, MIS-03, MIS-04, MIS-05 DTOs)', () => {
    it('POST /api/v1/jobs/run-reconciliation - validates ReconcileSettlementDto', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs/run-reconciliation')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          records: [
            {
              gatewayOrderId: 'ORD-LIVE-TEST-001',
              gatewayPaymentId: 'PAY-LIVE-TEST-001',
              amount: 5000,
              status: 'SUCCESS',
              settledAt: new Date().toISOString(),
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/v1/jobs/send-auction-reminder/:chitGroupId/:month - validates SendAuctionReminderDto', async () => {
      const group = await prisma.chitGroup.findFirst({
        where: { groupCode: 'KCA-1L-20M-01' },
      });
      expect(group).toBeDefined();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/send-auction-reminder/${group!.id}/2`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          chitCode: group!.groupCode,
          auctionDate: '2026-11-15',
          auctionTime: '10:30 AM',
          branchName: 'Head Office - Perundurai',
          branchAddress: '14/2, Main Road, Perundurai',
          branchPhone: '9876543210',
          subscribers: [
            {
              name: 'S. Sundaram',
              phone: '9842143210',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/v1/jobs/run-daily-arrears - processes daily arrears with query param cutoffDate', async () => {
      const cutoff = new Date().toISOString().split('T')[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/run-daily-arrears?cutoffDate=${cutoff}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });
});
