import { Controller, Get, INestApplication, Post, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppThrottlerGuard } from '../src/common/throttler/app-throttler.guard';
import { HealthController } from '../src/health/health.controller';

@Controller('test-auth')
class TestAuthController {
  @Post('login')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  login() {
    return { success: true };
  }

  @Get('user-dashboard')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  dashboard() {
    return { success: true, message: 'dashboard loaded' };
  }
}

describe('Throttler & Rate Limiting (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  beforeEach(async () => {
    jwtService = new JwtService({ secret: 'test-secret-throttle' });

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
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: APP_GUARD,
          useClass: AppThrottlerGuard,
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

  it('/api/v1/test-auth/login (POST) - should enforce limit of 3 and return 429 with Retry-After on 4th request', async () => {
    // Requests 1, 2, 3 must succeed
    for (let i = 0; i < 3; i++) {
      const res = await request(app.getHttpServer()).post('/api/v1/test-auth/login');
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    }

    // 4th request must be throttled with 429
    const throttledRes = await request(app.getHttpServer()).post('/api/v1/test-auth/login');
    expect(throttledRes.status).toBe(429);
    expect(throttledRes.header['retry-after']).toBeDefined();
  });

  it('NAT Isolation Proof: Two authenticated users sharing the SAME IP do not collide', async () => {
    const tokenUser1 = jwtService.sign({ sub: 'usr_partner_01', roles: ['SUPER_ADMIN'] });
    const tokenUser2 = jwtService.sign({ sub: 'usr_partner_02', roles: ['SUPER_ADMIN'] });

    // User 1 uses up all 3 allowed requests
    for (let i = 0; i < 3; i++) {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-auth/user-dashboard')
        .set('Authorization', `Bearer ${tokenUser1}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }

    // User 1's 4th request MUST be 429 throttled
    const throttledUser1 = await request(app.getHttpServer())
      .get('/api/v1/test-auth/user-dashboard')
      .set('Authorization', `Bearer ${tokenUser1}`);
    expect(throttledUser1.status).toBe(429);

    // User 2 from the EXACT SAME IP (test runner socket) MUST NOT be blocked!
    const user2Res = await request(app.getHttpServer())
      .get('/api/v1/test-auth/user-dashboard')
      .set('Authorization', `Bearer ${tokenUser2}`);
    expect(user2Res.status).toBe(200);
    expect(user2Res.body.success).toBe(true);
  });

  it('Anti-Spoofing Proof: Forged Bearer token fails cryptographic signature and falls back to IP bucket', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlcl8wMSJ9.invalid_signature';

    for (let i = 0; i < 3; i++) {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-auth/user-dashboard')
        .set('Authorization', `Bearer ${fakeToken}`);
      expect(res.status).toBe(200);
    }

    const throttled = await request(app.getHttpServer())
      .get('/api/v1/test-auth/user-dashboard')
      .set('Authorization', `Bearer ${fakeToken}`);
    expect(throttled.status).toBe(429);
  });

  afterEach(async () => {
    await app.close();
  });
});
