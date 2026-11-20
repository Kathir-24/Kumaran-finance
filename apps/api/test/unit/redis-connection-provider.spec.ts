import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisConnectionProvider } from '../../src/jobs/providers/redis-connection.provider';

const mockEventListeners: Record<string, ((...args: any[]) => void)[]> = {};
let capturedOptions: any = null;
let mockQuit: jest.Mock;
let mockDisconnect: jest.Mock;
let mockConnect: jest.Mock;

jest.mock('ioredis', () => {
  return {
    Redis: jest.fn().mockImplementation((options: any) => {
      capturedOptions = options;
      mockQuit = jest.fn().mockResolvedValue('OK');
      mockDisconnect = jest.fn();
      mockConnect = jest.fn().mockResolvedValue('OK');

      return {
        options,
        on: jest.fn().mockImplementation((event: string, handler: (...args: any[]) => void) => {
          if (!mockEventListeners[event]) {
            mockEventListeners[event] = [];
          }
          mockEventListeners[event].push(handler);
        }),
        connect: mockConnect,
        quit: mockQuit,
        disconnect: mockDisconnect,
      };
    }),
  };
});

function emitEvent(event: string, ...args: any[]): void {
  const handlers = mockEventListeners[event] || [];
  for (const handler of handlers) {
    handler(...args);
  }
}

