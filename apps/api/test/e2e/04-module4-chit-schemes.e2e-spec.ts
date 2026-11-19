import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { ChitStatus, DisbursementMode, DueStatus, InitializationMode, PaymentMethod, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { TransformResponseInterceptor } from '../../src/common/interceptors/transform-response.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Module 4: Chit Scheme Management & Mid-Cycle Intake E2E Suite', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  // Authenticated Role Tokens & User IDs
  let managingPartnerToken: string; // PARTNER (Maker)
  let managingPartnerId: string;
  let checkerPartnerToken: string; // PARTNER (Checker)
  let checkerPartnerId: string;
  let itAdminToken: string; // SUPER_ADMIN (Non-Partner IT Admin)
  let itAdminId: string;
  let branchManagerToken: string; // BRANCH_MANAGER (Staff Maker)
  let branchManagerId: string;
  let accountantToken: string; // ACCOUNTANT (Staff Maker)
  let accountantId: string;
  let fieldAgentToken: string; // COLLECTION_AGENT
  let auditorToken: string; // AUDITOR (Read-only Compliance)
  let customerToken: string; // CUSTOMER (Subscriber)
  let primaryCustomerId: string;

  // Pre-seeded customer pool for ticket assignments (minimum 25 customers)
  let sampleCustomers: Array<{ id: string; customerCode: string; fullName: string; phone: string }>;
  let defaultBranchId: string;

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
    jwtService = app.get(JwtService);

    // Fetch active default branch
    const branch = await prisma.branch.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    defaultBranchId = branch!.id;

    // 1. Login Managing Partner (Partner)
    const adminRes = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ phone: '9876543210', password: 'Admin@Kumaran2026' });
    managingPartnerToken = adminRes.body.data.accessToken;
    managingPartnerId = adminRes.body.data.user.id;

    // 2. Login Checker Partner (Partner)
    const checkerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ phone: '9876543211', password: 'Admin@Kumaran2026' });
    checkerPartnerToken = checkerRes.body.data.accessToken;
    checkerPartnerId = checkerRes.body.data.user.id;

    // 3. Login Branch Manager (BRANCH_MANAGER)
    const bmRes = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ phone: '9876543212', password: 'Admin@Kumaran2026' });
    branchManagerToken = bmRes.body.data.accessToken;
    branchManagerId = bmRes.body.data.user.id;

    // 4. Login Desk Accountant (ACCOUNTANT)
    const accRes = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ phone: '9876543213', password: 'Admin@Kumaran2026' });
    accountantToken = accRes.body.data.accessToken;
    accountantId = accRes.body.data.user.id;

    // 5. Login Field Agent (COLLECTION_AGENT)
    const faRes = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ phone: '9876543214', password: 'Admin@Kumaran2026' });
    fieldAgentToken = faRes.body.data.accessToken;

    // 6. Login CA Auditor (AUDITOR)
    const audRes = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ phone: '9876543216', password: 'Admin@Kumaran2026' });
    auditorToken = audRes.body.data.accessToken;

    // 7. Seed & Login Administrative Non-Partner Super Admin (roles: [Role.SUPER_ADMIN]) for ADR-21 / ADR-27 / Guardrail 11 tests
    const itAdminPhone = '9876543299';
    const itAdminUser = await prisma.user.upsert({
      where: { phone: itAdminPhone },
      update: { roles: [Role.SUPER_ADMIN] },
      create: {
        branchId: defaultBranchId,
        name: 'IT Support Super Admin (Non-Partner)',
        phone: itAdminPhone,
        passwordHash: await bcrypt.hash('Admin@Kumaran2026', 10),
        roles: [Role.SUPER_ADMIN],
        isActive: true,
      },
    });
    itAdminId = itAdminUser.id;

    const itAdminRes = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ phone: itAdminPhone, password: 'Admin@Kumaran2026' });
    itAdminToken = itAdminRes.body.data.accessToken;

    // 8. Fetch sample customers (guarantee at least 25 customers available)
    sampleCustomers = await prisma.customer.findMany({
      take: 30,
      select: { id: true, customerCode: true, fullName: true, phone: true },
      orderBy: { customerCode: 'asc' },
    });

    // If fewer than 25 customers exist, create additional test customers
    while (sampleCustomers.length < 25) {
      const idx = sampleCustomers.length + 1;
      const newCust = await prisma.customer.create({
        data: {
          branchId: defaultBranchId,
          customerCode: `KC-CUST-GEN-${idx.toString().padStart(4, '0')}`,
          fullName: `Generated Customer ${idx}`,
          phone: `9842${idx.toString().padStart(6, '0')}`,
          addressLine1: 'Perundurai Road',
          city: 'Perundurai',
          pincode: '638052',
        },
        select: { id: true, customerCode: true, fullName: true, phone: true },
      });
      sampleCustomers.push(newCust);
    }

    primaryCustomerId = sampleCustomers[0].id;
    customerToken = jwtService.sign({
      sub: primaryCustomerId,
      phone: sampleCustomers[0].phone,
      roles: [Role.CUSTOMER],
      tokenType: 'access',
    });
  }, 45000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ===========================================================================
  // TIER 1: FEATURE COVERAGE (HAPPY PATH, CRUD & LIFECYCLE)
  // ===========================================================================
  describe('Tier 1: Feature Coverage & Scheme Operations', () => {
    const freshGroupCode = `KCE2E-F1-${Date.now()}`;
    let freshSchemeId: string;
    let naturallyCompletedSchemeId: string;

    it('TC-T1-F01-01: Creates a fresh chit group starting Month 1 via POST /chits/new with Whole Rupee math', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: freshGroupCode,
          groupName: '₹1 Lakh 20-Month Tier-1 Scheme',
          groupNameTamil: '₹1 லட்சம் 20 மாதங்கள் திட்டம்',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
          sanctionOrderNumber: 'TN/ERD/2026/011',
          sanctionDate: '2026-11-10T00:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.groupCode).toBe(freshGroupCode);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.initMode).toBe('NEW_GROUP');
      expect(res.body.data.onboardedAtMonth).toBe(1);
      expect(res.body.data.chitValue).toBe(100000);
      expect(res.body.data.baseInstallment).toBe(5000);
      expect(res.body.data.foremanCommissionRate).toBe(4);
      expect(res.body.data.maxDiscountCeiling).toBe(25000);
      expect(res.body.data.createdByUserId).toBe(managingPartnerId);
      freshSchemeId = res.body.data.id;
    });

    it('TC-T1-F01-02: Creates fresh chit group using the root route alias POST /chits', async () => {
      const aliasCode = `KCALIAS-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/chits')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: aliasCode,
          groupName: 'Alias Root Test Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.groupCode).toBe(aliasCode);
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('TC-T1-F02-01: Lists chit schemes with pagination and status filter (GET /chits)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/chits?search=${freshGroupCode}`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.data)).toBe(true);
      const match = res.body.data.data.find((g: any) => g.groupCode === freshGroupCode);
      expect(match).toBeDefined();
      expect(typeof match.foremanCommissionRate).toBe('number');
      expect(match.foremanCommissionRate).toBe(4);
      expect(typeof match.chitValue).toBe('number');
      expect(match.chitValue).toBe(100000);
    });

    it('TC-T1-F03-01: Retrieves complete chit scheme details by ID (GET /chits/:id)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/chits/${freshSchemeId}`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(freshSchemeId);
      expect(res.body.data.groupCode).toBe(freshGroupCode);
      expect(res.body.data.baseInstallment).toBe(5000);
      expect(res.body.data.branch).toBeDefined();
      expect(Array.isArray(res.body.data.tickets)).toBe(true);
    });

    it('TC-T1-F03-02: Returns HTTP 404 for non-existent scheme UUID (GET /chits/:id)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/chits/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('TC-T1-F04-01: Updates draft chit scheme parameters (PATCH /chits/:id)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/chits/${freshSchemeId}`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupName: 'Updated ₹1 Lakh 20-Month Tier-1 Scheme',
          sanctionOrderNumber: 'TN/ERD/2026/011-REV1',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.groupName).toBe('Updated ₹1 Lakh 20-Month Tier-1 Scheme');
      expect(res.body.data.sanctionOrderNumber).toBe('TN/ERD/2026/011-REV1');
    });

    it('TC-T1-F05-ASSIGN-01: Assigns Ticket #1 to customer in DRAFT status (POST /chits/:id/tickets/assign)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/chits/${freshSchemeId}/tickets/assign`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          ticketNumber: 1,
          customerId: sampleCustomers[0].id,
          openingBalance: 0,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ticketNumber).toBe(1);
      expect(res.body.data.isPrized).toBe(false);
      expect(res.body.data.customer.id).toBe(sampleCustomers[0].id);
    });

    it('TC-T1-F05-ASSIGN-02: Assigns Ticket #2 with non-zero opening balance (POST /chits/:id/tickets/assign)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/chits/${freshSchemeId}/tickets/assign`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          ticketNumber: 2,
          customerId: sampleCustomers[1].id,
          openingBalance: 1500,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.ticketNumber).toBe(2);
      expect(res.body.data.customer.id).toBe(sampleCustomers[1].id);
    });

    it('TC-T1-F06-01: Unassigns ticket #2 in DRAFT status (DELETE /chits/:id/tickets/:ticketNumber)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/chits/${freshSchemeId}/tickets/2`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('unassigned successfully');
    });

    it('TC-T1-F06-02: Reassigns the freed Ticket #2 to customer 2', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/chits/${freshSchemeId}/tickets/assign`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          ticketNumber: 2,
          customerId: sampleCustomers[1].id,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.ticketNumber).toBe(2);
    });

    it('TC-T1-F07-01: Lists assigned ticket roster with customer mapping (GET /chits/:id/tickets)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/chits/${freshSchemeId}/tickets`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].ticketNumber).toBe(1);
      expect(res.body.data[1].ticketNumber).toBe(2);
    });

    it('TC-T1-F09-01: Transitions scheme from DRAFT to REGISTERED (POST /chits/:id/register)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/chits/${freshSchemeId}/register`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REGISTERED');
    });

    it('TC-T1-F10-01: Cancels an unactivated draft scheme (POST /chits/:id/cancel)', async () => {
      // Create a fresh disposable draft to test cancellation
      const cancelCode = `KCCANCEL-${Date.now()}`;
      const draftRes = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: cancelCode,
          groupName: 'Scheme To Cancel',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      const cancelSchemeId = draftRes.body.data.id;

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${cancelSchemeId}/cancel`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
    });

    it('TC-T1-F08-01: Onboards ongoing mid-cycle chit from physical notebook with historical auctions (POST /chits/onboard-ongoing)', async () => {
      const ongoingCode = `KCONGOING-T1-${Date.now()}`;
      const memberAllocations = sampleCustomers.slice(0, 20).map((c, idx) => ({
        ticketNumber: idx + 1,
        customerId: c.id,
        openingBalance: idx === 10 ? 5000 : 0, // Ticket #11 has ₹5,000 arrears
      }));

      // Historical winners for Months 2 through 6
      const historicalWinners = [
        {
          month: 2,
          ticketNumber: 2,
          bidDiscount: 24000,
          auctionDate: new Date(Date.now() - 5 * 30 * 86400000).toISOString(),
        },
        {
          month: 3,
          ticketNumber: 3,
          bidDiscount: 22000,
          auctionDate: new Date(Date.now() - 4 * 30 * 86400000).toISOString(),
        },
        {
          month: 4,
          ticketNumber: 4,
          bidDiscount: 20000,
          auctionDate: new Date(Date.now() - 3 * 30 * 86400000).toISOString(),
        },
        {
          month: 5,
          ticketNumber: 5,
          bidDiscount: 18000,
          auctionDate: new Date(Date.now() - 2 * 30 * 86400000).toISOString(),
        },
        {
          month: 6,
          ticketNumber: 6,
          bidDiscount: 16000,
          auctionDate: new Date(Date.now() - 1 * 30 * 86400000).toISOString(),
        },
      ];

      const res = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${accountantToken}`)
        .send({
          groupCode: ongoingCode,
          groupName: '₹1 Lakh Ongoing Group Intake at Month 7',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 7,
          startDate: new Date(Date.now() - 6 * 30 * 86400000).toISOString(),
          endDate: new Date(Date.now() + 14 * 30 * 86400000).toISOString(),
          memberAllocations,
          historicalWinners,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.initMode).toBe('ONGOING_GROUP');
      expect(res.body.data.onboardedAtMonth).toBe(7);
      expect(res.body.data.status).toBe('DRAFT');

      const ongoingId = res.body.data.id;

      // Verify Month 1 Company Pool auction was auto-created in DB
      const m1Auction = await prisma.auction.findFirst({
        where: { chitGroupId: ongoingId, installmentMonth: 1 },
      });
      expect(m1Auction).toBeDefined();
      expect(m1Auction?.bidDiscount).toBe(0n);
      expect(m1Auction?.prizeMoney).toBe(100000n);
      expect(m1Auction?.isHistoricalEntry).toBe(true);

      // Verify all 5 historical auctions exist with isHistoricalEntry = true
      const historicalAuctions = await prisma.auction.findMany({
        where: { chitGroupId: ongoingId, installmentMonth: { in: [2, 3, 4, 5, 6] } },
      });
      expect(historicalAuctions.length).toBe(5);
      for (const ha of historicalAuctions) {
        expect(ha.isHistoricalEntry).toBe(true);
        expect(ha.status).toBe('COMPLETED');
      }

      // Verify past prized tickets (Tickets 1, 2, 3, 4, 5, 6) are flagged isPrized: true
      const prizedTickets = await prisma.subscriberTicket.findMany({
        where: { chitGroupId: ongoingId, ticketNumber: { in: [1, 2, 3, 4, 5, 6] } },
      });
      expect(prizedTickets.length).toBe(6);
      for (const pt of prizedTickets) {
        expect(pt.isPrized).toBe(true);
        expect(pt.prizedAuctionId).toBeDefined();
      }
    });

    it('TC-T1-F11-01: Activates full 20-ticket scheme and verifies Month 1 Company Pool (POST /chits/:id/activate)', async () => {
      // Complete assignment of tickets 3..20 on freshSchemeId
      for (let i = 3; i <= 20; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/chits/${freshSchemeId}/tickets/assign`)
          .set('Authorization', `Bearer ${managingPartnerToken}`)
          .send({ ticketNumber: i, customerId: sampleCustomers[i - 1].id });
      }

      // Checker Partner activates the scheme (Maker != Checker)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/chits/${freshSchemeId}/activate`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.foremanCommissionRate).toBe(4);

      // Verify Month 1 Company Pool auction in database
      const m1Auction = await prisma.auction.findFirst({
        where: { chitGroupId: freshSchemeId, installmentMonth: 1 },
      });
      expect(m1Auction).toBeDefined();
      expect(m1Auction?.bidDiscount).toBe(0n);
      expect(m1Auction?.totalDividend).toBe(0n);
      expect(m1Auction?.prizeMoney).toBe(100000n);

      // Verify Ticket #1 prized
      const ticket1 = await prisma.subscriberTicket.findFirst({
        where: { chitGroupId: freshSchemeId, ticketNumber: 1 },
      });
      expect(ticket1?.isPrized).toBe(true);
      expect(ticket1?.prizedAuctionId).toBe(m1Auction?.id);

      // Verify AuditLog record contains durationMonths (DEF-CHIT-01 verification)
      const auditEntry = await prisma.auditLog.findFirst({
        where: { entityType: 'ChitGroup', entityId: freshSchemeId, action: 'CHIT_GROUP_ACTIVATED' },
      });
      expect(auditEntry).toBeDefined();
      expect((auditEntry?.newValue as any)?.durationMonths).toBe(20);
    });

    it('TC-T1-F05-01: Month N Direct Settlement Invariant (Unpaid Case) - Deducts 4% commission and base installment ($V - C_f - I_{base}$), marks Month N due PAID, transitions ACTIVE -> COMPLETED', async () => {
      const monthNGroupCode = `KCMONTHN-UNPAID-${Date.now()}`;

      // 20 member allocations
      const memberAllocations = sampleCustomers.slice(0, 20).map((c, idx) => ({
        ticketNumber: idx + 1,
        customerId: c.id,
        openingBalance: 0,
      }));

      // 18 historical auctions for months 2..19 (Ticket 2..19 won)
      // Chit value: 100,000, 4% commission: 4,000, ceiling: 25,000.
      // Bid discount 24,000 (divisible: (24000 - 4000) % 20 === 0)
      const historicalWinners = [];
      for (let m = 2; m <= 19; m++) {
        historicalWinners.push({
          month: m,
          ticketNumber: m,
          bidDiscount: 24000,
          auctionDate: new Date(Date.now() - (20 - m) * 30 * 86400000).toISOString(),
        });
      }

      // Step 1: Onboard ongoing group at Month 20
      const intakeRes = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: monthNGroupCode,
          groupName: '₹1 Lakh 20-Month Intake at Month 20 for Final Settlement',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 20,
          startDate: new Date(Date.now() - 19 * 30 * 86400000).toISOString(),
          endDate: new Date(Date.now() + 1 * 30 * 86400000).toISOString(),
          memberAllocations,
          historicalWinners,
        });

      expect(intakeRes.status).toBe(201);
      const schemeId = intakeRes.body.data.id;
      expect(intakeRes.body.data.onboardedAtMonth).toBe(20);

      // Step 2: Checker Partner activates the scheme (Maker != Checker)
      const actRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${schemeId}/activate`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`);

      expect(actRes.status).toBe(200);
      expect(actRes.body.data.status).toBe('ACTIVE');

      // Verify tickets 1..19 are prized, ticket 20 is the single unprized ticket
      const unprizedTickets = await prisma.subscriberTicket.findMany({
        where: { chitGroupId: schemeId, isPrized: false },
      });
      expect(unprizedTickets.length).toBe(1);
      expect(unprizedTickets[0].ticketNumber).toBe(20);
      const ticket20 = unprizedTickets[0];

      // Step 3: Stage 1 - Maker (Branch Manager) prepares Month N final settlement voucher
      const unpaidSettlementRef = `SBI-CHQ-MONTH20-${Date.now()}`;
      const prepareRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/group/${schemeId}/prepare-final-settlement`)
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          ticketId: ticket20.id,
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          paymentReference: unpaidSettlementRef,
          notes: 'Month 20 maturity settlement prepared at counter',
        });

      expect(prepareRes.status).toBe(200);
      expect(prepareRes.body.success).toBe(true);
      expect(prepareRes.body.data.settlement.grossPrize).toBe(100000);
      expect(prepareRes.body.data.settlement.commissionAmount).toBe(4000); // 4% locked
      expect(prepareRes.body.data.settlement.finalMonthInstallment).toBe(5000); // unpaid installment deducted
      expect(prepareRes.body.data.settlement.priorArrears).toBe(0);
      expect(prepareRes.body.data.settlement.netPayablePrize).toBe(91000); // 100,000 - 4,000 - 5,000 = 91,000

      // Step 4: Maker != Checker Guard - Maker (Branch Manager) cannot approve payout
      const selfApproveRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/group/${schemeId}/approve-final-settlement`)
        .set('Authorization', `Bearer ${branchManagerToken}`);
      expect(selfApproveRes.status).toBe(403);

      // Step 5: Partner Exclusivity Guard - Administrative IT Super Admin (roles: [Role.SUPER_ADMIN]) is barred
      const nonPartnerRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/group/${schemeId}/approve-final-settlement`)
        .set('Authorization', `Bearer ${itAdminToken}`);
      expect(nonPartnerRes.status).toBe(403);
      expect(nonPartnerRes.body.error.message).toContain('PARTNER_IDENTITY_REQUIRED');

      // Step 6: Stage 2 - Independent Checker Partner approves final settlement
      const approveRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/group/${schemeId}/approve-final-settlement`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.success).toBe(true);
      expect(approveRes.body.data.settlement.netPrizeMoney).toBe(91000);
      expect(approveRes.body.data.settlement.disbursementMode).toBe('ACCOUNT_PAYEE_CHEQUE');
      expect(approveRes.body.data.settlement.paymentReference).toBe(unpaidSettlementRef);

      // Step 7: Verify database state transitions
      // Scheme status transitioned to COMPLETED
      const chitInDb = await prisma.chitGroup.findUnique({ where: { id: schemeId } });
      expect(chitInDb?.status).toBe(ChitStatus.COMPLETED);

      // Ticket #20 marked prized
      const t20InDb = await prisma.subscriberTicket.findUnique({ where: { id: ticket20.id } });
      expect(t20InDb?.isPrized).toBe(true);

      // Month 20 installment due marked PAID
      const due20InDb = await prisma.installmentDue.findFirst({
        where: { ticketId: ticket20.id, installmentMonth: 20 },
      });
      expect(due20InDb?.status).toBe(DueStatus.PAID);
      expect(due20InDb?.paidAmount).toBe(5000n);

      // Settlement auction in DB
      const m20Auction = await prisma.auction.findFirst({
        where: { chitGroupId: schemeId, installmentMonth: 20 },
      });
      expect(m20Auction?.status).toBe('COMPLETED');
      expect(m20Auction?.prizeMoney).toBe(96000n); // V - 4%
      expect(m20Auction?.foremanCommissionAmount).toBe(4000n);

      // Save schemeId for natural closure test in TC-T1-F12-01
      naturallyCompletedSchemeId = schemeId;
    });

    it('TC-T1-F05-02: Month N Direct Settlement Invariant (Pre-Paid Case / FIN-B) - Zero double collection ($V - C_f - 0$) when final month is pre-paid', async () => {
      const prepaidGroupCode = `KCMONTHN-PREPAID-${Date.now()}`;

      const memberAllocations = sampleCustomers.slice(0, 20).map((c, idx) => ({
        ticketNumber: idx + 1,
        customerId: c.id,
        openingBalance: 0,
      }));

      const historicalWinners = [];
      for (let m = 2; m <= 19; m++) {
        historicalWinners.push({
          month: m,
          ticketNumber: m,
          bidDiscount: 24000,
          auctionDate: new Date(Date.now() - (20 - m) * 30 * 86400000).toISOString(),
        });
      }

      // Onboard and activate scheme at Month 20
      const intakeRes = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: prepaidGroupCode,
          groupName: '₹1 Lakh Prepaid Month 20 Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 20,
          startDate: new Date(Date.now() - 19 * 30 * 86400000).toISOString(),
          endDate: new Date(Date.now() + 1 * 30 * 86400000).toISOString(),
          memberAllocations,
          historicalWinners,
        });
      const schemeId = intakeRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/chits/${schemeId}/activate`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`);

      const ticket20 = await prisma.subscriberTicket.findFirst({
        where: { chitGroupId: schemeId, ticketNumber: 20 },
      });
      expect(ticket20).toBeDefined();

      // FIN-B Pre-condition: Subscriber has already paid their Month 20 installment before maturity settlement
      await prisma.installmentDue.create({
        data: {
          chitGroupId: schemeId,
          ticketId: ticket20!.id,
          installmentMonth: 20,
          grossAmount: 5000n,
          dividendDeduction: 0n,
          netPayableAmount: 5000n,
          paidAmount: 5000n,
          status: DueStatus.PAID,
          cycleStartDate: new Date(),
          cycleEndDate: new Date(),
          dueDate: new Date(),
        },
      });

      // Maker prepares settlement
      const prepaidSettlementRef = `NEFT-AXIS-2026-FINAL-${Date.now()}`;
      const prepareRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/group/${schemeId}/prepare-final-settlement`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          ticketId: ticket20!.id,
          disbursementMode: DisbursementMode.BANK_TRANSFER_NEFT,
          paymentReference: prepaidSettlementRef,
        });

      expect(prepareRes.status).toBe(200);
      expect(prepareRes.body.data.settlement.grossPrize).toBe(100000);
      expect(prepareRes.body.data.settlement.commissionAmount).toBe(4000);
      // Zero double collection: finalMonthDeduction must be 0!
      expect(prepareRes.body.data.settlement.finalMonthDeduction).toBe(0);
      // Net payout = 100,000 - 4,000 - 0 = 96,000
      expect(prepareRes.body.data.settlement.netPayablePrize).toBe(96000);

      // Checker Partner approves settlement
      const approveRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/group/${schemeId}/approve-final-settlement`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.settlement.isFinalMonthAlreadyPaid).toBe(true);
      expect(approveRes.body.data.settlement.finalMonthInstallment).toBe(0);
      expect(approveRes.body.data.settlement.netPrizeMoney).toBe(96000);

      // Scheme status transitions to COMPLETED
      const chitInDb = await prisma.chitGroup.findUnique({ where: { id: schemeId } });
      expect(chitInDb?.status).toBe(ChitStatus.COMPLETED);
    });

    it('TC-T1-F05-03: Month N Direct Settlement Dual Control - Enforces Maker != Checker and Partner Identity', async () => {
      const dualControlCode = `KCMONTHN-DUAL-${Date.now()}`;

      const memberAllocations = sampleCustomers.slice(0, 20).map((c, idx) => ({
        ticketNumber: idx + 1,
        customerId: c.id,
        openingBalance: 0,
      }));

      const historicalWinners = [];
      for (let m = 2; m <= 19; m++) {
        historicalWinners.push({
          month: m,
          ticketNumber: m,
          bidDiscount: 24000,
          auctionDate: new Date(Date.now() - (20 - m) * 30 * 86400000).toISOString(),
        });
      }

      const intakeRes = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          groupCode: dualControlCode,
          groupName: '₹1 Lakh Month 20 Dual Control Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 20,
          startDate: new Date(Date.now() - 19 * 30 * 86400000).toISOString(),
          endDate: new Date(Date.now() + 1 * 30 * 86400000).toISOString(),
          memberAllocations,
          historicalWinners,
        });
      const schemeId = intakeRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/chits/${schemeId}/activate`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      const ticket20 = await prisma.subscriberTicket.findFirst({
        where: { chitGroupId: schemeId, ticketNumber: 20 },
      });

      // CR-DISB-02: Unilateral direct POST /final-settlement BEFORE Stage-1 prepare-final-settlement MUST be rejected even with valid makerUserId
      const branchMgr = await prisma.user.findUnique({ where: { phone: '9876543212' }, select: { id: true } });
      const unilateralRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/group/${schemeId}/final-settlement`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`)
        .send({
          ticketId: ticket20!.id,
          disbursementMode: DisbursementMode.CASH,
          paymentReference: 'CASH-UNILATERAL-BYPASS',
          makerUserId: branchMgr!.id,
        });
      expect(unilateralRes.status).toBe(400);
      expect(unilateralRes.body.error.message).toContain('PREPARED_SETTLEMENT_REQUIRED');

      // Managing Partner prepares settlement (Maker)
      const prepDualRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/group/${schemeId}/prepare-final-settlement`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          ticketId: ticket20!.id,
          disbursementMode: DisbursementMode.CASH,
          paymentReference: 'CASH-SETTLE-MONTH20',
        });
      expect(prepDualRes.status).toBe(200);

      // CR-DISB-01: Prepared Month N record CANNOT be hijacked via auction authorize-payout
      const preparedAuctionId = prepDualRes.body.data.settlement.auctionId;
      const hijackRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/auction/${preparedAuctionId}/authorize-payout`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`)
        .send({
          disbursementMode: DisbursementMode.CASH,
        });
      expect(hijackRes.status).toBe(400);
      expect(hijackRes.body.error.message).toContain('AUCTION_NOT_FINALIZED');

      // Self-approval by Managing Partner fails with 403 MAKER_CHECKER_VIOLATION
      const selfApproveRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/group/${schemeId}/approve-final-settlement`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);
      expect(selfApproveRes.status).toBe(403);
      expect(selfApproveRes.body.error.message).toContain('MAKER_CHECKER_VIOLATION');

      // Distinct Checker Partner approves successfully
      const distinctApproveRes = await request(app.getHttpServer())
        .post(`/api/v1/disbursements/group/${schemeId}/approve-final-settlement`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`);
      expect(distinctApproveRes.status).toBe(200);
      expect(distinctApproveRes.body.success).toBe(true);
    });

    it('TC-T1-F12-01: Scheme closure transitions COMPLETED -> CLOSED (POST /chits/:id/close)', async () => {
      // 1. Invariant Guard: Scheme in ACTIVE status cannot be closed
      const activeCloseRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${freshSchemeId}/close`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(activeCloseRes.status).toBe(400);
      expect(activeCloseRes.body.error.message).toContain('Only COMPLETED schemes can be closed');

      // 2. Naturally completed scheme from TC-T1-F05-01 transitions COMPLETED -> CLOSED
      expect(naturallyCompletedSchemeId).toBeDefined();

      const closeRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${naturallyCompletedSchemeId}/close`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(closeRes.status).toBe(200);
      expect(closeRes.body.success).toBe(true);
      expect(closeRes.body.data.status).toBe('CLOSED');

      // Verify audit log record
      const closeAudit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'ChitGroup',
          entityId: naturallyCompletedSchemeId,
          action: 'CHIT_GROUP_CLOSED',
        },
      });
      expect(closeAudit).toBeDefined();
    });
  });

  // ===========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (INVARIANT GUARDS)
  // ===========================================================================
  describe('Tier 2: Boundary & Financial Invariant Guards', () => {
    it('TC-T2-B01-01: Divisibility Gate - Rejects indivisible chit value V % N != 0 (e.g. ₹100,003 / 20)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: `KCBAD-DIV-${Date.now()}`,
          groupName: 'Indivisible Value Scheme',
          chitValue: 100003, // 100003 % 20 !== 0
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('evenly divisible');
    });

    it('TC-T2-B01-02: Divisibility Gate - Rejects fractional paise in chit value (e.g. ₹100000.50)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: `KCBAD-PAISE-${Date.now()}`,
          groupName: 'Paise Decimal Scheme',
          chitValue: 100000.5,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });

      expect(res.status).toBe(400);
    });

    it('TC-T2-B01-03: Divisibility Gate - Rejects zero or negative chit value', async () => {
      const resZero = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: `KCZERO-${Date.now()}`,
          groupName: 'Zero Value Scheme',
          chitValue: 0,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      expect(resZero.status).toBe(400);

      const resNeg = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: `KCNEG-${Date.now()}`,
          groupName: 'Negative Value Scheme',
          chitValue: -50000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      expect(resNeg.status).toBe(400);
    });

    it('TC-T2-B01-04: Divisibility Gate - Successfully handles large BigInt scheme (e.g. ₹10 Lakhs, 25 months)', async () => {
      const largeCode = `KCLARGE-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: largeCode,
          groupName: '₹10 Lakh 25-Month Large Scheme',
          chitValue: 1000000,
          durationMonths: 25,
          totalTickets: 25,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2029-01-01T00:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.chitValue).toBe(1000000);
      expect(res.body.data.baseInstallment).toBe(40000); // 1,000,000 / 25
      expect(res.body.data.maxDiscountCeiling).toBe(250000); // 1,000,000 / 4
    });

    it('TC-T2-B02-01: Rejects scheme when durationMonths != totalTickets', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: `KCMISMATCH-${Date.now()}`,
          groupName: 'Mismatch Duration Scheme',
          chitValue: 100000,
          durationMonths: 25,
          totalTickets: 20, // 25 != 20
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Duration');
    });

    it('TC-T2-B03-01: ADR-06 1/4 Ceiling Gate - Rejects historical bid discount exceeding 25% of chit value', async () => {
      const badCode = `KCEXCEED-${Date.now()}`;
      const memberAllocations = sampleCustomers.slice(0, 20).map((c, idx) => ({
        ticketNumber: idx + 1,
        customerId: c.id,
      }));

      const res = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: badCode,
          groupName: 'Ceiling Exceeded Scheme',
          chitValue: 100000, // 1/4 ceiling is 25,000
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 3,
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2028-01-01T00:00:00.000Z',
          memberAllocations,
          historicalWinners: [
            {
              month: 2,
              ticketNumber: 2,
              bidDiscount: 28000, // EXCEEDS 25,000 ceiling!
              auctionDate: '2026-07-01T00:00:00.000Z',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('exceeds maximum 1/4 ceiling');
    });

    it('TC-T2-B03-02: 4% Floor Gate - Rejects historical bid discount below 4% foreman commission', async () => {
      const floorCode = `KCFLOOR-${Date.now()}`;
      const memberAllocations = sampleCustomers.slice(0, 20).map((c, idx) => ({
        ticketNumber: idx + 1,
        customerId: c.id,
      }));

      const res = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: floorCode,
          groupName: 'Sub-Floor Scheme',
          chitValue: 100000, // 4% commission is 4,000
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 3,
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2028-01-01T00:00:00.000Z',
          memberAllocations,
          historicalWinners: [
            {
              month: 2,
              ticketNumber: 2,
              bidDiscount: 3500, // BELOW 4,000 floor!
              auctionDate: '2026-07-01T00:00:00.000Z',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('at least the foreman commission');
    });

    it('TC-T2-B03-03: Whole-Rupee Dividend Divisibility Gate - Rejects (D - Cf) % N != 0', async () => {
      const divCode = `KCDIVBID-${Date.now()}`;
      const memberAllocations = sampleCustomers.slice(0, 20).map((c, idx) => ({
        ticketNumber: idx + 1,
        customerId: c.id,
      }));

      // V = 100,000, Cf = 4,000. If bidDiscount = 20,005 -> totalDividend = 16,005 -> 16,005 % 20 = 5 != 0
      const res = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: divCode,
          groupName: 'Indivisible Dividend Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 3,
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2028-01-01T00:00:00.000Z',
          memberAllocations,
          historicalWinners: [
            {
              month: 2,
              ticketNumber: 2,
              bidDiscount: 20005,
              auctionDate: '2026-07-01T00:00:00.000Z',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('NON_DIVISIBLE_DIVIDEND');
    });

    it('TC-T2-B04-01: ADR-13 Ticket Limit - Rejects allocating 2nd ticket to customer in same group', async () => {
      const groupCode = `KCADR13-${Date.now()}`;
      const groupRes = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode,
          groupName: 'ADR-13 Test Group',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      const gId = groupRes.body.data.id;

      // Assign Ticket #1 to customer 0
      const firstRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${gId}/tickets/assign`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ ticketNumber: 1, customerId: sampleCustomers[0].id });
      expect(firstRes.status).toBe(201);

      // Attempt to assign Ticket #2 to customer 0 in same group -> 409 Conflict
      const secondRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${gId}/tickets/assign`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ ticketNumber: 2, customerId: sampleCustomers[0].id });

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.error.message).toContain('ADR-13 Violation');
    });

    it('TC-T2-B04-02: ADR-13 Cross-Group Allocation - Customer can hold tickets across different groups', async () => {
      const groupCode2 = `KCCROSS-${Date.now()}`;
      const groupRes2 = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: groupCode2,
          groupName: 'ADR-13 Cross Group',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      const gId2 = groupRes2.body.data.id;

      // Assign Ticket #1 to customer 0 in group 2 -> succeeds
      const res = await request(app.getHttpServer())
        .post(`/api/v1/chits/${gId2}/tickets/assign`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ ticketNumber: 1, customerId: sampleCustomers[0].id });

      expect(res.status).toBe(201);
      expect(res.body.data.ticketNumber).toBe(1);
    });

    it('TC-T2-B05-01: Capacity Gate - Rejects scheme activation if fewer than N tickets are assigned', async () => {
      const incompleteCode = `KCINCOMPL-${Date.now()}`;
      const groupRes = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: incompleteCode,
          groupName: 'Incomplete Group',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      const gId = groupRes.body.data.id;

      // Assign only 1 ticket out of 20
      await request(app.getHttpServer())
        .post(`/api/v1/chits/${gId}/tickets/assign`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ ticketNumber: 1, customerId: sampleCustomers[0].id });

      const actRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${gId}/activate`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`);

      expect(actRes.status).toBe(400);
      expect(actRes.body.error.message).toContain('All tickets must be filled before activation');
    });

    it('TC-T2-B05-02: Roster Bounds - Rejects ticketNumber < 1 and ticketNumber > N', async () => {
      const boundsCode = `KCBOUNDS-${Date.now()}`;
      const groupRes = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: boundsCode,
          groupName: 'Ticket Bounds Group',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      const gId = groupRes.body.data.id;

      // Sub-1 ticket
      const resLow = await request(app.getHttpServer())
        .post(`/api/v1/chits/${gId}/tickets/assign`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ ticketNumber: 0, customerId: sampleCustomers[0].id });
      expect(resLow.status).toBe(400);

      // Super-N ticket (21 for N=20)
      const resHigh = await request(app.getHttpServer())
        .post(`/api/v1/chits/${gId}/tickets/assign`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ ticketNumber: 21, customerId: sampleCustomers[0].id });
      expect(resHigh.status).toBe(400);
    });

    it('TC-T2-B06-01: Historical Intake - Rejects onboardedAtMonth < 2 and > durationMonths', async () => {
      const memberAllocations = sampleCustomers.slice(0, 20).map((c, idx) => ({
        ticketNumber: idx + 1,
        customerId: c.id,
      }));

      // Month 1 intake rejected (Month 1 should use fresh chit flow)
      const resM1 = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: `KCM1-${Date.now()}`,
          groupName: 'Month 1 Ongoing Rejected',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 1,
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2028-01-01T00:00:00.000Z',
          memberAllocations,
          historicalWinners: [],
        });
      expect(resM1.status).toBe(400);

      // Month 21 intake rejected (greater than durationMonths 20)
      const resM21 = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: `KCM21-${Date.now()}`,
          groupName: 'Month 21 Ongoing Rejected',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 21,
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2028-01-01T00:00:00.000Z',
          memberAllocations,
          historicalWinners: [],
        });
      expect(resM21.status).toBe(400);
    });

    it('TC-T2-B06-02: Historical Intake - Rejects historical winner Ticket #1 for Month >= 2', async () => {
      const memberAllocations = sampleCustomers.slice(0, 20).map((c, idx) => ({
        ticketNumber: idx + 1,
        customerId: c.id,
      }));

      const res = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: `KCT1BAD-${Date.now()}`,
          groupName: 'Ticket 1 Historical Winner Rejected',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 3,
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2028-01-01T00:00:00.000Z',
          memberAllocations,
          historicalWinners: [
            {
              month: 2,
              ticketNumber: 1, // TICKET #1 CANNOT WIN AUCTION IN MONTH >= 2
              bidDiscount: 20000,
              auctionDate: '2026-07-01T00:00:00.000Z',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Ticket #1 is reserved');
    });

    it('TC-T2-B06-03: Historical Intake - Rejects duplicate winner tickets across historical months', async () => {
      const memberAllocations = sampleCustomers.slice(0, 20).map((c, idx) => ({
        ticketNumber: idx + 1,
        customerId: c.id,
      }));

      const res = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: `KCDUPWIN-${Date.now()}`,
          groupName: 'Duplicate Winner Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 4,
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2028-01-01T00:00:00.000Z',
          memberAllocations,
          historicalWinners: [
            {
              month: 2,
              ticketNumber: 3,
              bidDiscount: 20000,
              auctionDate: '2026-07-01T00:00:00.000Z',
            },
            {
              month: 3,
              ticketNumber: 3, // DUPLICATE WINNER TICKET #3
              bidDiscount: 18000,
              auctionDate: '2026-08-01T00:00:00.000Z',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Duplicate winner ticket');
    });
  });

  // ===========================================================================
  // TIER 3: RBAC & CROSS-FEATURE COMBINATIONS
  // ===========================================================================
  describe('Tier 3: RBAC & Maker-Checker Separation of Duties', () => {
    let makerCreatedSchemeId: string;

    it('TC-T3-01: Scheme Creator (Partner A) cannot self-activate own scheme (HTTP 403 MAKER_CHECKER_VIOLATION)', async () => {
      const code = `KCMC-${Date.now()}`;
      // Partner A creates scheme
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: code,
          groupName: 'Maker-Checker Self Activation Test',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      makerCreatedSchemeId = createRes.body.data.id;

      // Assign all 20 tickets
      for (let i = 1; i <= 20; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/chits/${makerCreatedSchemeId}/tickets/assign`)
          .set('Authorization', `Bearer ${managingPartnerToken}`)
          .send({ ticketNumber: i, customerId: sampleCustomers[i - 1].id });
      }

      // Partner A attempts self-activation -> MUST BE REJECTED
      const selfActRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${makerCreatedSchemeId}/activate`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(selfActRes.status).toBe(403);
      expect(selfActRes.body.error.message).toContain('MAKER_CHECKER_VIOLATION');
    });

    it('TC-T3-02: Distinct Checker Partner (Partner B) successfully activates scheme created by Partner A', async () => {
      // Partner B (checker) activates the scheme created by Partner A
      const actRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${makerCreatedSchemeId}/activate`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`);

      expect(actRes.status).toBe(200);
      expect(actRes.body.success).toBe(true);
      expect(actRes.body.data.status).toBe('ACTIVE');
    });

    it('TC-T3-03: Administrative Super Admin (roles: [Role.SUPER_ADMIN]) is barred from activating schemes (HTTP 403 PARTNER_IDENTITY_REQUIRED)', async () => {
      // Create a full 20-ticket scheme
      const code = `KCNONPART-${Date.now()}`;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: code,
          groupName: 'Non-Partner Super Admin Test Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      const sId = createRes.body.data.id;

      for (let i = 1; i <= 20; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/chits/${sId}/tickets/assign`)
          .set('Authorization', `Bearer ${managingPartnerToken}`)
          .send({ ticketNumber: i, customerId: sampleCustomers[i - 1].id });
      }

      // IT Support Super Admin attempts to activate
      const actRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${sId}/activate`)
        .set('Authorization', `Bearer ${itAdminToken}`);

      expect(actRes.status).toBe(403);
      expect(actRes.body.error.message).toContain('PARTNER_IDENTITY_REQUIRED');
    });

    it('TC-T3-04: Non-SuperAdmin roles (Branch Manager & Accountant) are barred from creating fresh chits', async () => {
      const resBm = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          groupCode: `KCNOPERM-${Date.now()}`,
          groupName: 'Forbidden Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      expect(resBm.status).toBe(403);

      const resAcc = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${accountantToken}`)
        .send({
          groupCode: `KCNOPERM2-${Date.now()}`,
          groupName: 'Forbidden Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      expect(resAcc.status).toBe(403);
    });

    it('TC-T3-05: Non-SuperAdmin roles are barred from activating chit schemes', async () => {
      const resBm = await request(app.getHttpServer())
        .post(`/api/v1/chits/${makerCreatedSchemeId}/activate`)
        .set('Authorization', `Bearer ${branchManagerToken}`);
      expect(resBm.status).toBe(403);

      const resAcc = await request(app.getHttpServer())
        .post(`/api/v1/chits/${makerCreatedSchemeId}/activate`)
        .set('Authorization', `Bearer ${accountantToken}`);
      expect(resAcc.status).toBe(403);
    });

    it('TC-T3-06: Auditor has read-only access and cannot mutate schemes (GET vs POST)', async () => {
      // Auditor can list schemes
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/chits')
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(listRes.status).toBe(200);

      // Auditor cannot create fresh scheme
      const writeRes = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          groupCode: `KCAUDITOR-${Date.now()}`,
          groupName: 'Auditor Forbidden Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      expect(writeRes.status).toBe(403);
    });

    it('TC-T3-07: Customer view masks fellow subscribers PII under DPDP Act', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/chits/${makerCreatedSchemeId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const tickets = res.body.data.tickets;
      expect(tickets.length).toBeGreaterThan(0);

      // Ticket #1 belongs to sampleCustomers[0] (the customer) -> should be unmasked
      const ownTicket = tickets.find((t: any) => t.ticketNumber === 1);
      expect(ownTicket.customer.id).toBe(primaryCustomerId);

      // Other tickets belong to other subscribers -> should be masked
      const otherTickets = tickets.filter((t: any) => t.ticketNumber !== 1);
      for (const ot of otherTickets) {
        expect(ot.customer.customerCode).toBe('KC-CUST-RESERVED');
        expect(ot.customer.phone).toBe('+91 ******0000');
        expect(ot.customer.fullName).toContain('Subscriber (Ticket #');
      }
    });

    it('TC-T3-08: Customer accessing tickets of non-enrolled scheme is rejected with HTTP 403', async () => {
      // Create a scheme where customer is not enrolled
      const unenrolledCode = `KCUNENROLLED-${Date.now()}`;
      const groupRes = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: unenrolledCode,
          groupName: 'Unenrolled Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      const uId = groupRes.body.data.id;

      // Assign ticket #1 to customer[5] (not primaryCustomer)
      await request(app.getHttpServer())
        .post(`/api/v1/chits/${uId}/tickets/assign`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ ticketNumber: 1, customerId: sampleCustomers[5].id });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/chits/${uId}/tickets`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('You do not belong to this chit scheme');
    });

    it('TC-T3-09: State Immutability - Rejects parameter mutation and ticket unassignment on ACTIVE scheme', async () => {
      // Attempting to update groupName on ACTIVE scheme
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/chits/${makerCreatedSchemeId}`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ groupName: 'Attempt to Mutate Active Scheme' });
      expect(patchRes.status).toBe(400);
      expect(patchRes.body.error.message).toContain('Only schemes in DRAFT status can be modified');

      // Attempting to unassign ticket on ACTIVE scheme
      const unassignRes = await request(app.getHttpServer())
        .delete(`/api/v1/chits/${makerCreatedSchemeId}/tickets/1`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);
      expect(unassignRes.status).toBe(400);
      expect(unassignRes.body.error.message).toContain('Tickets can only be unassigned while scheme is in DRAFT status');
    });

    it('TC-T3-10: Opening Balance Passbook Integration - Passbook ledger incorporates opening arrears', async () => {
      // Onboard ongoing scheme with a specific opening balance on ticket #2
      const passbookCode = `KCPASSBOOK-${Date.now()}`;
      const memberAllocations = sampleCustomers.slice(0, 20).map((c, idx) => ({
        ticketNumber: idx + 1,
        customerId: c.id,
        openingBalance: idx === 1 ? 7500 : 0, // Ticket #2 has ₹7,500 notebook arrears
      }));

      const intakeRes = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          groupCode: passbookCode,
          groupName: 'Passbook Integration Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 3,
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2028-01-01T00:00:00.000Z',
          memberAllocations,
          historicalWinners: [
            {
              month: 2,
              ticketNumber: 5,
              bidDiscount: 20000,
              auctionDate: '2026-07-01T00:00:00.000Z',
            },
          ],
        });
      const chitId = intakeRes.body.data.id;

      // Find Ticket #2's ID from DB
      const ticket2 = await prisma.subscriberTicket.findFirst({
        where: { chitGroupId: chitId, ticketNumber: 2 },
      });
      expect(ticket2).toBeDefined();

      // Query passbook for Ticket #2
      const passbookRes = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticket2!.id}/passbook`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(passbookRes.status).toBe(200);
      expect(passbookRes.body.success).toBe(true);
      expect(passbookRes.body.data.ticket.openingBalance).toBe(7500);
      // Outstanding balance includes opening arrears (0 net dues + 7500 opening - 0 paid = 7500)
      expect(passbookRes.body.data.summary.outstandingBalance).toBeGreaterThanOrEqual(7500);
    });
  });

  // ===========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // ===========================================================================
  describe('Tier 4: Real-World End-to-End Application Scenarios', () => {
    it('TC-T4-01: Standard ₹1 Lakh 20-Month Fresh Scheme Full Chronological Lifecycle', async () => {
      const fullLifecycleCode = `KCLIFECYCLE-1L-${Date.now()}`;

      // Step 1: Managing Partner creates scheme in DRAFT status
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: fullLifecycleCode,
          groupName: '₹1 Lakh 20-Month Full Lifecycle Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
          sanctionOrderNumber: 'ROC/ERD/2026/LIFECYCLE-01',
          sanctionDate: '2026-11-01T00:00:00.000Z',
        });
      expect(createRes.status).toBe(201);
      const schemeId = createRes.body.data.id;
      expect(createRes.body.data.baseInstallment).toBe(5000);
      expect(createRes.body.data.maxDiscountCeiling).toBe(25000);

      // Step 2: Register scheme with Chit Registrar sanction order
      const regRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${schemeId}/register`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);
      expect(regRes.status).toBe(200);
      expect(regRes.body.data.status).toBe('REGISTERED');

      // Step 3: Branch Manager assigns all 20 tickets to unique subscribers under ADR-13
      for (let i = 1; i <= 20; i++) {
        const assignRes = await request(app.getHttpServer())
          .post(`/api/v1/chits/${schemeId}/tickets/assign`)
          .set('Authorization', `Bearer ${branchManagerToken}`)
          .send({ ticketNumber: i, customerId: sampleCustomers[i - 1].id });
        expect(assignRes.status).toBe(201);
      }

      // Step 4: Verify complete roster of 20 tickets
      const rosterRes = await request(app.getHttpServer())
        .get(`/api/v1/chits/${schemeId}/tickets`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);
      expect(rosterRes.status).toBe(200);
      expect(rosterRes.body.data.length).toBe(20);

      // Step 5: Self-activation attempt by Managing Partner is blocked
      const selfActRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${schemeId}/activate`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);
      expect(selfActRes.status).toBe(403);

      // Step 6: Checker Partner reviews and activates scheme
      const actRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${schemeId}/activate`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`);
      expect(actRes.status).toBe(200);
      expect(actRes.body.data.status).toBe('ACTIVE');

      // Step 7: Verify Month 1 Company Pool auction in database
      const m1Auction = await prisma.auction.findFirst({
        where: { chitGroupId: schemeId, installmentMonth: 1 },
      });
      expect(m1Auction).toBeDefined();
      expect(m1Auction?.bidDiscount).toBe(0n);
      expect(m1Auction?.foremanCommissionAmount).toBe(0n);
      expect(m1Auction?.prizeMoney).toBe(100000n);

      const ticket1 = await prisma.subscriberTicket.findFirst({
        where: { chitGroupId: schemeId, ticketNumber: 1 },
      });
      expect(ticket1?.isPrized).toBe(true);

      // Step 8: Post-activation immutability check
      const updateAttempt = await request(app.getHttpServer())
        .patch(`/api/v1/chits/${schemeId}`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ groupName: 'Post Activation Mutation Block' });
      expect(updateAttempt.status).toBe(400);
    });

    it('TC-T4-02: Mid-Cycle Intake at Month 7 from Physical Hand-Written Notebook (₹2,00,000 20-Month)', async () => {
      const midCycleCode = `KCMIDCYCLE-2L-${Date.now()}`;

      // 20 member allocations with specific opening balance on ticket #8
      const memberAllocations = sampleCustomers.slice(0, 20).map((c, idx) => ({
        ticketNumber: idx + 1,
        customerId: c.id,
        openingBalance: idx === 7 ? 6000 : 0, // Ticket #8 has ₹6,000 notebook arrears
      }));

      // 5 historical auctions for months 2, 3, 4, 5, 6
      const historicalWinners = [
        {
          month: 2,
          ticketNumber: 2,
          bidDiscount: 50000, // 25% ceiling for ₹2L
          auctionDate: new Date(Date.now() - 5 * 30 * 86400000).toISOString(),
        },
        {
          month: 3,
          ticketNumber: 3,
          bidDiscount: 44000,
          auctionDate: new Date(Date.now() - 4 * 30 * 86400000).toISOString(),
        },
        {
          month: 4,
          ticketNumber: 4,
          bidDiscount: 40000,
          auctionDate: new Date(Date.now() - 3 * 30 * 86400000).toISOString(),
        },
        {
          month: 5,
          ticketNumber: 5,
          bidDiscount: 36000,
          auctionDate: new Date(Date.now() - 2 * 30 * 86400000).toISOString(),
        },
        {
          month: 6,
          ticketNumber: 6,
          bidDiscount: 30000,
          auctionDate: new Date(Date.now() - 1 * 30 * 86400000).toISOString(),
        },
      ];

      // Step 1: Desk Accountant onboards ongoing chit from physical notebook
      const intakeRes = await request(app.getHttpServer())
        .post('/api/v1/chits/onboard-ongoing')
        .set('Authorization', `Bearer ${accountantToken}`)
        .send({
          groupCode: midCycleCode,
          groupName: '₹2 Lakh 20-Month Ongoing Notebook Intake',
          chitValue: 200000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 7,
          startDate: new Date(Date.now() - 6 * 30 * 86400000).toISOString(),
          endDate: new Date(Date.now() + 14 * 30 * 86400000).toISOString(),
          memberAllocations,
          historicalWinners,
        });

      expect(intakeRes.status).toBe(201);
      const schemeId = intakeRes.body.data.id;
      expect(intakeRes.body.data.baseInstallment).toBe(10000);
      expect(intakeRes.body.data.maxDiscountCeiling).toBe(50000);

      // Step 2: Checker Partner activates scheme
      const actRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${schemeId}/activate`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`);

      expect(actRes.status).toBe(200);
      expect(actRes.body.data.status).toBe('ACTIVE');

      // Step 3: Verify Month 1 Company Pool auction in database
      const m1Auction = await prisma.auction.findFirst({
        where: { chitGroupId: schemeId, installmentMonth: 1 },
      });
      expect(m1Auction).toBeDefined();
      expect(m1Auction?.bidDiscount).toBe(0n);
      expect(m1Auction?.prizeMoney).toBe(200000n);

      // Step 4: Verify Month 7 is ready for live digital auction
      const schemeDetails = await request(app.getHttpServer())
        .get(`/api/v1/chits/${schemeId}`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(schemeDetails.status).toBe(200);
      expect(schemeDetails.body.data.status).toBe('ACTIVE');
      expect(schemeDetails.body.data.onboardedAtMonth).toBe(7);

      // Step 5: Verify Passbook integration for ticket #8 showing notebook opening arrears
      const ticket8 = await prisma.subscriberTicket.findFirst({
        where: { chitGroupId: schemeId, ticketNumber: 8 },
      });
      const passbookRes = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticket8!.id}/passbook`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);

      expect(passbookRes.status).toBe(200);
      expect(passbookRes.body.data.ticket.openingBalance).toBe(6000);
      expect(passbookRes.body.data.summary.outstandingBalance).toBeGreaterThanOrEqual(6000);
    });

    it('TC-T4-03: Defaulter Arrears Progression, Maker-Checker Removal & Ticket Substitution (ADR-13)', async () => {
      const defaulterGroupCode = `KCT4-DEF-${Date.now()}`;

      // Step 1: Create and activate fresh 20-month scheme
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: defaulterGroupCode,
          groupName: '₹1 Lakh Defaulter & Substitution Test Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      expect(createRes.status).toBe(201);
      const schemeId = createRes.body.data.id;

      // Assign all 20 tickets
      for (let i = 1; i <= 20; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/chits/${schemeId}/tickets/assign`)
          .set('Authorization', `Bearer ${branchManagerToken}`)
          .send({ ticketNumber: i, customerId: sampleCustomers[i - 1].id });
      }

      // Checker Partner activates scheme
      const actRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${schemeId}/activate`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`);
      expect(actRes.status).toBe(200);

      // Identify Ticket #3 (customer: sampleCustomers[2]) and Ticket #2 (customer: sampleCustomers[1])
      const ticket3 = await prisma.subscriberTicket.findFirst({
        where: { chitGroupId: schemeId, ticketNumber: 3 },
      });
      const ticket2 = await prisma.subscriberTicket.findFirst({
        where: { chitGroupId: schemeId, ticketNumber: 2 },
      });
      const ticket1 = await prisma.subscriberTicket.findFirst({
        where: { chitGroupId: schemeId, ticketNumber: 1 },
      });
      expect(ticket3).toBeDefined();
      expect(ticket2).toBeDefined();
      expect(ticket1).toBeDefined();

      // Step 2: Arrears Progression - Ticket #3 defaults for 3 consecutive months
      await prisma.subscriberTicket.update({
        where: { id: ticket3!.id },
        data: {
          consecutiveUnpaidMonths: 3,
          status: 'DEFAULT_3_MONTHS',
        },
      });

      for (let m = 2; m <= 4; m++) {
        await prisma.installmentDue.create({
          data: {
            chitGroupId: schemeId,
            ticketId: ticket3!.id,
            installmentMonth: m,
            grossAmount: 5000n,
            dividendDeduction: 0n,
            netPayableAmount: 5000n,
            paidAmount: 0n,
            status: DueStatus.UNPAID,
            cycleStartDate: new Date(),
            cycleEndDate: new Date(),
            dueDate: new Date(),
          },
        });
      }

      // Step 3: Query defaulters list via GET /api/v1/installment-dues/defaulters
      const defaultersRes = await request(app.getHttpServer())
        .get('/api/v1/installment-dues/defaulters?minConsecutiveMonths=3')
        .set('Authorization', `Bearer ${managingPartnerToken}`);
      expect(defaultersRes.status).toBe(200);
      const defaultersList = Array.isArray(defaultersRes.body.data)
        ? defaultersRes.body.data
        : (defaultersRes.body.data?.data || defaultersRes.body.data?.items || []);
      const foundDefaulter = defaultersList.find((d: any) => d.ticketId === ticket3!.id);
      expect(foundDefaulter).toBeDefined();
      expect(foundDefaulter.consecutiveUnpaidMonths).toBe(3);

      // Step 4: Invariant Guards
      // 4a: Cannot remove ticket with < 3 unpaid months (Ticket #2 has 0 unpaid months)
      const prematureRemovalRes = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticket2!.id}/remove-defaulter/request`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ reason: 'Premature removal attempt without 3-month arrears' });
      expect(prematureRemovalRes.status).toBe(400);
      expect(prematureRemovalRes.body.error.message).toContain('3 consecutive unpaid months');

      // 4b: Cannot remove prized ticket (Ticket #1 is prized company ticket)
      const prizedRemovalRes = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticket1!.id}/remove-defaulter/request`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ reason: 'Attempt to remove prized ticket' });
      expect(prizedRemovalRes.status).toBe(400);
      expect(prizedRemovalRes.body.error.message).toContain('PRIZED_TICKET_IMMUTABLE');

      // 4c: Fail-closed Early Exit Settlement Block (Q25)
      const exitSettleRes = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticket3!.id}/settle-removal`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ paymentMethod: PaymentMethod.CASH, notes: 'Attempting early exit settlement' });
      expect(exitSettleRes.status).toBe(400);
      expect(exitSettleRes.body.error.message).toContain('REMOVED_DEF_3M');

      // Step 5: Maker Requests Defaulter Removal (Managing Partner)
      const requestRemovalRes = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticket3!.id}/remove-defaulter/request`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          reason: 'Subscriber defaulted on 3 consecutive monthly installments; formal legal demand sent.',
        });
      expect(requestRemovalRes.status).toBe(200);
      expect(requestRemovalRes.body.success).toBe(true);
      expect(requestRemovalRes.body.data.ticket?.status || requestRemovalRes.body.data.status).toBe('PENDING_REMOVAL_APPROVAL');

      // Step 6: Maker != Checker Guard - Managing Partner cannot approve own removal request
      const selfApproveRemoval = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticket3!.id}/remove-defaulter/approve`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ notes: 'Self-approval attempt by Maker' });
      expect(selfApproveRemoval.status).toBe(403);
      expect(selfApproveRemoval.body.error.message).toContain('MAKER_CHECKER_VIOLATION');

      // Step 7: Checker Partner Approves Defaulter Removal
      const approveRemovalRes = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticket3!.id}/remove-defaulter/approve`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`)
        .send({ notes: 'Removal confirmed after 3-month legal notice expiry.' });
      expect(approveRemovalRes.status).toBe(200);
      expect(approveRemovalRes.body.success).toBe(true);
      expect(approveRemovalRes.body.data.ticket?.status || approveRemovalRes.body.data.status).toBe('REMOVED_DEF_3M');

      // Step 8: ADR-13 Guard - Cannot substitute with member already in this chit group
      const duplicateSubRes = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticket3!.id}/substitute`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`)
        .send({
          newCustomerId: sampleCustomers[1].id, // Already holds Ticket #2
          reason: 'Attempting duplicate ticket allocation to customer #2',
        });
      expect(duplicateSubRes.status).toBe(409);
      expect(duplicateSubRes.body.error.message).toContain('ADR-13 Violation');

      // Step 9: KYC Verification Guard - Candidate must have verified KYC status
      const candidateCustomer = sampleCustomers[20];
      await prisma.customer.update({
        where: { id: candidateCustomer.id },
        data: { isKycVerified: false },
      });

      const unverifiedKycSubRes = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticket3!.id}/substitute`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`)
        .send({
          newCustomerId: candidateCustomer.id,
          reason: 'Substitution with unverified customer',
        });
      expect(unverifiedKycSubRes.status).toBe(400);
      expect(unverifiedKycSubRes.body.error.message).toContain('must have verified KYC status');

      // Step 10: Successful Substitution with KYC-Verified Candidate
      await prisma.customer.update({
        where: { id: candidateCustomer.id },
        data: { isKycVerified: true },
      });

      const successfulSubRes = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticket3!.id}/substitute`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`)
        .send({
          newCustomerId: candidateCustomer.id,
          reason: 'Approved substitute candidate enrolled with verified KYC',
        });
      expect(successfulSubRes.status).toBe(200);
      expect(successfulSubRes.body.success).toBe(true);
      expect(successfulSubRes.body.data.ticket.status).toBe('ACTIVE');
      expect(successfulSubRes.body.data.ticket.newCustomerId).toBe(candidateCustomer.id);
      expect(successfulSubRes.body.data.ticket.previousCustomerId).toBe(sampleCustomers[2].id);

      // Verify database record
      const updatedTicket3 = await prisma.subscriberTicket.findUnique({
        where: { id: ticket3!.id },
      });
      expect(updatedTicket3?.status).toBe('ACTIVE');
      expect(updatedTicket3?.customerId).toBe(candidateCustomer.id);
      expect(updatedTicket3?.consecutiveUnpaidMonths).toBe(0);

      // Verify audit log
      const subAudit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'SubscriberTicket',
          entityId: ticket3!.id,
          action: 'TICKET_SUBSCRIBER_SUBSTITUTED',
        },
      });
      expect(subAudit).toBeDefined();
    });

    it('TC-T4-04: Concurrency Stress - Parallel activation requests are serialized via pessimistic locking', async () => {
      const concCode = `KCCONC-${Date.now()}`;

      // Create draft scheme with 20 tickets
      const groupRes = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: concCode,
          groupName: 'Concurrency Lock Stress Scheme',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      const schemeId = groupRes.body.data.id;

      for (let i = 1; i <= 20; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/chits/${schemeId}/tickets/assign`)
          .set('Authorization', `Bearer ${managingPartnerToken}`)
          .send({ ticketNumber: i, customerId: sampleCustomers[i - 1].id });
      }

      // Fire 3 concurrent parallel activation requests
      const activationPromises = [
        request(app.getHttpServer())
          .post(`/api/v1/chits/${schemeId}/activate`)
          .set('Authorization', `Bearer ${checkerPartnerToken}`),
        request(app.getHttpServer())
          .post(`/api/v1/chits/${schemeId}/activate`)
          .set('Authorization', `Bearer ${checkerPartnerToken}`),
        request(app.getHttpServer())
          .post(`/api/v1/chits/${schemeId}/activate`)
          .set('Authorization', `Bearer ${checkerPartnerToken}`),
      ];

      const results = await Promise.all(activationPromises);
      const successCount = results.filter((r) => r.status === 200).length;
      const failCount = results.filter((r) => r.status === 400).length;

      // Exactly 1 must succeed; other 2 must fail cleanly because scheme is already ACTIVE
      expect(successCount).toBe(1);
      expect(failCount).toBe(2);
    });

    it('TC-T4-04: Abandoned Draft Scheme Lifecycle & Complete Cancellation', async () => {
      const abandonCode = `KCABANDON-${Date.now()}`;

      // Step 1: Create draft
      const draftRes = await request(app.getHttpServer())
        .post('/api/v1/chits/new')
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({
          groupCode: abandonCode,
          groupName: 'Abandoned Scheme Test',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2028-07-01T00:00:00.000Z',
        });
      const sId = draftRes.body.data.id;

      // Step 2: Cancel draft
      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/chits/${sId}/cancel`)
        .set('Authorization', `Bearer ${managingPartnerToken}`);
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      // Step 3: Attempting to assign ticket to CANCELLED scheme fails
      const assignAttempt = await request(app.getHttpServer())
        .post(`/api/v1/chits/${sId}/tickets/assign`)
        .set('Authorization', `Bearer ${managingPartnerToken}`)
        .send({ ticketNumber: 1, customerId: sampleCustomers[0].id });
      expect(assignAttempt.status).toBe(400);
      expect(assignAttempt.body.error.message).toContain('already in CANCELLED status');

      // Step 4: Attempting to activate CANCELLED scheme fails
      const actAttempt = await request(app.getHttpServer())
        .post(`/api/v1/chits/${sId}/activate`)
        .set('Authorization', `Bearer ${checkerPartnerToken}`);
      expect(actAttempt.status).toBe(400);
      expect(actAttempt.body.error.message).toContain('Only DRAFT or REGISTERED schemes can be activated');
    });
  });
});
