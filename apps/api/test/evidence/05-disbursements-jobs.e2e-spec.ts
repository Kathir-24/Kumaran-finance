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
      .send({ identifier: '9876543210', password: 'Admin@Kumaran2026' });
    superAdminToken = adminLogin.body.data.accessToken;

    // Login Checker Partner (Super Admin - Checker)
    const checkerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ identifier: '9876543211', password: 'Admin@Kumaran2026' });
    checkerToken = checkerLogin.body.data.accessToken;

    // Login Branch Manager
    const bmLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ identifier: '9876543212', password: 'Admin@Kumaran2026' });
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

    it('TC-HP-04: Releases prize payout and tags official payment reference', async () => {
      const releaseRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/auction/${targetAuction.id}/disburse`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          paymentReference: 'SBI-CHQ-004512',
          notes: 'Cheque handed over in person',
        });

      expect(releaseRes.status).toBe(200);
      expect(releaseRes.body.success).toBe(true);
      expect(releaseRes.body.data.winner.disbursementStatus).toBe('DISBURSED');
      expect(releaseRes.body.data.winner.paymentReference).toBe('SBI-CHQ-004512');
    });

    it('TC-HP-05: Generates bilingual payout voucher (PDF Stream or JSON URL)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/disbursements/auction/${targetAuction.id}/voucher`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.voucherNumber).toBeDefined();
      expect(res.body.data.isBilingual).toBe(true);
      expect(res.body.data.formattedText).toBeDefined();
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
  });
});
