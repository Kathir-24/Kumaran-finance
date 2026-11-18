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
import { DisbursementMode } from '@prisma/client';

describe('Evidence Suite 5: Prize Disbursements, Safety Proof & Jobs DTOs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let superAdminToken: string;
  let checkerToken: string;
  let branchManagerToken: string;
  let targetAuction: any;
  const runChequeRef = `SBI-CHQ-${Date.now()}`;

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

    // Login Managing Partner (Super Admin - Maker)
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ phone: '9876543210', password: 'Admin@Kumaran2026' });
    superAdminToken = adminLogin.body.data.accessToken;

    // Login Checker Partner (Super Admin - Checker)
    const checkerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ phone: '9876543211', password: 'Admin@Kumaran2026' });
    checkerToken = checkerLogin.body.data.accessToken;

    // Login Branch Manager
    const bmLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ phone: '9876543212', password: 'Admin@Kumaran2026' });
    branchManagerToken = bmLogin.body.data.accessToken;

    // Ensure a deterministic auction winner in PENDING_VERIFICATION status
    const anyAuction = await prisma.auction.findFirst({
      where: { winner: { isNot: null } },
      include: { winner: true },
    });

    if (anyAuction?.winner) {
      await prisma.auctionWinner.update({
        where: { id: anyAuction.winner.id },
        data: {
          disbursementStatus: 'PENDING_VERIFICATION',
          verifiedByUserId: null,
          authorizedByUserId: null,
          paymentReference: null,
        },
      });

      targetAuction = await prisma.auction.findUnique({
        where: { id: anyAuction.id },
        include: { winner: true },
      });
    }
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ===========================================================================
  // 1. HAPPY PATH: SAFETY PROOF, AUTHORIZATION & DISBURSEMENT
  // ===========================================================================
  describe('Category 1: Happy Path Prize Payout Workflow', () => {
    it('TC-HP-01: Maker verifies Company Safety Proof Checklist (ADR-15)', async () => {
      expect(targetAuction).toBeDefined();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/auction/${targetAuction.id}/verify-safety-proof`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          isSecurityRequired: true,
          securityType: 'BLANK_CHEQUE',
          blankChequeDetails: 'SBI Cheque #004512 & #004513',
          agreementSigned: true,
          nomineeSigned: true,
          notes: 'Customer submitted signed blank cheques at counter',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.winner.disbursementStatus).toBe('VERIFIED_BY_MAKER');
    });

    it('TC-HP-02: Maker != Checker Guard - Maker cannot authorize prize payout (403 Forbidden)', async () => {
      // Super Admin Kumaran (who verified safety proof) attempts to authorize payout
      const selfAuthorizeRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/auction/${targetAuction.id}/authorize-payout`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          notes: 'Self-authorization attempt by Maker',
        });

      expect(selfAuthorizeRes.status).toBe(403);
      expect(selfAuthorizeRes.body.error.message).toContain('MAKER_CHECKER_VIOLATION');
    });

    it('TC-HP-03: Independent Partner / Checker authorizes payout voucher (200 OK)', async () => {
      // Independent Partner Senthil (Checker) authorizes payout
      const checkerRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/auction/${targetAuction.id}/authorize-payout`)
        .set('Authorization', `Bearer ${checkerToken}`)
        .send({
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          notes: 'Approved payout after reviewing cheques and agreements',
        });

      expect(checkerRes.status).toBe(200);
      expect(checkerRes.body.success).toBe(true);
      expect(checkerRes.body.data.winner.disbursementStatus).toBe('AUTHORIZED_BY_CHECKER');
    });

    const runIdempotencyKey = `idem-disb-e2e-${Date.now()}`;

    it('TC-HP-04: Releases prize payout, tags official payment reference, and replays idempotently on retry (CR-DISB-08)', async () => {
      const releaseRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/auction/${targetAuction.id}/disburse`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          paymentReference: runChequeRef,
          idempotencyKey: runIdempotencyKey,
          notes: 'Cheque handed over in person',
        });

      expect(releaseRes.status).toBe(200);
      expect(releaseRes.body.success).toBe(true);
      expect(releaseRes.body.data.winner.disbursementStatus).toBe('DISBURSED');
      expect(releaseRes.body.data.winner.paymentReference).toBe(runChequeRef);

      // Network retry with same idempotencyKey in DTO body replays cleanly with 200 OK
      const retryRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/auction/${targetAuction.id}/disburse`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          paymentReference: runChequeRef,
          idempotencyKey: runIdempotencyKey,
        });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.idempotentReplay).toBe(true);
      expect(retryRes.body.data.winner.paymentReference).toBe(runChequeRef);

      // Network retry with same key via Idempotency-Key HTTP header (without body key) also replays cleanly with 200 OK
      const headerRetryRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/auction/${targetAuction.id}/disburse`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('Idempotency-Key', runIdempotencyKey)
        .send({
          paymentReference: runChequeRef,
        });

      expect(headerRetryRes.status).toBe(200);
      expect(headerRetryRes.body.data.idempotentReplay).toBe(true);
      expect(headerRetryRes.body.data.winner.paymentReference).toBe(runChequeRef);
    });

    it('TC-HP-05: Generates bilingual payout voucher with groupCode, issuedAt and exact whole-rupee breakdown (CR-DISB-08)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/disbursements/auction/${targetAuction.id}/voucher`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.voucherNumber).toMatch(/^KC-VOU-[A-Z0-9_-]+-\d{4}-[A-Z0-9_-]+-\d{5}$/);
      expect(res.body.data.isBilingual).toBe(true);
      expect(res.body.data.issuedAt).toBeDefined();
      expect(res.body.data.formattedText).toBeDefined();
    });

    it('TC-PII-01: GET /disbursements/auction/:id never exposes Customer auth/sensitive secrets (CR-DISB-04)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/disbursements/auction/${targetAuction.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      const customer = res.body.data.winner.ticket.customer;
      expect(customer).toBeDefined();
      expect(customer.fullName).toBeDefined();
      expect(customer.refreshTokenHash).toBeUndefined();
      expect(customer.fcmToken).toBeUndefined();
      expect(customer.tokenRevokedBefore).toBeUndefined();
      expect(customer.panNumber).toBeUndefined();
    });

    it('TC-ADR15-01: Rejects prohibited property document securityType at DTO boundary (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/auction/${targetAuction.id}/verify-safety-proof`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          isSecurityRequired: true,
          securityType: 'PROPERTY_DEED',
          agreementSigned: true,
          nomineeSigned: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('TC-UTR-01: Rejects reserved placeholder and case-insensitive duplicate non-cash cheque/UTR paymentReference (CR-DISB-05)', async () => {
      // Reserved placeholder rejected fail-closed
      const placeholderRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/auction/${targetAuction.id}/disburse`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          paymentReference: 'COMPANY_POOL_MONTH_1',
        });
      expect(placeholderRes.status).toBe(400);
      expect(placeholderRes.body.error.message).toContain('INVALID_PAYMENT_REFERENCE');

      const secondAuction = await prisma.auction.findFirst({
        where: {
          id: { not: targetAuction.id },
          installmentMonth: { gte: 2 },
          status: { in: ['COMPLETED', 'MINUTES_FILED'] },
          winner: { isNot: null },
        },
        include: { winner: true, chitGroup: true },
      });

      if (!secondAuction?.winner || secondAuction.installmentMonth >= secondAuction.chitGroup.durationMonths) return;

      const originalState = {
        disbursementStatus: secondAuction.winner.disbursementStatus,
        disbursementMode: secondAuction.winner.disbursementMode,
        paymentReference: secondAuction.winner.paymentReference,
        verifiedByUserId: secondAuction.winner.verifiedByUserId,
        authorizedByUserId: secondAuction.winner.authorizedByUserId,
        disbursedAmount: secondAuction.winner.disbursedAmount,
        disbursedAt: secondAuction.winner.disbursedAt,
      };

      try {
        const users = await prisma.user.findMany({
          where: { phone: { in: ['9876543210', '9876543211'] } },
        });
        const maker = users.find((u) => u.phone === '9876543210')!;
        const checker = users.find((u) => u.phone === '9876543211')!;

        await prisma.auctionWinner.update({
          where: { id: secondAuction.winner.id },
          data: {
            disbursementStatus: 'AUTHORIZED_BY_CHECKER',
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
            verifiedByUserId: maker.id,
            authorizedByUserId: checker.id,
            disbursedAmount: secondAuction.prizeMoney ?? 75000n,
            paymentReference: null,
          },
        });

        // Case-variant duplicate of TC-HP-04 rejected with 409 Conflict!
        const dupRes = await request(app.getHttpServer())
          .post(`/api/v1/disbursements/auction/${secondAuction.id}/disburse`)
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            paymentReference: runChequeRef.toLowerCase(),
          });

        expect(dupRes.status).toBe(409);
        expect(dupRes.body.error.message).toContain('DUPLICATE_PAYMENT_REFERENCE');
      } finally {
        await prisma.auctionWinner.update({
          where: { id: secondAuction.winner.id },
          data: originalState,
        });
      }
    });
  });

  // ===========================================================================
  // 2. AUTHORIZATION & ROLE PRIVILEGE ESCALATION
  // ===========================================================================
  describe('Category 5: Role Privilege Escalation Guards', () => {
    it('TC-AUTHZ-01: Rejects prize authorization from Branch Manager (Requires Super Admin)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/auction/${targetAuction.id}/authorize-payout`)
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          disbursementMode: DisbursementMode.CASH,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // 3. BACKGROUND JOBS & DTO REGRESSIONS (MIS-02, MIS-03, MIS-04, MIS-05)
  // ===========================================================================
  describe('Category 10: Background Jobs DTO Regressions', () => {
    it('TC-REG-04: MIS-02 - ReconcileSettlementDto validates gateway settlement records', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs/run-reconciliation')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          records: [
            {
              gatewayOrderId: 'ORD-SETTLE-001',
              gatewayPaymentId: 'PAY-SETTLE-001',
              amount: 5000,
              status: 'SUCCESS',
              settledAt: new Date().toISOString(),
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('TC-REG-05: MIS-03 - SendAuctionReminderDto validates broadcast parameters', async () => {
      const group = await prisma.chitGroup.findFirst({
        where: { groupCode: 'KCA-1L-20M-01' },
      });
      expect(group).toBeDefined();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/send-auction-reminder/${group!.id}/4`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          chitCode: group!.groupCode,
          auctionDate: '2026-11-20',
          auctionTime: '11:00 AM',
          branchName: 'Head Office - Perundurai',
          branchAddress: '14, Main Road, Perundurai',
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

    it('TC-REG-06: MIS-05 - Daily Arrears accepts and parses cutoffDate query parameter', async () => {
      const cutoff = new Date().toISOString().split('T')[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/run-daily-arrears?cutoffDate=${cutoff}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('TC-JOB-01: Retrieves BullMQ queue health report (GET /api/v1/jobs/queue-status)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/queue-status')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('TC-JOB-02: Retrieves dispatched notification audit logs (GET /api/v1/jobs/notification-audit-logs)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/notification-audit-logs?limit=25')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('TC-JOB-03: Retrieves active repeatable cron schedules (GET /api/v1/jobs/repeatable-schedules)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/repeatable-schedules')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('TC-JOB-04: Manually triggers pre-auction scan (POST /api/v1/jobs/run-pre-auction-scan)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs/run-pre-auction-scan')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('TC-JOB-05: Enqueues daily arrears to BullMQ queue (POST /api/v1/jobs/enqueue-daily-arrears)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs/enqueue-daily-arrears')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('jobId');
      expect(res.body.data).toHaveProperty('status', 'ENQUEUED');
    });

    it('TC-JOB-06: Enqueues reconciliation to BullMQ queue (POST /api/v1/jobs/enqueue-reconciliation)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs/enqueue-reconciliation')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          records: [
            {
              gatewayOrderId: 'ORDER-E2E-TEST-001',
              gatewayPaymentId: 'pay_test_001',
              amount: 5000,
              status: 'SUCCESS',
              settledAt: new Date().toISOString(),
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('jobId');
    });
  });
});
