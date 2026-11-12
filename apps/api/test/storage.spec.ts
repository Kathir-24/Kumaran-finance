import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import type { JwtPayload } from '../src/auth/interfaces/jwt-payload.interface';
import { AwsS3StorageDriver, S3StorageDriver } from '../src/storage/drivers/aws-s3-storage.driver';
import { LocalStorageDriver } from '../src/storage/drivers/local-storage.driver';
import { DocumentAccessHelper } from '../src/storage/helpers/document-access.helper';
import { StorageKeyHelper } from '../src/storage/helpers/storage-key.helper';
import { StorageController } from '../src/storage/storage.controller';
import { StorageService } from '../src/storage/storage.service';

describe('Component 1: Encrypted Storage Service Tests', () => {
  const testStorageDir = './storage/test-uploads';
  const resolvedTestDir = path.resolve(process.cwd(), testStorageDir);

  afterAll(() => {
    // Clean up test upload directory
    if (fs.existsSync(resolvedTestDir)) {
      fs.rmSync(resolvedTestDir, { recursive: true, force: true });
    }
  });

  describe('1. StorageKeyHelper & Path Traversal Guards', () => {
    it('should sanitize keys and normalize backslashes', () => {
      const sanitized = StorageKeyHelper.sanitizeKey('receipts\\PRD\\2026\\rec-01.pdf');
      expect(sanitized).toBe('receipts/PRD/2026/rec-01.pdf');
    });

    it('should throw BadRequestException on path traversal attempt with ".."', () => {
      expect(() => {
        StorageKeyHelper.sanitizeKey('../../../etc/passwd');
      }).toThrow(BadRequestException);

      expect(() => {
        StorageKeyHelper.sanitizeKey('kyc/../../secrets.env');
      }).toThrow(BadRequestException);
    });

    it('should generate valid KYC document keys', () => {
      const key = StorageKeyHelper.kycDocument('cust-001', 'AADHAAR_FRONT', 'jpg');
      expect(key).toMatch(/^kyc\/cust-001\/AADHAAR_FRONT-[a-f0-9]+\.jpg$/);
    });

    it('should generate valid subscription receipt keys', () => {
      const key = StorageKeyHelper.receiptPdf('PRD', 2026, 'KC-REC-PRD-2026-00045');
      expect(key).toBe('receipts/PRD/2026/KC-REC-PRD-2026-00045.pdf');
    });

    it('should generate valid prize payout voucher keys', () => {
      const key = StorageKeyHelper.voucherPdf('PRD', 2026, 'KC-VOU-PRD-2026-00012');
      expect(key).toBe('vouchers/PRD/2026/KC-VOU-PRD-2026-00012.pdf');
    });

    it('should generate valid safety proof attachment keys', () => {
      const key = StorageKeyHelper.safetyProofDoc('auc-001', 'sbi_cheque_001.pdf');
      expect(key).toMatch(/^safety-proof\/auc-001\/[a-f0-9]+-sbi_cheque_001\.pdf$/);
    });

    it('should generate valid Form XVII statutory auction minutes keys', () => {
      const key = StorageKeyHelper.auctionMinutesPdf('chit-001', 4);
      expect(key).toBe('minutes/chit-001/month-4.pdf');
    });

    it('N4: should normalize and defend receipt/voucher branch codes against casing and path traversal', () => {
      expect(StorageKeyHelper.receiptPdf('prd', 2026, 'KC-REC-01')).toBe(
        'receipts/PRD/2026/KC-REC-01.pdf',
      );
      expect(StorageKeyHelper.voucherPdf('  cbe_1 ', 2026, 'KC-VOU-01')).toBe(
        'vouchers/CBE_1/2026/KC-VOU-01.pdf',
      );
      expect(StorageKeyHelper.receiptPdf('../erd', 2026, 'KC-REC-02')).toBe(
        'receipts/ERD/2026/KC-REC-02.pdf',
      );
      expect(StorageKeyHelper.voucherPdf('///..', 2026, 'KC-VOU-02')).toBe(
        'vouchers/PRD/2026/KC-VOU-02.pdf',
      );
      expect(StorageKeyHelper.receiptPdf('', 2026, 'KC-REC-03')).toBe(
        'receipts/PRD/2026/KC-REC-03.pdf',
      );
    });
  });

  describe('2. LocalStorageDriver (Developer Machine Fallback)', () => {
    let driver: LocalStorageDriver;

    beforeEach(() => {
      driver = new LocalStorageDriver(testStorageDir);
    });

    it('should write buffer to disk and return local access URL', async () => {
      const testBuffer = Buffer.from('PDF_SAMPLE_CONTENT_KC_RECEIPT');
      const key = 'receipts/PRD/2026/test-rec.pdf';

      const result = await driver.upload(key, testBuffer, 'application/pdf');

      expect(result.key).toBe(key);
      expect(result.url).toBe(`/api/v1/storage/file/${key}`);
      expect(result.sizeBytes).toBe(testBuffer.length);
      expect(result.mimeType).toBe('application/pdf');

      const exists = await driver.exists(key);
      expect(exists).toBe(true);
    });

    it('should retrieve stored file content with correct mime type', async () => {
      const testBuffer = Buffer.from('KYC_AADHAAR_IMAGE_BYTES');
      const key = 'kyc/cust-001/aadhaar.jpg';

      await driver.upload(key, testBuffer, 'image/jpeg');

      const downloaded = await driver.get(key);
      expect(downloaded.buffer.toString()).toBe('KYC_AADHAAR_IMAGE_BYTES');
      expect(downloaded.mimeType).toBe('image/jpeg');
      expect(downloaded.sizeBytes).toBe(testBuffer.length);
    });

    it('N5: should roundtrip receipt and voucher keys built with non-PRD branch codes on disk', async () => {
      const receiptKey = StorageKeyHelper.receiptPdf('ERD', 2026, 'KC-REC-ERD-2026-00001');
      const voucherKey = StorageKeyHelper.voucherPdf('ERD', 2026, 'KC-VOU-ERD-2026-00001');
      const receiptBytes = Buffer.from('%PDF-1.4-ERD-RECEIPT');
      const voucherBytes = Buffer.from('%PDF-1.4-ERD-VOUCHER');

      await driver.upload(receiptKey, receiptBytes, 'application/pdf');
      await driver.upload(voucherKey, voucherBytes, 'application/pdf');

      const downloadedReceipt = await driver.get(receiptKey);
      const downloadedVoucher = await driver.get(voucherKey);

      expect(downloadedReceipt.buffer.toString()).toBe('%PDF-1.4-ERD-RECEIPT');
      expect(downloadedVoucher.buffer.toString()).toBe('%PDF-1.4-ERD-VOUCHER');
    });

    it('should return local streaming URL for presigned access', async () => {
      const testBuffer = Buffer.from('VOUCHER_CONTENT');
      const key = 'vouchers/PRD/2026/test-vou.pdf';

      await driver.upload(key, testBuffer, 'application/pdf');
      const url = await driver.getPresignedUrl(key, 900);

      expect(url).toBe(`/api/v1/storage/file/${key}`);
    });

    it('should return local upload URL for presigned upload access', async () => {
      const uploadUrl = await driver.getPresignedUploadUrl(
        'kyc/cust-001/doc.jpg',
        'image/jpeg',
        300,
      );
      expect(uploadUrl).toBe('/api/v1/storage/upload/kyc/cust-001/doc.jpg');
    });

    it('should throw NotFoundException when getting a non-existent file', async () => {
      await expect(driver.get('non-existent/file.pdf')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete a stored file and update exists status', async () => {
      const key = 'temp/delete-me.txt';
      await driver.upload(key, Buffer.from('DELETE_ME'), 'text/plain');

      expect(await driver.exists(key)).toBe(true);
      await driver.delete(key);
      expect(await driver.exists(key)).toBe(false);
    });
  });

  describe('3. S3StorageDriver & AwsS3StorageDriver (S3 SDK Mocked Verification)', () => {
    let s3Driver: S3StorageDriver;
    let mockSend: jest.Mock;

    it('should export AwsS3StorageDriver as exact backward-compatible alias of S3StorageDriver', () => {
      expect(AwsS3StorageDriver).toBe(S3StorageDriver);
    });

    beforeEach(() => {
      mockSend = jest.fn();
      s3Driver = new S3StorageDriver({
        region: 'ap-south-1',
        bucket: 'kumaran-chits-private-storage',
        accessKeyId: 'MOCK_KEY_ID',
        secretAccessKey: 'MOCK_SECRET_KEY',
      });

      // Inject mock send function into underlying S3Client
      (s3Driver as any).s3Client.send = mockSend;
    });

    it('should upload object with ServerSideEncryption: AES256', async () => {
      mockSend.mockResolvedValue({});
      const testBuffer = Buffer.from('SECURE_RECEIPT_PDF');

      const result = await s3Driver.upload(
        'receipts/PRD/2026/KC-REC-001.pdf',
        testBuffer,
        'application/pdf',
      );

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'kumaran-chits-private-storage',
            Key: 'receipts/PRD/2026/KC-REC-001.pdf',
            ServerSideEncryption: 'AES256',
            ContentType: 'application/pdf',
          }),
        }),
      );
      expect(result.key).toBe('receipts/PRD/2026/KC-REC-001.pdf');
    });

    it('should delete object from S3 bucket', async () => {
      mockSend.mockResolvedValue({});

      await s3Driver.delete('kyc/cust-001/doc.jpg');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'kumaran-chits-private-storage',
            Key: 'kyc/cust-001/doc.jpg',
          }),
        }),
      );
    });

    it('should verify object existence via HeadObjectCommand', async () => {
      mockSend.mockResolvedValue({});
      const exists = await s3Driver.exists('receipts/PRD/2026/KC-REC-001.pdf');
      expect(exists).toBe(true);

      mockSend.mockRejectedValue({ name: 'NotFound', $metadata: { httpStatusCode: 404 } });
      const notExists = await s3Driver.exists('missing.pdf');
      expect(notExists).toBe(false);
    });

    it('should generate a presigned PUT upload URL with 5-minute expiry', async () => {
      const uploadUrl = await s3Driver.getPresignedUploadUrl(
        'kyc/cust-001/doc.jpg',
        'image/jpeg',
        300,
      );
      expect(uploadUrl).toBeDefined();
      expect(typeof uploadUrl).toBe('string');
      expect(uploadUrl).toContain('kumaran-chits-private-storage');
    });
  });

  describe('4. StorageService Dual-Driver Orchestration', () => {
    it('should default to LocalStorageDriver when STORAGE_DRIVER is local', () => {
      const configMock = {
        get: jest.fn((key: string) => {
          if (key === 'STORAGE_DRIVER') return 'local';
          if (key === 'LOCAL_STORAGE_PATH') return testStorageDir;
          return null;
        }),
      } as unknown as ConfigService;

      const service = new StorageService(configMock);
      expect(service.getActiveDriverName()).toBe('local');
    });

    it('should delegate getPresignedUploadUrl to the active driver', async () => {
      const configMock = {
        get: jest.fn((key: string) => {
          if (key === 'STORAGE_DRIVER') return 'local';
          if (key === 'LOCAL_STORAGE_PATH') return testStorageDir;
          return null;
        }),
      } as unknown as ConfigService;

      const service = new StorageService(configMock);
      const uploadUrl = await service.getPresignedUploadUrl('kyc/cust-001/doc.jpg', 'image/jpeg', 300);
      expect(uploadUrl).toBe('/api/v1/storage/upload/kyc/cust-001/doc.jpg');
    });

    it('should switch to S3 driver when provider-agnostic S3_* credentials are configured', () => {
      const configMock = {
        get: jest.fn((key: string) => {
          if (key === 'STORAGE_DRIVER') return 's3';
          if (key === 'S3_BUCKET') return 'kumaran-chits-private';
          if (key === 'S3_ACCESS_KEY_ID') return 'sample-access-key';
          if (key === 'S3_SECRET_ACCESS_KEY') return 'sample-secret-key';
          if (key === 'S3_REGION') return 'ap-south-1';
          return null;
        }),
      } as unknown as ConfigService;

      const service = new StorageService(configMock);
      expect(service.getActiveDriverName()).toBe('s3');
    });

    it('should switch to S3 driver for Cloudflare R2 / S3-compatible storage', () => {
      const configMock = {
        get: jest.fn((key: string) => {
          if (key === 'STORAGE_DRIVER') return 's3';
          if (key === 'S3_BUCKET') return 'kumaran-chits-r2';
          if (key === 'S3_ACCESS_KEY_ID') return 'R2_ACCESS_KEY';
          if (key === 'S3_SECRET_ACCESS_KEY') return 'R2_SECRET_KEY';
          if (key === 'S3_REGION') return 'auto';
          if (key === 'S3_ENDPOINT') return 'https://account-id.r2.cloudflarestorage.com';
          return null;
        }),
      } as unknown as ConfigService;

      const service = new StorageService(configMock);
      expect(service.getActiveDriverName()).toBe('s3');
    });

    it('should configure S3 driver with S3_ENDPOINT and S3_FORCE_PATH_STYLE for MinIO / Cloudflare / DO', () => {
      const configMock = {
        get: jest.fn((key: string) => {
          if (key === 'STORAGE_DRIVER') return 's3';
          if (key === 'S3_BUCKET') return 'kumaran-chits-private';
          if (key === 'S3_ACCESS_KEY_ID') return 'chitflow_admin';
          if (key === 'S3_SECRET_ACCESS_KEY') return 'chitflow_storage_secret';
          if (key === 'S3_REGION') return 'ap-south-1';
          if (key === 'S3_ENDPOINT') return 'http://127.0.0.1:9000';
          if (key === 'S3_FORCE_PATH_STYLE') return true;
          return null;
        }),
      } as unknown as ConfigService;

      const service = new StorageService(configMock);
      expect(service.getActiveDriverName()).toBe('s3');
    });

    it('should fall back to local driver if S3 credentials are missing', () => {
      const configMock = {
        get: jest.fn((key: string) => {
          if (key === 'STORAGE_DRIVER') return 's3';
          // Missing S3 credentials
          return null;
        }),
      } as unknown as ConfigService;

      const service = new StorageService(configMock);
      expect(service.getActiveDriverName()).toBe('local');
    });

    it('should delegate getPresignedUploadUrl to the active driver', async () => {
      const configMock = {
        get: jest.fn((key: string) => {
          if (key === 'STORAGE_DRIVER') return 'local';
          if (key === 'LOCAL_STORAGE_PATH') return testStorageDir;
          return null;
        }),
      } as unknown as ConfigService;

      const service = new StorageService(configMock);
      const uploadUrl = await service.getPresignedUploadUrl('kyc/cust-001/doc.jpg', 'image/jpeg', 300);
      expect(uploadUrl).toBe('/api/v1/storage/upload/kyc/cust-001/doc.jpg');
    });

    it('should cache generated presigned URLs in Redis and serve them without driver calls', async () => {
      const configMock = {
        get: jest.fn((key: string) => {
          if (key === 'LOCAL_STORAGE_PATH') return testStorageDir;
          return null;
        }),
      } as unknown as ConfigService;

      const redisClientMock = {
        get: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('/api/v1/storage/file/cached-doc.pdf'),
        set: jest.fn().mockResolvedValue('OK'),
        mget: jest.fn().mockResolvedValue(['/api/v1/storage/file/cached-doc.pdf', null]),
        del: jest.fn().mockResolvedValue(1),
      };

      const redisProviderMock = {
        getClient: jest.fn().mockReturnValue(redisClientMock),
        getIsConnected: jest.fn().mockReturnValue(true),
      };

      const service = new StorageService(configMock, redisProviderMock as any);

      // Upload dummy test files so LocalStorageDriver can find them
      await service.uploadFile('doc-1.pdf', Buffer.from('test doc 1'), 'application/pdf');
      await service.uploadFile('doc-2.pdf', Buffer.from('test doc 2'), 'application/pdf');

      // Call 1: Cache Miss -> calls driver, sets Redis cache with jittered TTL (600s +/- 15%)
      const url1 = await service.getPresignedUrl('doc-1.pdf', 900);
      expect(url1).toBe('/api/v1/storage/file/doc-1.pdf');
      expect(redisClientMock.set).toHaveBeenCalledWith(
        'url:presigned:doc-1.pdf',
        '/api/v1/storage/file/doc-1.pdf',
        'EX',
        expect.any(Number),
      );
      const storageTtl = redisClientMock.set.mock.calls[0][3];
      expect(storageTtl).toBeGreaterThanOrEqual(510);
      expect(storageTtl).toBeLessThanOrEqual(690);

      // Call 2: Cache Hit -> returns from Redis immediately
      const url2 = await service.getPresignedUrl('doc-1.pdf', 900);
      expect(url2).toBe('/api/v1/storage/file/cached-doc.pdf');

      // Call 3: Batch retrieval with partial cache hit
      const batchMap = await service.getBatchPresignedUrls(['doc-1.pdf', 'doc-2.pdf']);
      expect(batchMap.get('doc-1.pdf')).toBe('/api/v1/storage/file/cached-doc.pdf');
      expect(batchMap.get('doc-2.pdf')).toBe('/api/v1/storage/file/doc-2.pdf');

      // Call 4: deleteFile purges cache
      await service.deleteFile('doc-1.pdf');
      expect(redisClientMock.del).toHaveBeenCalledWith('url:presigned:doc-1.pdf');
    });
  });

  describe('6. StorageController HTTP 302 Redirect & Streaming Egress', () => {
    const adminUser: JwtPayload = {
      sub: 'usr-admin-1',
      phone: '9842100001',
      roles: [Role.SUPER_ADMIN],
      branchId: 'PRD',
      tokenType: 'access',
    };

    let mockStorageService: any;
    let controller: StorageController;
    let mockRes: any;

    beforeEach(() => {
      mockStorageService = {
        getActiveDriverName: jest.fn().mockReturnValue('local'),
        getPresignedUrl: jest.fn().mockResolvedValue('https://storage.kumaranfinance.in/signed/doc.pdf?sig=abc'),
        getFile: jest.fn().mockResolvedValue({
          buffer: Buffer.from('%PDF-1.4 file content'),
          mimeType: 'application/pdf',
          sizeBytes: 19,
        }),
      };
      controller = new StorageController(mockStorageService);
      mockRes = {
        redirect: jest.fn(),
        setHeader: jest.fn(),
        end: jest.fn(),
      };
    });

    it('should redirect with HTTP 302 when redirect=true on local storage', async () => {
      await controller.streamFile('kyc/usr-admin-1/pan.pdf', 'true', 'false', adminUser, mockRes);

      expect(mockStorageService.getPresignedUrl).toHaveBeenCalledWith('kyc/usr-admin-1/pan.pdf');
      expect(mockRes.redirect).toHaveBeenCalledWith(
        'https://storage.kumaranfinance.in/signed/doc.pdf?sig=abc',
      );
      expect(mockRes.end).not.toHaveBeenCalled();
    });

    it('should automatically redirect when active driver is s3 and stream is not true', async () => {
      mockStorageService.getActiveDriverName.mockReturnValue('s3');

      await controller.streamFile('kyc/usr-admin-1/pan.pdf', 'false', 'false', adminUser, mockRes);

      expect(mockStorageService.getPresignedUrl).toHaveBeenCalledWith('kyc/usr-admin-1/pan.pdf');
      expect(mockRes.redirect).toHaveBeenCalledWith(
        'https://storage.kumaranfinance.in/signed/doc.pdf?sig=abc',
      );
      expect(mockRes.end).not.toHaveBeenCalled();
    });

    it('should stream binary buffer directly when stream=true even if driver is s3', async () => {
      mockStorageService.getActiveDriverName.mockReturnValue('s3');

      await controller.streamFile('kyc/usr-admin-1/pan.pdf', 'false', 'true', adminUser, mockRes);

      expect(mockStorageService.getFile).toHaveBeenCalledWith('kyc/usr-admin-1/pan.pdf');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 19);
      expect(mockRes.end).toHaveBeenCalled();
      expect(mockRes.redirect).not.toHaveBeenCalled();
    });

    it('should stream binary buffer directly for local driver without redirect parameter', async () => {
      mockStorageService.getActiveDriverName.mockReturnValue('local');

      await controller.streamFile('kyc/usr-admin-1/pan.pdf', 'false', 'false', adminUser, mockRes);

      expect(mockStorageService.getFile).toHaveBeenCalledWith('kyc/usr-admin-1/pan.pdf');
      expect(mockRes.end).toHaveBeenCalled();
      expect(mockRes.redirect).not.toHaveBeenCalled();
    });
  });

  describe('7. Local Driver Fallback PUT Upload & Header Parity (DEF-FE-07)', () => {
    const adminUser: JwtPayload = {
      sub: 'usr-admin-1',
      phone: '9842100001',
      roles: [Role.SUPER_ADMIN],
      branchId: 'PRD',
      tokenType: 'access',
    };
    const accountantUser: JwtPayload = {
      sub: 'usr-acc-1',
      phone: '9842100002',
      roles: [Role.ACCOUNTANT],
      branchId: 'PRD',
      tokenType: 'access',
    };
    const customerUser: JwtPayload = {
      sub: 'cust-001',
      phone: '9842100003',
      roles: [Role.CUSTOMER],
      branchId: 'PRD',
      tokenType: 'access',
    };
    const agentUser: JwtPayload = {
      sub: 'agent-001',
      phone: '9842100004',
      roles: [Role.COLLECTION_AGENT],
      branchId: 'PRD',
      tokenType: 'access',
    };
    const auditorUser: JwtPayload = {
      sub: 'auditor-001',
      phone: '9842100005',
      roles: [Role.AUDITOR],
      branchId: 'PRD',
      tokenType: 'access',
    };

    let mockStorageService: any;
    let controller: StorageController;

    beforeEach(() => {
      mockStorageService = {
        getActiveDriverName: jest.fn().mockReturnValue('local'),
        getPresignedUploadUrl: jest
          .fn()
          .mockResolvedValue('/api/v1/storage/upload/kyc/cust-001/AADHAAR_FRONT-1234.jpg'),
        getPresignedUploadHeaders: jest.fn().mockReturnValue({ 'Content-Type': 'image/jpeg' }),
        uploadFile: jest.fn().mockResolvedValue({
          key: 'kyc/cust-001/AADHAAR_FRONT-1234.jpg',
          url: '/api/v1/storage/file/kyc/cust-001/AADHAAR_FRONT-1234.jpg',
          sizeBytes: 12,
          mimeType: 'image/jpeg',
        }),
      };
      controller = new StorageController(mockStorageService);
    });

    it('writes valid binary upload in local driver mode for authorized KYC key', async () => {
      const mockReq: any = {
        headers: { 'content-type': 'image/jpeg' },
        body: Buffer.from('jpeg-binary!'),
      };

      const res = await controller.uploadLocalFile(
        ['kyc', 'cust-001', 'AADHAAR_FRONT-1234.jpg'],
        customerUser,
        mockReq,
      );

      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        'kyc/cust-001/AADHAAR_FRONT-1234.jpg',
        expect.any(Buffer),
        'image/jpeg',
      );
      expect(res).toEqual({
        key: 'kyc/cust-001/AADHAAR_FRONT-1234.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 12,
      });
    });

    it('blocks @Put upload endpoint when active driver is s3 (enforces direct PUT)', async () => {
      mockStorageService.getActiveDriverName.mockReturnValue('s3');
      const mockReq: any = {
        headers: { 'content-type': 'image/jpeg' },
        body: Buffer.from('jpeg-binary!'),
      };

      await expect(
        controller.uploadLocalFile('kyc/cust-001/pan.jpg', adminUser, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects path traversal and unsupported prefixes on local upload', async () => {
      const mockReq: any = {
        headers: { 'content-type': 'image/jpeg' },
        body: Buffer.from('abc'),
      };

      await expect(
        controller.uploadLocalFile('kyc/../etc/passwd', adminUser, mockReq),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.uploadLocalFile('receipts/PRD/2026/REC-1.pdf', adminUser, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces ABAC role boundaries on uploads (Auditor read-only, Agent blocked from safety-proof, Customer self-only)', async () => {
      const mockReq: any = {
        headers: { 'content-type': 'application/pdf' },
        body: Buffer.from('%PDF-1.4'),
      };

      // Auditor cannot upload anything
      await expect(
        controller.uploadLocalFile('kyc/cust-001/pan.pdf', auditorUser, mockReq),
      ).rejects.toThrow(ForbiddenException);

      // Customer cannot upload to another customer's folder or safety-proof/
      await expect(
        controller.uploadLocalFile('kyc/cust-999/pan.pdf', customerUser, mockReq),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        controller.uploadLocalFile('safety-proof/auc-1/chq.pdf', customerUser, mockReq),
      ).rejects.toThrow(ForbiddenException);

      // Collection Agent can upload KYC in field, but cannot upload safety-proof
      await controller.uploadLocalFile('kyc/cust-001/pan.pdf', agentUser, mockReq);
      expect(mockStorageService.uploadFile).toHaveBeenCalled();

      await expect(
        controller.uploadLocalFile('safety-proof/auc-1/chq.pdf', agentUser, mockReq),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects unsupported Content-Type and payloads exceeding 10 MB', async () => {
      await expect(
        controller.uploadLocalFile('kyc/cust-001/doc.html', adminUser, {
          headers: { 'content-type': 'text/html' },
          body: Buffer.from('<script>alert(1)</script>'),
        } as any),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.uploadLocalFile('safety-proof/auc-1/huge.pdf', accountantUser, {
          headers: { 'content-type': 'application/pdf' },
          body: Buffer.alloc(10 * 1024 * 1024 + 1),
        } as any),
      ).rejects.toThrow(/exceeds maximum allowed size/i);
    });

    it('supports both singular safety-proof/ and legacy safety-proofs/ keys in DocumentAccessHelper', () => {
      expect(() =>
        DocumentAccessHelper.assertStorageKeyAccess('safety-proof/auc-1/chq.jpg', accountantUser),
      ).not.toThrow();
      expect(() =>
        DocumentAccessHelper.assertStorageKeyAccess('safety-proofs/auc-1/chq.jpg', accountantUser),
      ).not.toThrow();
      expect(() =>
        DocumentAccessHelper.assertStorageKeyAccess('safety-proofs/auc-1/chq.jpg', customerUser),
      ).toThrow(ForbiddenException);
      expect(() =>
        DocumentAccessHelper.assertStorageKeyAccess('safety-proofs/auc-1/chq.jpg', agentUser),
      ).toThrow(ForbiddenException);
    });

    it('exposes exact AWS S3 SSE headers vs custom R2 headers for presigned PUT parity', () => {
      const awsDriver = new S3StorageDriver({
        region: 'ap-south-1',
        bucket: 'kumaran-aws',
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'SECRET_TEST',
      });
      const r2Driver = new S3StorageDriver({
        region: 'auto',
        bucket: 'kumaran-r2',
        accessKeyId: 'R2_TEST',
        secretAccessKey: 'R2_SECRET',
        endpoint: 'https://account-id.r2.cloudflarestorage.com',
      });

      expect(awsDriver.getPresignedUploadHeaders('image/jpeg')).toEqual({
        'Content-Type': 'image/jpeg',
        'x-amz-server-side-encryption': 'AES256',
      });
      expect(r2Driver.getPresignedUploadHeaders('image/jpeg')).toEqual({
        'Content-Type': 'image/jpeg',
      });
    });
  });
});
