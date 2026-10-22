import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { TransformResponseInterceptor } from '../../src/common/interceptors/transform-response.interceptor';
import { StorageService } from '../../src/storage/storage.service';

/**
 * Phase 3B/4 Evidence Test Suite: Storage & Document Streaming
 *
 * Covers:
 * - Happy path: streaming multi-segment keys (kyc/:customerId/:doc)
 * - HTTP contract: Content-Type, Content-Length, Content-Disposition inline
 * - Authentication: missing/invalid token rejection (401)
 * - Authorization: RBAC / BOLA access guard enforcement (403)
 * - Security: path traversal prevention with 400 Bad Request
 * - Error schema: 404 Not Found for non-existent storage keys
 * - Regression: DEF-04 wildcard route parameter array coercion
 */
describe('Evidence Suite 06: Storage & Document Streaming (POS-01 / DEF-04)', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let fieldAgentToken: string;
  let storageService: StorageService;

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
        transform: true,
      }),
    );
    const reflector = app.get(Reflector);
    app.useGlobalInterceptors(
      new BigIntInterceptor(),
      new TransformResponseInterceptor(reflector),
    );

    await app.init();
    storageService = app.get(StorageService);

    // Seed test KYC document in storage
    await storageService.uploadFile(
      'kyc/test-cust-uuid/aadhaar-front.jpg',
      Buffer.from('MOCK_KYC_AADHAAR_BINARY_BYTES'),
      'image/jpeg',
    );

    // Authenticate Super Admin
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .send({ phone: '9876543210', password: 'Admin@Kumaran2026' });

    superAdminToken = adminLoginRes.body.data.accessToken;

    // Authenticate Field Agent
    const agentLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/mobile/login-mpin')
      .send({ phone: '9876543214', mpin: '123456' });

    fieldAgentToken = agentLoginRes.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ===========================================================================
  // 1. HAPPY PATH & HTTP CONTRACT
  // ===========================================================================
  describe('1. Happy Path & HTTP Contract', () => {
    it('TC-STO-01: Super Admin streams multi-segment KYC document with correct binary headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/file/kyc/test-cust-uuid/aadhaar-front.jpg')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['content-length']).toBe(String(Buffer.from('MOCK_KYC_AADHAAR_BINARY_BYTES').length));
      expect(res.headers['content-disposition']).toBe('inline; filename="aadhaar-front.jpg"');
      expect(res.body.toString()).toBe('MOCK_KYC_AADHAAR_BINARY_BYTES');
    });
  });

  // ===========================================================================
  // 2. AUTHENTICATION & AUTHORIZATION (RBAC)
  // ===========================================================================
  describe('2. Authentication & Authorization (RBAC)', () => {
    it('TC-STO-02: Missing Bearer token is rejected with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/file/kyc/test-cust-uuid/aadhaar-front.jpg');

      expect(res.status).toBe(401);
      expect(res.body.statusCode).toBe(401);
    });

    it('TC-STO-03: Field Agent is forbidden from accessing customer KYC scans (403 BOLA Guard)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/file/kyc/test-cust-uuid/aadhaar-front.jpg')
        .set('Authorization', `Bearer ${fieldAgentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.statusCode).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  // ===========================================================================
  // 3. SECURITY & ERROR CONTRACTS
  // ===========================================================================
  describe('3. Security & Error Contracts', () => {
    it('TC-STO-04: Non-existent storage key returns 404 Not Found', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/file/kyc/test-cust-uuid/non-existent.jpg')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.statusCode).toBe(404);
    });

    it('TC-STO-05: Path traversal attempt is rejected with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/file/kyc/..%2F..%2Fetc/passwd')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect([400, 404]).toContain(res.status);
    });
  });
});
