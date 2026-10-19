import { Controller, INestApplication, Post, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthController } from '../src/health/health.controller';

@Controller('test-auth')
class TestAuthController {
  @Post('login')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  login() {
    return { success: true };
  }
}

describe('Throttler & Rate Limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: 60000,
            limit: 10,
          },
        ]),
      ],
      controllers: [HealthController, TestAuthController],
      providers: [
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api', {
      exclude: ['health', 'api/docs'],
    });

    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    await app.init();
  });

  it('/health (GET) - should be exempt from throttling via @SkipThrottle()', async () => {
    // Send 15 requests to /health (well above the default limit of 10)
    for (let i = 0; i < 15; i++) {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    }
  });

  it('/api/v1/test-auth/login (POST) - should enforce limit of 3 and return 429 on 4th request', async () => {
    // Requests 1, 2, 3 must succeed
    for (let i = 0; i < 3; i++) {
      const res = await request(app.getHttpServer()).post('/api/v1/test-auth/login');
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    }

    // 4th request must be throttled with 429
    const throttledRes = await request(app.getHttpServer()).post('/api/v1/test-auth/login');
    expect(throttledRes.status).toBe(429);
  });

  afterEach(async () => {
    await app.close();
  });
});
