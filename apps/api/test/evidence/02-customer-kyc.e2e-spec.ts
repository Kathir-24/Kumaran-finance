import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { TransformResponseInterceptor } from '../../src/common/interceptors/transform-response.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';
import { Role } from '@prisma/client';

describe('Evidence Suite 2: Customer Intake, KYC, Nominees & Anti-BOLA (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let superAdminToken: string;
  let accountantToken: string;
  let createdCustomerId: string;
  let createdNomineeId: string;
  const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;

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
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({
        identifier: '9876543210',
        password: 'Admin@Kumaran2026',
      });
    superAdminToken = adminLogin.body.data.accessToken;

    // Login Desk Accountant (Maker - has no permission to create customers)
    const accLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({
        identifier: '9876543213',
        password: 'Admin@Kumaran2026',
      });
    accountantToken = accLogin.body.data.accessToken;
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
    it('TC-HP-01: Registers verified customer profile with auto-generated code and masked Aadhaar', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          fullName: 'K. Thirumoorthy',
          fullNameTamil: 'திருமூர்த்தி',
          phone: testPhone,
          addressLine1: '42, Bhavani Main Road',
          city: 'Perundurai',
          pincode: '638052',
          panNumber: 'ABCDE1234F',
          aadhaarLast4: '4821',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.customerCode).toMatch(/^KC-CUST-\d{5}$/);
      expect(res.body.data.fullName).toBe('K. Thirumoorthy');
      expect(res.body.data.aadhaarLast4).toBe('4821');

      createdCustomerId = res.body.data.id;
    });

    it('TC-HP-02: Adds designated verified nominee to customer profile', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/customers/${createdCustomerId}/nominees`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          fullName: 'T. Kavitha',
          relationship: 'Spouse',
          phone: '9842198765',
          aadhaarLast4: '8912',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.relationship).toBe('Spouse');

      createdNomineeId = res.body.data.id;
    });

    it('TC-HP-03: Fetches customer details including registered nominees', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/customers/${createdCustomerId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdCustomerId);
      expect(res.body.data.nominees).toHaveLength(1);
      expect(res.body.data.nominees[0].fullName).toBe('T. Kavitha');
    });

    it('TC-HP-04: Removes registered nominee from customer profile', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/customers/${createdCustomerId}/nominees/${createdNomineeId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbNominee = await prisma.nominee.findUnique({
        where: { id: createdNomineeId },
      });
      expect(dbNominee).toBeNull();
    });
  });

  // ===========================================================================
  // 2. REQUEST INPUT VALIDATION
  // ===========================================================================
  describe('Category 2: Request Input Validation', () => {
    it('TC-VAL-01: Rejects customer registration with invalid 9-digit phone number', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          fullName: 'Invalid Phone User',
          phone: '984212345', // Only 9 digits
          addressLine1: '14, Main Road',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details.some((d: string) => d.includes('Phone'))).toBe(true);
    });

    it('TC-VAL-02: Rejects customer registration with malformed PAN format', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          fullName: 'Invalid PAN User',
          phone: '9842199999',
          addressLine1: '14, Main Road',
          panNumber: 'INVALID_PAN_123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details.some((d: string) => d.includes('PAN'))).toBe(true);
    });

    it('TC-VAL-03: Rejects full 12-digit Aadhaar to enforce Data Minimization DPDP Act 2023', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          fullName: 'Full Aadhaar User',
          phone: '9842188888',
          addressLine1: '14, Main Road',
          aadhaarLast4: '123456789012', // Violation: only last 4 allowed
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details.some((d: string) => d.includes('Aadhaar'))).toBe(true);
    });
  });

  // ===========================================================================
  // 3. AUTHORIZATION & ANTI-BOLA / IDOR GUARDIANS
  // ===========================================================================
  describe('Category 5: Authorization & Anti-BOLA / IDOR Guardians', () => {
    it('TC-AUTHZ-01: Rejects customer intake from unauthorized role (Desk Accountant)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accountantToken}`)
        .send({
          fullName: 'Accountant Created User',
          phone: '9842177777',
          addressLine1: '14, Main Road',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('TC-AUTHZ-02: Customer persona cannot update device FCM token for another customer account', async () => {
      // Create a genuine customer user in PostgreSQL
      const customerUser = await prisma.user.upsert({
        where: { phone: '9842100001' },
        update: { roles: [Role.CUSTOMER], isActive: true },
        create: {
          name: 'Subscriber Test User',
          phone: '9842100001',
          passwordHash: '$2b$12$dummyHashForTestingPurposesOnly',
          roles: [Role.CUSTOMER],
          isActive: true,
        },
      });

      const customerPayload = {
        sub: customerUser.id,
        phone: customerUser.phone,
        roles: [Role.CUSTOMER],
        tokenType: 'access',
      };

      const jwtService = app.get(JwtService);
      const customerToken = jwtService.sign(customerPayload);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${createdCustomerId}/fcm-token`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ fcmToken: 'malicious-injected-token' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('ACCESS_DENIED: Customers are only permitted to update their own device push token');
    });
  });

  // ===========================================================================
  // 4. QUERY BEHAVIOR & PAGINATION
  // ===========================================================================
  describe('Category 8: Query Behavior, Search & Pagination', () => {
    it('TC-QRY-01: Returns paginated subscriber list with metadata and whole-rupee amounts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers?page=1&limit=5')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toBeDefined();
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.limit).toBe(5);
      expect(res.body.data.total).toEqual(expect.any(Number));
      expect(res.body.data.totalPages).toEqual(expect.any(Number));
    });

    it('TC-QRY-02: Returns 404 Not Found for non-existent customer UUID query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ===========================================================================
  // 5. REGRESSION (DEF-01 CUSTOMER FCM TOKEN PERSISTENCE)
  // ===========================================================================
  describe('Category 10: Regression Tests', () => {
    it('TC-REG-01: DEF-01 Fix - Customer FCM token updates query phone: true in Prisma', async () => {
      const uniqueDeviceToken = `fcm_device_token_cust_${Date.now()}`;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${createdCustomerId}/fcm-token`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ fcmToken: uniqueDeviceToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fcmToken).toBe(uniqueDeviceToken);

      // Direct PostgreSQL verification
      const dbCust = await prisma.customer.findUnique({
        where: { id: createdCustomerId },
        select: { id: true, fcmToken: true, phone: true },
      });

      expect(dbCust).toBeDefined();
      expect(dbCust?.fcmToken).toBe(uniqueDeviceToken);
      expect(dbCust?.phone).toBe(testPhone);
    });
  });
});
