import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { TransformResponseInterceptor } from '../../src/common/interceptors/transform-response.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Evidence Suite 3: Chits, 1/4 Ceiling, Option A Ties & Invariants (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let superAdminToken: string;
  let group1L: any;
  let tickets1L: any[];

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

    // Login Super Admin
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({
        phone: '9876543210',
        password: 'Admin@Kumaran2026',
      });
    superAdminToken = loginRes.body.data.accessToken;

    // Fetch seeded Chit Group KCA-1L-20M-01
    group1L = await prisma.chitGroup.findFirst({
      where: { groupCode: 'KCA-1L-20M-01' },
    });

    tickets1L = await prisma.subscriberTicket.findMany({
      where: { chitGroupId: group1L.id },
      orderBy: { ticketNumber: 'asc' },
    });
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ===========================================================================
  // 1. HAPPY PATH SCENARIOS
  // ===========================================================================
  describe('Category 1: Happy Path Scenarios', () => {
    it('TC-HP-01: Lists active chit schemes with locked 4.00% foreman commission', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/chits?search=KCA-1L-20M-01')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThan(0);

      const target = res.body.data.data.find((g: any) => g.groupCode === 'KCA-1L-20M-01');
      expect(target).toBeDefined();
      expect(typeof target.foremanCommissionRate).toBe('number');
      expect(target.foremanCommissionRate).toBe(4);
    });

    it('TC-HP-01B: Unfiltered catalog cache miss and Redis cache hit both return numeric foremanCommissionRate', async () => {
      const firstRes = await request(app.getHttpServer())
        .get('/api/v1/chits')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.data.data.length).toBeGreaterThan(0);
      for (const scheme of firstRes.body.data.data) {
        expect(typeof scheme.foremanCommissionRate).toBe('number');
      }
      const firstTarget =
        firstRes.body.data.data.find((g: any) => g.groupCode === 'KCA-1L-20M-01') ??
        firstRes.body.data.data[0];
      expect(firstTarget.foremanCommissionRate).toBe(4);

      const secondRes = await request(app.getHttpServer())
        .get('/api/v1/chits')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.data.length).toBeGreaterThan(0);
      for (const scheme of secondRes.body.data.data) {
        expect(typeof scheme.foremanCommissionRate).toBe('number');
      }
      const secondTarget =
        secondRes.body.data.data.find((g: any) => g.groupCode === 'KCA-1L-20M-01') ??
        secondRes.body.data.data[0];
      expect(secondTarget.foremanCommissionRate).toBe(4);
    });

    it('TC-HP-02: Retrieves single chit scheme details including branch and ticket limits', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/chits/${group1L.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.groupCode).toBe('KCA-1L-20M-01');
      expect(res.body.data.durationMonths).toBe(20);
      expect(res.body.data.chitValue).toBe(100000);
    });

    it('TC-HP-03: Lists assigned subscriber ticket roster (1..N) with customer mapping', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/chits/${group1L.id}/tickets`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(20);
      expect(res.body.data[0].ticketNumber).toBe(1);
    });
  });

  // ===========================================================================
  // 2. REQUEST INPUT VALIDATION
  // ===========================================================================
  describe('Category 2: Request Input Validation', () => {
    it('TC-VAL-01: Rejects auction bid recording with missing ticketId', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/auctions/${group1L.id}/record-bid?month=2`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          bidDiscount: 20000,
          auctionDate: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details.some((d: string) => d.includes('Ticket ID'))).toBe(true);
    });

    it('TC-VAL-02: Rejects auction bid recording with negative bid discount', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/auctions/${group1L.id}/record-bid?month=2`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          ticketId: tickets1L[1].id,
          bidDiscount: -5000,
          auctionDate: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details.some((d: string) => d.includes('positive'))).toBe(true);
    });
  });

  // ===========================================================================
  // 3. DATABASE INTEGRITY & ADR-13 TICKET LIMIT CONSTRAINT
  // ===========================================================================
  describe('Category 6: Database Integrity & ADR-13 Constraint', () => {
    it('TC-DB-01: Rejects assigning 2nd ticket to customer who already holds a ticket in the same chit group (ADR-13)', async () => {
      // 1. Create a draft chit group for ticket allocation test
      const draftGroup = await prisma.chitGroup.create({
        data: {
          branchId: group1L.branchId,
          groupCode: `KCT-DRAFT-${Date.now()}`,
          groupName: 'Draft Test Group for ADR-13 Check',
          chitValue: 100000n,
          durationMonths: 20,
          totalTickets: 20,
          baseInstallment: 5000n,
          status: 'DRAFT',
          foremanCommissionRate: new Prisma.Decimal('4.00'),
          maxDiscountCeiling: 25000n,
          startDate: new Date(),
          endDate: new Date(Date.now() + 86400000 * 30 * 20),
        },
      });

      const customerId = tickets1L[1].customerId;

      // 2. Allocate Ticket #1 to customer
      await prisma.subscriberTicket.create({
        data: {
          chitGroupId: draftGroup.id,
          customerId,
          ticketNumber: 1,
        },
      });

      // 3. Attempt to assign Ticket #2 to the SAME customer in draftGroup -> MUST BE REJECTED 409
      const res = await request(app.getHttpServer())
        .post(`/api/v1/chits/${draftGroup.id}/tickets/assign`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          ticketNumber: 2,
          customerId,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('ADR-13 Violation: Customer already holds a ticket');
    });
  });

  // ===========================================================================
  // 4. BUSINESS RULES & STATUTORY INVARIANTS
  // ===========================================================================
  describe('Category 7: Business Rules & ADR Invariants', () => {
    it('TC-BIZ-01: ADR-06 1/4 Discount Ceiling - Rejects bid discount exceeding 25% of total chit value', async () => {
      // 1 Lakh chit scheme has 25% ceiling of 25,000. Bid of 28,000 must be rejected.
      const res = await request(app.getHttpServer())
        .post(`/api/v1/auctions/${group1L.id}/record-bid?month=2`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          ticketId: tickets1L[2].id,
          bidDiscount: 28000,
          auctionDate: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('exceeds maximum allowable 1/4 ceiling');
    });

    it('TC-BIZ-02: Records valid in-ceiling auction bid ($4% \\le D \\le V/4$)', async () => {
      // Valid bid: ₹20,000 (between ₹4,000 commission and ₹25,000 ceiling)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/auctions/${group1L.id}/record-bid?month=2`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          ticketId: tickets1L[2].id,
          bidDiscount: 20000,
          auctionDate: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bidDiscount).toBe(20000);
      expect(res.body.data.foremanCommissionAmount).toBe(4000);
      expect(res.body.data.totalDividend).toBe(16000);
      expect(res.body.data.dividendPerTicket).toBe(800); // 16,000 / 20 = 800 equal universal dividend
      expect(res.body.data.prizeMoney).toBe(80000); // 100,000 - 20,000 = 80,000
    });

    it('TC-BIZ-03: Option A Physical Tie-Break Protocol - Records physical token draw when multiple members bid ceiling', async () => {
      // Month 3: Test physical token tie-break draw at exact ceiling ₹25,000
      const tiedTickets = [
        { ticketId: tickets1L[3].id, tokenNumber: 1 },
        { ticketId: tickets1L[4].id, tokenNumber: 2 },
      ];

      const res = await request(app.getHttpServer())
        .post(`/api/v1/auctions/${group1L.id}/tie-break?month=3`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          bidDiscount: 25000,
          tiedTickets,
          winningTicketId: tickets1L[4].id, // Physical paper token #2 drawn
          auctionDate: new Date().toISOString(),
          witnessNames: ['S. Sundaram', 'K. Murugesan'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bidDiscount).toBe(25000); // Maximum 1/4 ceiling locked
      expect(res.body.data.prizeMoney).toBe(75000);
      expect(res.body.data.winner.ticketId).toBe(tickets1L[4].id);
    });
  });
});
