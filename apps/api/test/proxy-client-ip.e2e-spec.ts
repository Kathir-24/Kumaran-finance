import {
  Controller,
  Get,
  type INestApplication,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  Post,
  Req,
  VersioningType,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  normalizeClientIp,
  parseTrustProxySetting,
} from '../src/common/context/proxy-ip.util';
import { RequestContext } from '../src/common/context/request-context';
import { RequestContextMiddleware } from '../src/common/context/request-context.middleware';
import { AppThrottlerGuard } from '../src/common/throttler/app-throttler.guard';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

@Controller('proxy-probe')
class ProxyProbeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('whoami')
  whoami(@Req() req: Request) {
    return {
      expressIp: normalizeClientIp(req.ip),
      contextIp: RequestContext.getIpAddress(),
      requestId: RequestContext.getRequestId(),
      userAgent: RequestContext.getUserAgent(),
    };
  }

  @Post('audit-direct')
  async writeDirectAudit() {
    const entry = await this.prisma.auditLog.create({
      data: {
        action: 'E2E_PROXY_IP_DIRECT',
        entityType: 'E2EProbe',
        entityId: 'probe-direct',
      },
    });
    return { id: entry.id, ipAddress: entry.ipAddress };
  }

  @Post('audit-tx')
  async writeTxAudit() {
    const entry = await this.prisma.$transaction(async (tx) => {
      return tx.auditLog.create({
        data: {
          action: 'E2E_PROXY_IP_TX',
          entityType: 'E2EProbe',
          entityId: 'probe-tx',
        },
      });
    });
    return { id: entry.id, ipAddress: entry.ipAddress };
  }
}

@Controller('auth/web')
class ProbeWebAuthController {
  @Post('login')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  login() {
    return {
      ok: true,
      contextIp: RequestContext.getIpAddress(),
    };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
  ],
  controllers: [ProxyProbeController, ProbeWebAuthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
class ProxyTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}

describe('Multi-Hop Proxy Client IP, Anti-Spoofing, Throttler & AuditLog (e2e) [DEF-FE-06]', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdAuditIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ProxyTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    (app.getHttpAdapter().getInstance() as any).set(
      'trust proxy',
      parseTrustProxySetting(undefined),
    );
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    if (createdAuditIds.length > 0 && prisma) {
      await prisma.auditLog.deleteMany({
        where: { id: { in: createdAuditIds } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  it('N=1 (Direct Client): resolves loopback socket IP when no proxy headers are present', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/proxy-probe/whoami')
      .expect(200);

    expect(['127.0.0.1', '::1']).toContain(res.body.contextIp);
    expect(res.body.expressIp).toBe(res.body.contextIp);
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('N=2 (1-Hop Mobile -> Nginx -> API): resolves real public client IP & preserves trace ID', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/proxy-probe/whoami')
      .set('X-Forwarded-For', '106.51.10.22')
      .set('X-Request-ID', 'nginx-mobile-trace-01')
      .set('User-Agent', 'KumaranFlutter/2.0')
      .expect(200);

    expect(res.body).toEqual({
      expressIp: '106.51.10.22',
      contextIp: '106.51.10.22',
      requestId: 'nginx-mobile-trace-01',
      userAgent: 'KumaranFlutter/2.0',
    });
    expect(res.headers['x-request-id']).toBe('nginx-mobile-trace-01');
  });

  it('N=3 (2-Hop Browser -> Nginx -> Next.js BFF -> API): strips internal proxy hops and resolves browser IP', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/proxy-probe/whoami')
      .set('X-Forwarded-For', '103.21.45.9, 172.18.0.5')
      .set('X-Real-IP', '103.21.45.9')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-Host', 'chits.kumaranfinance.in')
      .set('X-Request-ID', 'bff-browser-trace-02')
      .expect(200);

    expect(res.body.expressIp).toBe('103.21.45.9');
    expect(res.body.contextIp).toBe('103.21.45.9');
    expect(res.body.requestId).toBe('bff-browser-trace-02');
  });

  it('Anti-Spoofing: ignores attacker left-injected X-Forwarded-For (8.8.8.8) on both 1-hop and 2-hop chains', async () => {
    const spoof1Hop = await request(app.getHttpServer())
      .get('/api/v1/proxy-probe/whoami')
      .set('X-Forwarded-For', '8.8.8.8, 106.51.10.22')
      .expect(200);
    expect(spoof1Hop.body.contextIp).toBe('106.51.10.22');

    const spoof2Hop = await request(app.getHttpServer())
      .get('/api/v1/proxy-probe/whoami')
      .set('X-Forwarded-For', '8.8.8.8, 106.51.10.22, 172.18.0.5')
      .expect(200);
    expect(spoof2Hop.body.contextIp).toBe('106.51.10.22');
  });

  it('IPv4-mapped IPv6 normalization: normalizes ::ffff: prefix cleanly', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/proxy-probe/whoami')
      .set('X-Forwarded-For', '::ffff:49.37.110.12, 172.18.0.5')
      .expect(200);

    expect(res.body.expressIp).toBe('49.37.110.12');
    expect(res.body.contextIp).toBe('49.37.110.12');
  });

  it('Throttler Isolation: saturating /auth/web/login from Client A behind BFF does NOT lock out Client B', async () => {
    const clientAXff = '198.51.100.11, 172.18.0.5';
    const clientBXff = '203.0.113.77, 172.18.0.5';

    for (let i = 0; i < 3; i++) {
      const okRes = await request(app.getHttpServer())
        .post('/api/v1/auth/web/login')
        .set('X-Forwarded-For', clientAXff);
      expect(okRes.status).toBe(201);
      expect(okRes.body.contextIp).toBe('198.51.100.11');
    }

    // 4th attempt from Client A hits 429
    const blockedRes = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .set('X-Forwarded-For', clientAXff);
    expect(blockedRes.status).toBe(429);

    // Client B arriving over the exact same Nginx + BFF proxy peer succeeds cleanly
    const clientBRes = await request(app.getHttpServer())
      .post('/api/v1/auth/web/login')
      .set('X-Forwarded-For', clientBXff);
    expect(clientBRes.status).toBe(201);
    expect(clientBRes.body.contextIp).toBe('203.0.113.77');
  });

  it('AuditLog Persistence: saves real forwarded IP automatically in direct and $transaction Prisma writes', async () => {
    const directRes = await request(app.getHttpServer())
      .post('/api/v1/proxy-probe/audit-direct')
      .set('X-Forwarded-For', '106.51.10.22, 172.18.0.5')
      .expect(201);

    createdAuditIds.push(directRes.body.id);
    expect(directRes.body.ipAddress).toBe('106.51.10.22');

    const txRes = await request(app.getHttpServer())
      .post('/api/v1/proxy-probe/audit-tx')
      .set('X-Forwarded-For', '8.8.8.8, 103.21.45.9, 172.18.0.5')
      .expect(201);

    createdAuditIds.push(txRes.body.id);
    expect(txRes.body.ipAddress).toBe('103.21.45.9');

    // Background job / non-HTTP context gracefully leaves ipAddress null
    const bgEntry = await prisma.auditLog.create({
      data: {
        action: 'E2E_BG_JOB_NULL_IP',
        entityType: 'E2EProbe',
        entityId: 'probe-bg',
      },
    });
    createdAuditIds.push(bgEntry.id);
    expect(bgEntry.ipAddress).toBeNull();
  });
});
