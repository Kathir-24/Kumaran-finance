import {
  BadRequestException,
  Body,
  Controller,
  Get,
  INestApplication,
  Post,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { BigIntInterceptor } from '../src/common/interceptors/bigint.interceptor';
import { TransformResponseInterceptor } from '../src/common/interceptors/transform-response.interceptor';
import { HealthController } from '../src/health/health.controller';

class SampleValidateDto {
  @IsNotEmpty({ message: 'Full name is required' })
  @IsString()
  fullName: string;

  @Matches(/^\d{10}$/, { message: 'Phone number must be exactly 10 digits' })
  phone: string;
}

@Controller('sample')
class SampleController {
  @Get('ping')
  ping() {
    return { pong: true };
  }

  @Get('financial')
  financial() {
    return {
      groupCode: 'KCA-1L-20M-01',
      chitValue: 100000n,
      commissionAmount: 4000n,
      foremanCommissionRate: new Prisma.Decimal('4.00'),
    };
  }

  @Get('domain-error')
  domainError() {
    throw new BadRequestException('Bid discount exceeds maximum allowable 1/4 ceiling of 25%');
  }

  @Post('validate')
  validate(@Body() _dto: SampleValidateDto) {
    return { valid: true };
  }
}

describe('Standardized Response Envelope & Global Exception Filter (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController, SampleController],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api', {
      exclude: ['health', 'api/docs'],
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
  });

  describe('1. Success Response Envelope (HTTP 200 / 201)', () => {
    it('should wrap standard responses in { success: true, statusCode, timestamp, data }', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/sample/ping');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        statusCode: 200,
        timestamp: expect.any(String),
        data: { pong: true },
      });
    });

    it('should serialize BigInt values to safe numbers within the data envelope', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/sample/financial');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.statusCode).toBe(200);
      expect(res.body.data).toEqual({
        groupCode: 'KCA-1L-20M-01',
        chitValue: 100000,
        commissionAmount: 4000,
        foremanCommissionRate: 4,
      });
    });
  });

  describe('2. Bypass Envelope Exemption', () => {
    it('/health should remain raw and exempt from envelope via @BypassEnvelope()', async () => {
      const res = await request(app.getHttpServer()).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('chitflow-api');
      expect(res.body.data).toBeUndefined();
    });
  });

  describe('3. Standardized Error Envelope (HTTP 4xx / 5xx)', () => {
    it('should format domain exceptions into standardized error envelope', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/sample/domain-error');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        statusCode: 400,
        timestamp: expect.any(String),
        error: {
          code: 'BAD_REQUEST',
          message: 'Bid discount exceeds maximum allowable 1/4 ceiling of 25%',
          details: [],
        },
      });
    });

    it('should format DTO validation errors with field details in error envelope', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sample/validate')
        .send({ phone: 'invalid-phone' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.statusCode).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(Array.isArray(res.body.error.details)).toBe(true);
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it('should format 404 route not found into standardized error envelope', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/sample/nonexistent-route');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.statusCode).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
