import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_EXPOSED_HEADERS,
  CORS_MAX_AGE_SECONDS,
  DEFAULT_CORS_ORIGINS,
} from '../../src/common/constants';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { TransformResponseInterceptor } from '../../src/common/interceptors/transform-response.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';
import { Role } from '@prisma/client';

describe('Evidence Suite 1: Authentication, Security Headers & Session Protocol (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let superAdminAccessToken: string;
  let superAdminRefreshToken: string;
  let superAdminUserId: string;

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

    // Mirror main.ts production bootstrap exactly
    app.use(
      helmet({
        crossOriginEmbedderPolicy: false,
        contentSecurityPolicy: false,
        xFrameOptions: { action: 'sameorigin' },
      }),
    );

    app.enableCors({
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (!origin || DEFAULT_CORS_ORIGINS.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      methods: CORS_ALLOWED_METHODS,
      allowedHeaders: CORS_ALLOWED_HEADERS,
      exposedHeaders: CORS_EXPOSED_HEADERS,
      credentials: true,
      maxAge: CORS_MAX_AGE_SECONDS,
    });

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

  // ===========================================================================
  // 1. HAPPY PATH
  // ===========================================================================
  describe('Category 1: Happy Path Scenarios', () => {
    it('TC-HP-01: Office staff login returns standard envelope with JWT tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/web/login')
        .send({
          phone: '9876543210',
          password: 'Admin@Kumaran2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.statusCode).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.roles).toContain(Role.SUPER_ADMIN);

      superAdminAccessToken = res.body.data.accessToken;
      superAdminRefreshToken = res.body.data.refreshToken;
      superAdminUserId = res.body.data.user.id;
    });

    it('TC-HP-02: Field Agent mobile quick unlock with 6-digit MPIN', async () => {
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

    it('TC-HP-03: Authenticated profile retrieval (/auth/me)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${superAdminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(superAdminUserId);
      expect(res.body.data.phone).toBe('9876543210');
      expect(res.body.data.roles).toContain(Role.SUPER_ADMIN);
    });
  });

  // ===========================================================================
  // 2. REQUEST VALIDATION
  // ===========================================================================
  describe('Category 2: Request Input Validation', () => {
    it('TC-VAL-01: Rejects login with missing mandatory phone', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/web/login')
        .send({
          password: 'Admin@Kumaran2026',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details).toBeDefined();
      expect(res.body.error.details.some((d: string) => d.includes('Phone'))).toBe(true);
    });

    it('TC-VAL-02: Rejects login with password shorter than 6 characters', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/web/login')
        .send({
          phone: '9876543210',
          password: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Password must be at least 6 characters');
    });

    it('TC-VAL-03: Rejects login with non-whitelisted unexpected properties', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/web/login')
        .send({
          phone: '9876543210',
          password: 'Admin@Kumaran2026',
          maliciousRoleInject: 'SUPER_ADMIN',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('property maliciousRoleInject should not exist');
    });

    it('TC-VAL-04: Rejects MPIN unlock with non-6-digit input', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mobile/login-mpin')
        .send({
          phone: '9876543214',
          mpin: '1234', // Only 4 digits
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // 3. HTTP CONTRACT, ENVELOPES & HEADERS
  // ===========================================================================
  describe('Category 3: HTTP Contract & Security Headers', () => {
    it('TC-CON-01: Exposes required Helmet security headers and SameOrigin frames', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
    });

    it('TC-CON-02: Blocks unauthorized origins via strict CORS policy', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'http://unauthorized-phishing-portal.com');

      expect(res.status).toBe(500);
    });

    it('TC-CON-03: Formats 404 responses in standardized StandardErrorResponse schema', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/non-existent-endpoint');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        statusCode: 404,
        timestamp: expect.any(String),
        error: {
          code: 'NOT_FOUND',
          message: expect.any(String),
          details: expect.any(Array),
        },
      });
    });
  });

  // ===========================================================================
  // 4. AUTHENTICATION (CREDENTIAL INTEGRITY & TOKEN LIFECYCLE)
  // ===========================================================================
  describe('Category 4: Authentication & Token Lifecycle', () => {
    it('TC-AUTH-01: Rejects requests to secured routes without Authorization header', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('TC-AUTH-02: Rejects requests with malformed Bearer tokens', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token-string-xyz');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('TC-AUTH-03: Rotates access and refresh tokens via /auth/refresh-token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh-token')
        .send({
          refreshToken: superAdminRefreshToken,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.accessToken).not.toBe(superAdminAccessToken);

      // Update stored tokens for subsequent tests
      superAdminAccessToken = res.body.data.accessToken;
      superAdminRefreshToken = res.body.data.refreshToken;
    });

    it('TC-AUTH-04: Rejects refresh attempt with forged or non-existent token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh-token')
        .send({
          refreshToken: 'forged.jwt.refresh.token.signature',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // 5. REGRESSION (DEF-02 STAFF FCM TOKEN PERSISTENCE)
  // ===========================================================================
  describe('Category 10: Regression Tests', () => {
    it('TC-REG-02: DEF-02 Fix - Staff FCM token updates query roles: true in Prisma', async () => {
      const uniqueDeviceToken = `fcm_device_token_staff_${Date.now()}`;

      const res = await request(app.getHttpServer())
        .patch('/api/v1/auth/fcm-token')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ fcmToken: uniqueDeviceToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify directly in PostgreSQL that token persisted
      const user = await prisma.user.findUnique({
        where: { id: superAdminUserId },
        select: { id: true, fcmToken: true, roles: true },
      });

      expect(user).toBeDefined();
      expect(user?.fcmToken).toBe(uniqueDeviceToken);
      expect(user?.roles).toContain(Role.SUPER_ADMIN);
    });
  });
});
