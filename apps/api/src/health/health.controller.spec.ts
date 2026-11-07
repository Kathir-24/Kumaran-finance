import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  const mockPrismaService = {
    $queryRawUnsafe: jest.fn(),
  };

  const mockRedisClient = {
    ping: jest.fn(),
  };

  const mockRedisProvider = {
    getClient: jest.fn(() => mockRedisClient),
    getIsConnected: jest.fn(() => true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    mockRedisClient.ping.mockResolvedValue('PONG');

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisConnectionProvider,
          useValue: mockRedisProvider,
        },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('reports status ok when database and redis are healthy', async () => {
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('chitflow-api');
    expect(result.database).toBe('connected');
    expect(result.redis).toBe('connected');
    expect(typeof result.sentryActive).toBe('boolean');
    expect(Number.isNaN(Date.parse(result.time))).toBe(false);
  });

  it('provides an identical readiness endpoint alias', async () => {
    const result = await controller.readiness();
    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(result.redis).toBe('connected');
  });

  it('reports liveness status without touching database or redis', () => {
    const result = controller.liveness();
    expect(result.status).toBe('alive');
    expect(result.service).toBe('chitflow-api');
    expect(mockPrismaService.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(mockRedisClient.ping).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailableException (503) when database probe fails', async () => {
    mockPrismaService.$queryRawUnsafe.mockRejectedValue(new Error('Connection terminated unexpectedly'));

    await expect(controller.check()).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException (503) when redis probe fails', async () => {
    mockRedisClient.ping.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(controller.check()).rejects.toThrow(ServiceUnavailableException);
  });

  it('handles optional dependencies gracefully when not provided', async () => {
    const bareController = new HealthController();
    const result = await bareController.check();
    expect(result.status).toBe('ok');
    expect(result.database).toBe('skipped');
    expect(result.redis).toBe('skipped');
  });

  it('triggers sentry test error on demand', () => {
    expect(() => controller.triggerSentryTest()).toThrow(
      'Sentry Verification Diagnostic Test Error',
    );
  });
});
