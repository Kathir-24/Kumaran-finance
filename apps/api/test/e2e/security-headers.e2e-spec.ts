import { Controller, Get, INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_EXPOSED_HEADERS,
  CORS_MAX_AGE_SECONDS,
  DEFAULT_CORS_ORIGINS,
} from '../../src/common/constants';
import { HealthController } from '../../src/health/health.controller';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { pong: true };
  }
}

describe('Security Headers & CORS (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController, PingController],
    }).compile();

    app = moduleFixture.createNestApplication();

    // 1. Security Headers via Helmet
    app.use(
      helmet({
        crossOriginEmbedderPolicy: false,
        contentSecurityPolicy: false,
        xFrameOptions: { action: 'sameorigin' },
      }),
    );

    // 2. Strict CORS Configuration
    app.enableCors({
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (!origin || DEFAULT_CORS_ORIGINS.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      methods: CORS_ALLOWED_METHODS,
      allowedHeaders: CORS_ALLOWED_HEADERS,
      exposedHeaders: CORS_EXPOSED_HEADERS,
      credentials: true,
      maxAge: CORS_MAX_AGE_SECONDS,
    });

    app.setGlobalPrefix('api', {
      exclude: ['health', 'api/docs'],
    });

    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    await app.init();
  });

  describe('Helmet Security Headers', () => {
    it('should inject X-Content-Type-Options: nosniff', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should inject X-Frame-Options: SAMEORIGIN', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('should remove or not expose X-Powered-By: Express', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Strict CORS Verification', () => {
    it('should permit preflight OPTIONS request from allowed origin (localhost:3000)', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/v1/ping')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Authorization, X-Branch-Id, Idempotency-Key');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should permit GET request from allowed origin and attach Access-Control-Allow-Origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ping')
        .set('Origin', 'http://localhost:3001');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    });

    it('should permit mobile Flutter app request where Origin header is absent', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/ping');
      expect(res.status).toBe(200);
      expect(res.body.pong).toBe(true);
    });

    it('should reject or deny CORS header on unauthorized origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ping')
        .set('Origin', 'http://malicious-phishing-site.com');

      // Either returns 500/error from CORS middleware or does not reflect access-control-allow-origin
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
