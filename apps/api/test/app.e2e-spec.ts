import { Controller, Get, INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthController } from '../src/health/health.controller';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { pong: true };
  }
}

describe('API Versioning & Routing (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController, PingController],
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

  it('/health (GET) - should be accessible at root without prefix or versioning (exempt)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('chitflow-api');
      });
  });

  it('/api/v1/ping (GET) - should mount under /api/v1 prefix and URI versioning', () => {
    return request(app.getHttpServer())
      .get('/api/v1/ping')
      .expect(200)
      .expect((res) => {
        expect(res.body.pong).toBe(true);
      });
  });

  it('/ping (GET) - should return 404 proving unversioned root access is disabled', () => {
    return request(app.getHttpServer())
      .get('/ping')
      .expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});