describe('RedisConnectionProvider Unit Tests (Issue INFRA-01: Reconnection Suicide Fix)', () => {
  let provider: RedisConnectionProvider;
  let configServiceMock: { get: jest.Mock };

  beforeAll(() => {
    // Silence logger during tests to keep console output clean
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    for (const key of Object.keys(mockEventListeners)) {
      delete mockEventListeners[key];
    }
    capturedOptions = null;

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          REDIS_HOST: '127.0.0.1',
          REDIS_PORT: 6379,
          REDIS_DB: 0,
        };
        return configMap[key] ?? defaultValue;
      }),
    };

    provider = new RedisConnectionProvider(configServiceMock as unknown as ConfigService);
  });

  describe('Part 1: Reconnection Suicide Elimination (retryStrategy Invariants)', () => {
    it('INFRA-01-A: retryStrategy must return a positive number for any retry attempts (1, 3, 4, 10, 50, 100)', () => {
      const retryStrategy = capturedOptions?.retryStrategy;
      expect(typeof retryStrategy).toBe('function');

      const testAttempts = [1, 3, 4, 10, 50, 100];
      for (const attempts of testAttempts) {
        const delay = retryStrategy(attempts);
        expect(typeof delay).toBe('number');
        expect(delay).toBeGreaterThan(0);
        expect(Number.isFinite(delay)).toBe(true);
      }
    });

    it('INFRA-01-B: retryStrategy must NEVER return null or halt reconnection (testing attempts 1..1000)', () => {
      const retryStrategy = capturedOptions?.retryStrategy;
      expect(typeof retryStrategy).toBe('function');

      // Previously, times > 3 returned null, permanently killing Redis connectivity.
      // This test proves that for 1,000 consecutive reconnection attempts, null is NEVER returned.
      for (let times = 1; times <= 1000; times++) {
        const delay = retryStrategy(times);
        expect(delay).not.toBeNull();
        expect(delay).toBeDefined();
        expect(typeof delay).toBe('number');
        expect(delay).toBeGreaterThan(0);
        // Ensure cap at 3000ms + max jitter 250ms
        expect(delay).toBeLessThanOrEqual(3250);
      }
    });

    it('INFRA-01-C: retryStrategy incorporates backoff and jitter characteristics', () => {
      const retryStrategy = capturedOptions?.retryStrategy;
      const delay1 = retryStrategy(1);
      const delay100 = retryStrategy(100);

      // Attempt 1: min(1*250, 3000) + jitter = 250..499
      expect(delay1).toBeGreaterThanOrEqual(250);
      expect(delay1).toBeLessThan(500);

      // Attempt 100: capped at min(100*250, 3000) + jitter = 3000..3249
      expect(delay100).toBeGreaterThanOrEqual(3000);
      expect(delay100).toBeLessThan(3250);
    });
  });

  describe('Part 2: Connection Lifecycle & isConnected State Transitions', () => {
    it('INFRA-01-D: "connect" and "ready" events must transition isConnected to true', () => {
      expect(provider.getIsConnected()).toBe(false);

      emitEvent('connect');
      expect(provider.getIsConnected()).toBe(true);

      emitEvent('close');
      expect(provider.getIsConnected()).toBe(false);

      emitEvent('ready');
      expect(provider.getIsConnected()).toBe(true);
    });

    it('INFRA-01-E: "close", "reconnecting", "error", and "end" events must transition isConnected to false', () => {
      // Transition to connected first
      emitEvent('ready');
      expect(provider.getIsConnected()).toBe(true);

      // 'close' event
      emitEvent('close');
      expect(provider.getIsConnected()).toBe(false);

      // Re-connect then 'reconnecting' event
      emitEvent('ready');
      expect(provider.getIsConnected()).toBe(true);
      emitEvent('reconnecting', 500);
      expect(provider.getIsConnected()).toBe(false);

      // Re-connect then 'error' event
      emitEvent('ready');
      expect(provider.getIsConnected()).toBe(true);
      emitEvent('error', new Error('ECONNREFUSED'));
      expect(provider.getIsConnected()).toBe(false);

      // Re-connect then 'end' event
      emitEvent('ready');
      expect(provider.getIsConnected()).toBe(true);
      emitEvent('end');
      expect(provider.getIsConnected()).toBe(false);
    });
  });

  describe('Part 3: Graceful Lifecycle Teardown (onModuleDestroy)', () => {
    it('INFRA-01-F: onModuleDestroy calls client.quit() and cleans up gracefully without throwing', async () => {
      await expect(provider.onModuleDestroy()).resolves.not.toThrow();
      expect(mockQuit).toHaveBeenCalledTimes(1);
    });

    it('INFRA-01-G: onModuleDestroy falls back to client.disconnect() if quit() throws, without raising error', async () => {
      mockQuit.mockRejectedValueOnce(new Error('Connection broken'));

      await expect(provider.onModuleDestroy()).resolves.not.toThrow();
      expect(mockQuit).toHaveBeenCalledTimes(1);
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it('INFRA-01-H: onModuleDestroy handles null client safely', async () => {
      (provider as any).client = null;
      await expect(provider.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('Part 4: Configuration & Client Options (Password, TLS, DB)', () => {
    it('INFRA-01-I: initializes client with default options', () => {
      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.host).toBe('127.0.0.1');
      expect(capturedOptions.port).toBe(6379);
      expect(capturedOptions.db).toBe(0);
      expect(capturedOptions.maxRetriesPerRequest).toBeNull();
      expect(capturedOptions.enableReadyCheck).toBe(false);
      expect(capturedOptions.lazyConnect).toBe(true);
    });

    it('INFRA-01-J: supports REDIS_PASSWORD with trimming', () => {
      const customConfigService = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'REDIS_PASSWORD') return '  secret_auth_pass  ';
          return defaultValue;
        }),
      };

      new RedisConnectionProvider(customConfigService as unknown as ConfigService);
      expect(capturedOptions.password).toBe('secret_auth_pass');
    });

    it('INFRA-01-K: supports REDIS_TLS configuration (boolean and object)', () => {
      // Test boolean true
      const tlsConfigTrue = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'REDIS_TLS') return true;
          return defaultValue;
        }),
      };
      new RedisConnectionProvider(tlsConfigTrue as unknown as ConfigService);
      expect(capturedOptions.tls).toEqual({});

      // Test object
      const tlsObject = { rejectUnauthorized: false };
      const tlsConfigObject = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'REDIS_TLS') return tlsObject;
          return defaultValue;
        }),
      };
      new RedisConnectionProvider(tlsConfigObject as unknown as ConfigService);
      expect(capturedOptions.tls).toEqual(tlsObject);
    });

    it('INFRA-01-L: getClient returns client instance', () => {
      const client = provider.getClient();
      expect(client).toBeDefined();
      expect(client).not.toBeNull();
    });
  });
});
