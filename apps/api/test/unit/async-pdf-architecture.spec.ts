import { BadRequestException, ForbiddenException, HttpStatus, NotFoundException } from '@nestjs/common';
import { AuctionStatus, DueStatus, PaymentStatus, Role } from '@prisma/client';
import type { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import {
  DAILY_MAINTENANCE_QUEUE,
  JOB_GENERATE_STATUTORY_PDF,
} from '../../src/jobs/constants/queue-names.constant';
import { BullMqQueueProvider } from '../../src/jobs/providers/bullmq-queue.provider';
import { RedisConnectionProvider } from '../../src/jobs/providers/redis-connection.provider';
import { PdfController } from '../../src/pdf/pdf.controller';
import {
  AsyncPdfJobPayload,
  AsyncPdfStatusResponse,
  PdfService,
} from '../../src/pdf/pdf.service';
import { FormXxiPassbookTemplate } from '../../src/pdf/templates/form-xxi-passbook.template';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/storage/storage.service';

describe('Issue 10 (P2: PERF-01) - Asynchronous Statutory PDF Architecture Suite', () => {
  let pdfService: PdfService;
  let pdfController: PdfController;
  let prismaMock: any;
  let storageMock: any;
  let redisProviderMock: any;
  let redisClientMock: any;
  let bullMqProviderMock: any;

  const superAdminUser: JwtPayload = {
    sub: 'usr-admin-01',
    phone: '9842100001',
    roles: [Role.SUPER_ADMIN],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const partnerUser: JwtPayload = {
    sub: 'usr-partner-01',
    phone: '9842100002',
    roles: [Role.PARTNER],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const branchManagerUser: JwtPayload = {
    sub: 'usr-bm-01',
    phone: '9842100003',
    roles: [Role.BRANCH_MANAGER],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const collectionAgentUser: JwtPayload = {
    sub: 'usr-agent-01',
    phone: '9842100004',
    roles: [Role.COLLECTION_AGENT],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const customerUser: JwtPayload = {
    sub: 'usr-cust-01',
    phone: '9842143210',
    roles: [Role.CUSTOMER],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const buildPassbookTicketFixture = (overrides: Partial<any> = {}) => ({
    id: 'tkt-test-01',
    ticketNumber: 1,
    isPrized: false,
    chitGroup: {
      id: 'group-prd-01',
      groupCode: 'KCA-1L-20M-01',
      groupName: 'KCA 1 Lakh 20 Months',
      chitValue: 100000n,
      durationMonths: 20,
      baseInstallment: 5000n,
      branchId: 'branch-PRD',
      branch: { code: 'PRD', address: '123 Main Road, Perundurai' },
    },
    customer: {
      id: 'cust-01',
      customerCode: 'CUST-001',
      fullName: 'S. Sundaram',
      fullNameTamil: 'சுந்தரம்',
      phone: '9842143210',
      addressLine1: '14, Netaji Road',
      city: 'Perundurai',
    },
    dues: [
      {
        id: 'due-01',
        installmentMonth: 1,
        dueDate: new Date('2026-01-10'),
        grossAmount: 5000n,
        dividendDeduction: 0n,
        netPayableAmount: 5000n,
        paidAmount: 5000n,
        status: DueStatus.PAID,
        allocations: [
          {
            payment: {
              paymentStatus: PaymentStatus.SUCCESS,
              createdAt: new Date('2026-01-05'),
              receipt: { receiptNumber: 'KC-REC-PRD-2026-00001' },
            },
          },
        ],
      },
      {
        id: 'due-02',
        installmentMonth: 2,
        dueDate: new Date('2026-02-10'),
        grossAmount: 5000n,
        dividendDeduction: 1000n,
        netPayableAmount: 4000n,
        paidAmount: 0n,
        status: DueStatus.OVERDUE,
        allocations: [],
      },
    ],
    winningAuction: null,
    ...overrides,
  });

  beforeEach(() => {
    prismaMock = {
      subscriberTicket: {
        findUnique: jest.fn(),
      },
      auction: {
        findUnique: jest.fn(),
      },
      auctionWinner: {
        findUnique: jest.fn(),
      },
      payment: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    storageMock = {
      uploadFile: jest.fn().mockImplementation(async (key: string, buffer: Buffer, mimeType = 'application/pdf') => ({
        key,
        url: `/api/v1/storage/file/${key}`,
        sizeBytes: buffer?.length ?? 1024,
        mimeType,
      })),
      getFile: jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF-1.4 test-pdf-bytes'),
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      }),
      getPresignedUrl: jest.fn().mockResolvedValue('https://storage.kumaranfinance.in/signed-url?exp=900'),
    };

    redisClientMock = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    redisProviderMock = {
      getClient: jest.fn().mockReturnValue(redisClientMock),
      getIsConnected: jest.fn().mockReturnValue(true),
    };

    bullMqProviderMock = {
      addJob: jest.fn().mockResolvedValue({ jobId: 'mock-bullmq-job-id', status: 'ENQUEUED' }),
    };

    pdfService = new PdfService(
      prismaMock as unknown as PrismaService,
      storageMock as unknown as StorageService,
      bullMqProviderMock as unknown as BullMqQueueProvider,
      redisProviderMock as unknown as RedisConnectionProvider,
    );

    pdfController = new PdfController(pdfService);
  });

  describe('1. enqueueAsyncPdfGeneration', () => {
    it('writes QUEUED status to Redis, enqueues JOB_GENERATE_STATUTORY_PDF to BullMQ DAILY_MAINTENANCE_QUEUE, and returns { jobId, status: "QUEUED", checkStatusUrl }', async () => {
      const res = await pdfService.enqueueAsyncPdfGeneration(
        'PASSBOOK',
        'tkt-test-01',
        superAdminUser,
      );

      // Verify returned payload
      expect(res).toBeDefined();
      expect(res.jobId).toBeDefined();
      expect(typeof res.jobId).toBe('string');
      expect(res.status).toBe('QUEUED');
      expect(res.checkStatusUrl).toBe(`/api/v1/pdf/async/status/${res.jobId}`);

      // Verify Redis status persistence (TTL 3600s)
      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      const [redisKey, redisVal, exMode, ttlSec] = redisClientMock.set.mock.calls[0];
      expect(redisKey).toBe(`pdf:status:${res.jobId}`);
      expect(exMode).toBe('EX');
      expect(ttlSec).toBe(3600);

      const parsedRedisData = JSON.parse(redisVal);
      expect(parsedRedisData.jobId).toBe(res.jobId);
      expect(parsedRedisData.status).toBe('QUEUED');
      expect(parsedRedisData.type).toBe('PASSBOOK');
      expect(parsedRedisData.entityId).toBe('tkt-test-01');
      expect(parsedRedisData.queuedAt).toBeDefined();

      // Verify BullMQ queue dispatch to DAILY_MAINTENANCE_QUEUE
      expect(bullMqProviderMock.addJob).toHaveBeenCalledTimes(1);
      expect(bullMqProviderMock.addJob).toHaveBeenCalledWith(
        DAILY_MAINTENANCE_QUEUE,
        JOB_GENERATE_STATUTORY_PDF,
        expect.objectContaining({
          jobId: res.jobId,
          type: 'PASSBOOK',
          entityId: 'tkt-test-01',
          currentUser: superAdminUser,
        }),
        { jobId: res.jobId },
      );
    });

    it('enforces pre-lookup caller eligibility and anti-oracle guards before enqueuing to BullMQ or Redis', async () => {
      // COLLECTION_AGENT is forbidden from accessing passbook statements
      await expect(
        pdfService.enqueueAsyncPdfGeneration(
          'PASSBOOK',
          'tkt-test-01',
          collectionAgentUser,
        ),
      ).rejects.toThrow(ForbiddenException);

      // Verify zero Redis writes and zero BullMQ dispatches on rejected caller
      expect(redisClientMock.set).not.toHaveBeenCalled();
      expect(bullMqProviderMock.addJob).not.toHaveBeenCalled();

      // User with empty roles array is forbidden
      const emptyRoleUser: JwtPayload = {
        sub: 'usr-bad',
        phone: '9842100000',
        roles: [],
        branchId: 'branch-PRD',
        tokenType: 'access',
      };
      await expect(
        pdfService.enqueueAsyncPdfGeneration('PASSBOOK', 'tkt-test-01', emptyRoleUser),
      ).rejects.toThrow(ForbiddenException);

      // Branch Manager without branchId is rejected
      const bmNoBranch: JwtPayload = {
        sub: 'usr-bm-nobranch',
        phone: '9842100009',
        roles: [Role.BRANCH_MANAGER],
        branchId: '   ',
        tokenType: 'access',
      };
      await expect(
        pdfService.enqueueAsyncPdfGeneration('PASSBOOK', 'tkt-test-01', bmNoBranch),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows statutory partner, accountant, auditor, branch manager, and customer roles to enqueue async passbook generation', async () => {
      const accountantUser: JwtPayload = {
        sub: 'usr-acct-01',
        phone: '9842100005',
        roles: [Role.ACCOUNTANT],
        branchId: 'branch-PRD',
        tokenType: 'access',
      };
      const auditorUser: JwtPayload = {
        sub: 'usr-audit-01',
        phone: '9842100006',
        roles: [Role.AUDITOR],
        branchId: 'branch-PRD',
        tokenType: 'access',
      };

      for (const user of [partnerUser, accountantUser, auditorUser, branchManagerUser, customerUser]) {
        const res = await pdfService.enqueueAsyncPdfGeneration('PASSBOOK', 'tkt-test-01', user);
        expect(res.status).toBe('QUEUED');
      }
    });
  });

  describe('2. processAsyncPdfJob', () => {
    it('compiles the PDF via FormXxiPassbookTemplate, uploads to storage, and writes COMPLETED status with presignedUrl and key to Redis with 3600s TTL', async () => {
      const ticketFixture = buildPassbookTicketFixture();
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(ticketFixture);

      const templateSpy = jest.spyOn(FormXxiPassbookTemplate, 'generate');

      const jobPayload: AsyncPdfJobPayload = {
        jobId: 'job-passbook-uuid-1',
        type: 'PASSBOOK',
        entityId: 'tkt-test-01',
        currentUser: superAdminUser,
        queuedAt: new Date().toISOString(),
      };

      const result = await pdfService.processAsyncPdfJob(jobPayload);

      // Verify FormXxiPassbookTemplate was invoked with required continuous ledger breakdown
      expect(templateSpy).toHaveBeenCalledTimes(1);
      expect(templateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          groupCode: 'KCA-1L-20M-01',
          ticketNumber: 1,
          customerName: 'S. Sundaram',
          customerNameTamil: 'சுந்தரம்',
          chitValue: 100000n,
          baseInstallment: 5000n,
          totalGrossDue: 10000n,
          totalDividendCredit: 1000n,
          totalNetPayable: 9000n,
          totalPaid: 5000n,
          totalOutstandingArrears: 4000n,
        }),
      );

      // Verify storage upload & presigned URL resolution
      expect(storageMock.uploadFile).toHaveBeenCalledWith(
        'passbooks/group-prd-01/ticket-1.pdf',
        expect.any(Buffer),
        'application/pdf',
      );
      expect(storageMock.getPresignedUrl).toHaveBeenCalledWith(
        'passbooks/group-prd-01/ticket-1.pdf',
        900,
      );

      // Verify completed response
      expect(result).toEqual({
        jobId: 'job-passbook-uuid-1',
        status: 'COMPLETED',
        key: 'passbooks/group-prd-01/ticket-1.pdf',
        presignedUrl: 'https://storage.kumaranfinance.in/signed-url?exp=900',
        expiresInSeconds: 900,
        completedAt: expect.any(String),
      });

      // Verify COMPLETED status written to Redis with 3600s TTL
      expect(redisClientMock.set).toHaveBeenCalledWith(
        'pdf:status:job-passbook-uuid-1',
        expect.stringContaining('"status":"COMPLETED"'),
        'EX',
        3600,
      );

      templateSpy.mockRestore();
    });

    it('supports alternative statutory type aliases (FORM_XXI, MINUTES, FORM_XVII, RECEIPT, VOUCHER)', async () => {
      // 1. FORM_XXI alias for passbook
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(buildPassbookTicketFixture());
      const resPassbook = await pdfService.processAsyncPdfJob({
        jobId: 'job-alias-xx1',
        type: 'FORM_XXI',
        entityId: 'tkt-test-01',
        currentUser: superAdminUser,
      });
      expect(resPassbook.status).toBe('COMPLETED');
      expect(resPassbook.key).toBe('passbooks/group-prd-01/ticket-1.pdf');

      // 2. MINUTES / FORM_XVII for statutory auction minutes
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-01',
        status: AuctionStatus.COMPLETED,
        installmentMonth: 4,
        auctionDate: new Date('2026-04-15'),
        bidDiscount: 25000n,
        prizeMoney: 75000n,
        foremanCommissionRate: '4.00',
        foremanCommissionAmount: 4000n,
        totalDividend: 21000n,
        dividendPerTicket: 1050n,
        chitGroup: {
          id: 'group-prd-01',
          groupCode: 'KCA-1L-20M-01',
          groupName: 'KCA 1 Lakh 20 Months',
          chitValue: 100000n,
          durationMonths: 20,
          baseInstallment: 5000n,
          branchId: 'branch-PRD',
          branch: { code: 'PRD', address: '123 Main Road, Perundurai' },
        },
        winner: {
          wasTieBreakWinner: false,
          ticket: {
            ticketNumber: 4,
            customer: {
              customerCode: 'CUST-004',
              fullName: 'K. Palanisamy',
              fullNameTamil: 'பழனிசாமி',
              phone: '9842100044',
            },
          },
        },
        tieBidders: [],
        minutes: { subscribersPresent: 18, minutesText: 'Conducted peacefully', signedByForeman: true },
      });

      const resMinutes = await pdfService.processAsyncPdfJob({
        jobId: 'job-minutes-01',
        type: 'MINUTES',
        entityId: 'auc-01',
        currentUser: superAdminUser,
      });
      expect(resMinutes.status).toBe('COMPLETED');
      expect(resMinutes.key).toBe('minutes/group-prd-01/month-4.pdf');
    });

    it('persists FAILED status with error details to Redis and rethrows when rendering or storage fails', async () => {
      // Mock ticket not found error
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(null);

      const jobPayload: AsyncPdfJobPayload = {
        jobId: 'job-fail-01',
        type: 'PASSBOOK',
        entityId: 'tkt-nonexistent',
        currentUser: superAdminUser,
      };

      await expect(pdfService.processAsyncPdfJob(jobPayload)).rejects.toThrow(NotFoundException);

      // Assert FAILED status written to Redis with 3600s TTL
      expect(redisClientMock.set).toHaveBeenCalledWith(
        'pdf:status:job-fail-01',
        expect.stringMatching(/"status":"FAILED".*"Subscriber ticket not found"/),
        'EX',
        3600,
      );
    });

    it('rejects unsupported PDF generation type, writes FAILED status to Redis, and throws BadRequestException', async () => {
      const jobPayload: AsyncPdfJobPayload = {
        jobId: 'job-invalid-type',
        type: 'UNKNOWN_AUDIT_REPORT',
        entityId: 'ent-01',
        currentUser: superAdminUser,
      };

      await expect(pdfService.processAsyncPdfJob(jobPayload)).rejects.toThrow(
        BadRequestException,
      );

      expect(redisClientMock.set).toHaveBeenCalledWith(
        'pdf:status:job-invalid-type',
        expect.stringContaining('"status":"FAILED"'),
        'EX',
        3600,
      );
    });
  });

  describe('3. getAsyncPdfStatus', () => {
    it('retrieves the status from Redis when present', async () => {
      const mockSavedStatus: AsyncPdfStatusResponse = {
        jobId: 'job-redis-ok-01',
        status: 'COMPLETED',
        key: 'passbooks/group-prd-01/ticket-1.pdf',
        presignedUrl: 'https://storage.kumaranfinance.in/signed-url?exp=900',
        expiresInSeconds: 900,
        completedAt: '2026-11-20T10:00:00.000Z',
      };
      redisClientMock.get.mockResolvedValue(JSON.stringify(mockSavedStatus));

      const status = await pdfService.getAsyncPdfStatus('job-redis-ok-01');

      expect(redisClientMock.get).toHaveBeenCalledWith('pdf:status:job-redis-ok-01');
      expect(status).toEqual(mockSavedStatus);
    });

    it('throws NotFoundException (404) if job is not found or expired in Redis and in-memory cache', async () => {
      redisClientMock.get.mockResolvedValue(null);

      await expect(
        pdfService.getAsyncPdfStatus('non-existent-job-uuid'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        pdfService.getAsyncPdfStatus('non-existent-job-uuid'),
      ).rejects.toThrow('PDF generation job non-existent-job-uuid not found or expired');
    });

    it('falls back seamlessly to in-memory status cache when Redis read throws an error', async () => {
      // 1. Enqueue job (populates both Redis and inMemoryStatusCache)
      const enqueued = await pdfService.enqueueAsyncPdfGeneration(
        'PASSBOOK',
        'tkt-test-01',
        superAdminUser,
      );

      // 2. Simulate Redis connection failure on get
      redisClientMock.get.mockRejectedValue(new Error('Redis connection reset by peer'));

      // 3. Status query must NOT crash and must return cached status
      const status = await pdfService.getAsyncPdfStatus(enqueued.jobId);
      expect(status).toBeDefined();
      expect(status.jobId).toBe(enqueued.jobId);
      expect(status.status).toBe('QUEUED');
    });
  });

  describe('4. Fallback Execution (Redis / BullMQ Outage Resilience)', () => {
    it('operates direct in-process compilation when BullMQ provider is absent or null', async () => {
      const offlineBullMqService = new PdfService(
        prismaMock as unknown as PrismaService,
        storageMock as unknown as StorageService,
        undefined, // BullMQ provider absent
        redisProviderMock as unknown as RedisConnectionProvider,
      );

      prismaMock.subscriberTicket.findUnique.mockResolvedValue(buildPassbookTicketFixture());

      const res = await offlineBullMqService.enqueueAsyncPdfGeneration(
        'PASSBOOK',
        'tkt-test-01',
        superAdminUser,
      );

      expect(res.jobId).toBeDefined();
      // Direct in-process fallback executed synchronously, resulting in COMPLETED
      expect(res.status).toBe('COMPLETED');
      expect(res.checkStatusUrl).toBe(`/api/v1/pdf/async/status/${res.jobId}`);

      const status = await offlineBullMqService.getAsyncPdfStatus(res.jobId);
      expect(status.status).toBe('COMPLETED');
      expect(status.key).toBe('passbooks/group-prd-01/ticket-1.pdf');
    });

    it('operates direct in-process status cache when Redis provider is offline or absent', async () => {
      const offlineRedisProvider = {
        getClient: jest.fn().mockReturnValue(null),
        getIsConnected: jest.fn().mockReturnValue(false),
      };

      const offlineService = new PdfService(
        prismaMock as unknown as PrismaService,
        storageMock as unknown as StorageService,
        bullMqProviderMock as unknown as BullMqQueueProvider,
        offlineRedisProvider as unknown as RedisConnectionProvider,
      );

      const res = await offlineService.enqueueAsyncPdfGeneration(
        'PASSBOOK',
        'tkt-test-01',
        superAdminUser,
      );

      expect(res.jobId).toBeDefined();
      expect(res.status).toBe('QUEUED');

      // Can retrieve status from in-memory cache with zero Redis interaction
      const status = await offlineService.getAsyncPdfStatus(res.jobId);
      expect(status.jobId).toBe(res.jobId);
      expect(status.status).toBe('QUEUED');
    });

    it('BullMqQueueProvider.addJob delegates JOB_GENERATE_STATUTORY_PDF to pdfService.processAsyncPdfJob when Redis is offline', async () => {
      const mockPdfService = {
        processAsyncPdfJob: jest.fn().mockResolvedValue({
          jobId: 'job-direct-01',
          status: 'COMPLETED',
        }),
      };

      const offlineQueueProvider = new BullMqQueueProvider(
        { getClient: () => null, getIsConnected: () => false } as any,
        {} as any,
        {} as any,
        {} as any,
        undefined,
        mockPdfService as any,
      );

      const jobData = {
        jobId: 'job-direct-01',
        type: 'PASSBOOK',
        entityId: 'tkt-01',
        currentUser: superAdminUser,
      };

      const result = await offlineQueueProvider.addJob(
        DAILY_MAINTENANCE_QUEUE,
        JOB_GENERATE_STATUTORY_PDF,
        jobData,
        { jobId: 'job-direct-01' },
      );

      expect(result.status).toBe('EXECUTED_DIRECT');
      expect(mockPdfService.processAsyncPdfJob).toHaveBeenCalledWith(jobData);
    });

    it('BullMqQueueProvider maintenanceWorker processor dispatches JOB_GENERATE_STATUTORY_PDF', async () => {
      const mockPdfService = {
        processAsyncPdfJob: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
      };

      const workerHandlers: Record<string, (job: any) => Promise<any>> = {};
      const mockWorkerFactory = jest.fn((queueName, handler) => {
        workerHandlers[queueName] = handler;
        return { on: jest.fn() };
      });

      const queueProviderWithWorker = new BullMqQueueProvider(
        {
          getClient: () => ({ on: jest.fn() }),
          getIsConnected: () => true,
        } as any,
        {} as any,
        {} as any,
        {} as any,
        undefined,
        mockPdfService as any,
      );

      (queueProviderWithWorker as any).createManagedQueue = jest.fn().mockReturnValue({ on: jest.fn() });
      (queueProviderWithWorker as any).createManagedWorker = mockWorkerFactory;
      (queueProviderWithWorker as any).registerRepeatableJobs = jest.fn().mockResolvedValue(undefined);

      await queueProviderWithWorker.onModuleInit();

      const maintenanceHandler = workerHandlers[DAILY_MAINTENANCE_QUEUE];
      expect(maintenanceHandler).toBeDefined();

      const mockJob = {
        name: JOB_GENERATE_STATUTORY_PDF,
        data: {
          jobId: 'job-worker-01',
          type: 'PASSBOOK',
          entityId: 'tkt-01',
        },
      };

      await maintenanceHandler(mockJob);
      expect(mockPdfService.processAsyncPdfJob).toHaveBeenCalledWith(mockJob.data);
    });
  });

  describe('5. PdfController Endpoints', () => {
    it('POST /pdf/async/passbook/:ticketId returns HTTP 202 and delegates to enqueueAsyncPdfGeneration', async () => {
      const enqueueSpy = jest.spyOn(pdfService, 'enqueueAsyncPdfGeneration').mockResolvedValue({
        jobId: 'job-ctrl-202',
        status: 'QUEUED',
        checkStatusUrl: '/api/v1/pdf/async/status/job-ctrl-202',
      });

      const response = await pdfController.enqueuePassbookPdf(
        'tkt-ctrl-01',
        superAdminUser,
      );

      expect(enqueueSpy).toHaveBeenCalledWith('PASSBOOK', 'tkt-ctrl-01', superAdminUser);
      expect(response).toEqual({
        jobId: 'job-ctrl-202',
        status: 'QUEUED',
        checkStatusUrl: '/api/v1/pdf/async/status/job-ctrl-202',
      });

      // Verify HTTP 202 metadata
      const httpCodeMetadata = Reflect.getMetadata('__httpCode__', pdfController.enqueuePassbookPdf);
      expect(httpCodeMetadata).toBe(HttpStatus.ACCEPTED);

      enqueueSpy.mockRestore();
    });

    it('GET /pdf/async/status/:jobId returns the status payload from getAsyncPdfStatus', async () => {
      const mockStatus: AsyncPdfStatusResponse = {
        jobId: 'job-ctrl-status-01',
        status: 'COMPLETED',
        key: 'passbooks/group-prd-01/ticket-1.pdf',
        presignedUrl: 'https://storage.kumaranfinance.in/signed-url?exp=900',
        expiresInSeconds: 900,
        completedAt: '2026-11-20T10:00:00.000Z',
      };

      const getStatusSpy = jest.spyOn(pdfService, 'getAsyncPdfStatus').mockResolvedValue(mockStatus);

      const response = await pdfController.getAsyncPdfStatus('job-ctrl-status-01');

      expect(getStatusSpy).toHaveBeenCalledWith('job-ctrl-status-01');
      expect(response).toEqual(mockStatus);

      getStatusSpy.mockRestore();
    });

    it('GET /pdf/async/status/:jobId propagates NotFoundException (404) when job is expired or unknown', async () => {
      const getStatusSpy = jest
        .spyOn(pdfService, 'getAsyncPdfStatus')
        .mockRejectedValue(new NotFoundException('PDF generation job unknown-job not found or expired'));

      await expect(
        pdfController.getAsyncPdfStatus('unknown-job'),
      ).rejects.toThrow(NotFoundException);

      getStatusSpy.mockRestore();
    });
  });
});
