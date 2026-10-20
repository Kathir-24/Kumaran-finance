// ==============================================================================
// Kumaran Chits — Bull Board Queue Monitor Test Suite
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/01-business/permissions-matrix.md (§1), docs/03-architecture/completed-modules-api-registry.md (§13)
// ==============================================================================

import { ConfigService } from '@nestjs/config';
import { BullBoardAuthMiddleware } from '../src/jobs/bull-board/bull-board-auth.middleware';
import { BullBoardService } from '../src/jobs/bull-board/bull-board.service';
import { BullMqQueueProvider } from '../src/jobs/providers/bullmq-queue.provider';

describe('Component: Bull Board Queue Monitor UI', () => {
  describe('1. BullBoardAuthMiddleware (HTTP Basic Auth Security)', () => {
    let middleware: BullBoardAuthMiddleware;
    let configServiceMock: jest.Mocked<ConfigService>;
    let mockReq: any;
    let mockRes: any;
    let mockNext: jest.Mock;

    beforeEach(() => {
      configServiceMock = {
        get: jest.fn((key: string) => {
          if (key === 'BULL_BOARD_USER') return 'partner_admin';
          if (key === 'BULL_BOARD_PASSWORD') return 'secret_perundurai_2026';
          return null;
        }),
      } as any;

      middleware = new BullBoardAuthMiddleware(configServiceMock);
      mockReq = { headers: {} };
      mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
      mockNext = jest.fn();
    });

    it('should reject request without authorization header with 401 and WWW-Authenticate', () => {
      middleware.use(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Basic realm="Kumaran Chits Queue Monitor"',
      );
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Authentication required'),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject non-Basic authorization header with 401', () => {
      mockReq.headers.authorization = 'Bearer sample_jwt_token';

      middleware.use(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject incorrect username or password with 401', () => {
      const invalidCreds = Buffer.from('wrong_user:wrong_pass').toString('base64');
      mockReq.headers.authorization = `Basic ${invalidCreds}`;

      middleware.use(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should authenticate valid Super Admin credentials and invoke next()', () => {
      const validCreds = Buffer.from('partner_admin:secret_perundurai_2026').toString('base64');
      mockReq.headers.authorization = `Basic ${validCreds}`;

      middleware.use(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('2. BullBoardService (Dashboard & Queue Adapter Engine)', () => {
    let service: BullBoardService;
    let queueProviderMock: jest.Mocked<BullMqQueueProvider>;

    beforeEach(() => {
      queueProviderMock = {
        getDailyMaintenanceQueue: jest.fn().mockReturnValue(null),
        getNotificationQueue: jest.fn().mockReturnValue(null),
        getReconciliationQueue: jest.fn().mockReturnValue(null),
      } as any;

      service = new BullBoardService(queueProviderMock);
    });

    it('should initialize cleanly in fallback mode when Redis queues are not available', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });

    it('should return a valid Express router instance', () => {
      service.onModuleInit();
      const router = service.getRouter();

      expect(router).toBeDefined();
      expect(typeof router).toBe('function'); // Express router is a middleware function
    });

    it('should bind active BullMQ queues when available', () => {
      // Mock BullMQ Queue with metaValues expected by BullMQAdapter
      const fakeQueue: any = {
        name: 'test-queue',
        metaValues: { version: 'bullmq-5.0.0' },
        opts: { connection: {} },
        qualifiedName: 'bull:test-queue',
        client: Promise.resolve({}),
        toKey: (str: string) => `bull:test-queue:${str}`,
        on: jest.fn(),
      };

      queueProviderMock.getDailyMaintenanceQueue.mockReturnValue(fakeQueue);
      queueProviderMock.getNotificationQueue.mockReturnValue(fakeQueue);
      queueProviderMock.getReconciliationQueue.mockReturnValue(fakeQueue);

      expect(() => service.onModuleInit()).not.toThrow();
      expect(service.getRouter()).toBeDefined();
    });
  });
});
