import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CustomerController } from '../src/customer/customer.controller';
import { CustomerService } from '../src/customer/customer.service';
import { KycDocumentType } from '../src/customer/dto/upload-customer-document.dto';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Module 2: Customer & Nominee Management Tests', () => {
  let customerService: CustomerService;
  let customerController: CustomerController;
  let prismaMock: any;
  let storageServiceMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockCustomerId = 'cust-uuid-001';

  beforeEach(() => {
    storageServiceMock = {
      uploadFile: jest.fn().mockResolvedValue({
        key: 'kyc/cust-uuid-001/AADHAAR_FRONT-test.jpg',
        url: 'https://storage/kyc/cust-uuid-001/AADHAAR_FRONT-test.jpg',
        sizeBytes: 1024,
      }),
      getPresignedUrl: jest
        .fn()
        .mockResolvedValue('https://storage-presigned/kyc/cust-uuid-001/doc.jpg?sig=xyz'),
    };

    prismaMock = {
      customer: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      customerDocument: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      nominee: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      branch: {
        findFirst: jest.fn(),
      },
    };

    customerService = new CustomerService(
      prismaMock as unknown as PrismaService,
      storageServiceMock as any,
    );
    customerController = new CustomerController(customerService);
  });

  describe('1. Customer Code Generation', () => {
    it('should generate KC-CUST-00001 if no customers exist yet', async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

      const code = await customerService.generateCustomerCode();
      expect(code).toBe('KC-CUST-00001');
    });

    it('should increment customer code sequentially (e.g. KC-CUST-00001 -> KC-CUST-00002)', async () => {
      prismaMock.customer.findFirst.mockResolvedValue({
        customerCode: 'KC-CUST-00001',
      });

      const code = await customerService.generateCustomerCode();
      expect(code).toBe('KC-CUST-00002');
    });

    it('should correctly handle multi-digit codes (e.g. KC-CUST-00109 -> KC-CUST-00110)', async () => {
      prismaMock.customer.findFirst.mockResolvedValue({
        customerCode: 'KC-CUST-00109',
      });

      const code = await customerService.generateCustomerCode();
      expect(code).toBe('KC-CUST-00110');
    });
  });

  describe('2. Customer Registration & Data Minimization', () => {
    it('should register a customer with bilingual name and masked Aadhaar', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);
      prismaMock.customer.findFirst.mockResolvedValue(null);
      prismaMock.branch.findFirst.mockResolvedValue({ id: mockBranchId });

      const createdCustomer = {
        id: mockCustomerId,
        branchId: mockBranchId,
        customerCode: 'KC-CUST-00001',
        fullName: 'Sundaram S',
        fullNameTamil: 'சுந்தரம் சு',
        phone: '9842712345',
        altPhone: null,
        addressLine1: '14, Main Road',
        addressLine2: null,
        city: 'Perundurai',
        pincode: '638052',
        panNumber: 'ABCDE1234F',
        aadhaarLast4: '4821',
        isKycVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        branch: { id: mockBranchId, code: 'PRD', name: 'Head Office' },
      };

      prismaMock.customer.create.mockResolvedValue(createdCustomer);

      const result = await customerService.create(
        {
          fullName: 'Sundaram S',
          fullNameTamil: 'சுந்தரம் சு',
          phone: '9842712345',
          addressLine1: '14, Main Road',
          city: 'Perundurai',
          pincode: '638052',
          panNumber: 'ABCDE1234F',
          aadhaarLast4: '4821',
        },
        mockBranchId,
      );

      expect(result).toHaveProperty('id', mockCustomerId);
      expect(result.customerCode).toBe('KC-CUST-00001');
      expect(result.aadhaarLast4).toBe('4821');
      expect(result.fullNameTamil).toBe('சுந்தரம் சு');
      expect(prismaMock.customer.create).toHaveBeenCalled();
    });

    it('should register a customer with only notebook fields (no Aadhaar, PAN, or pincode provided)', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);
      prismaMock.customer.findFirst.mockResolvedValue(null);
      prismaMock.branch.findFirst.mockResolvedValue({ id: mockBranchId });

      const createdCustomer = {
        id: mockCustomerId,
        branchId: mockBranchId,
        customerCode: 'KC-CUST-00001',
        fullName: 'Kaliappan M',
        fullNameTamil: null,
        phone: '9842198765',
        altPhone: null,
        addressLine1: 'Main Road, Seenapuram',
        addressLine2: null,
        city: 'Perundurai',
        pincode: '638052',
        panNumber: null,
        aadhaarLast4: null,
        isKycVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        branch: { id: mockBranchId, code: 'PRD', name: 'Head Office' },
      };

      prismaMock.customer.create.mockResolvedValue(createdCustomer);

      const result = await customerService.create(
        {
          fullName: 'Kaliappan M',
          phone: '9842198765',
          addressLine1: 'Main Road, Seenapuram',
        },
        mockBranchId,
      );

      expect(result).toHaveProperty('id', mockCustomerId);
      expect(result.customerCode).toBe('KC-CUST-00001');
      expect(result.city).toBe('Perundurai');
      expect(result.pincode).toBe('638052');
      expect(result.aadhaarLast4).toBeNull();
      expect(result.panNumber).toBeNull();
      expect(prismaMock.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            city: 'Perundurai',
            pincode: '638052',
            aadhaarLast4: null,
            panNumber: null,
          }),
        }),
      );
    });

    it('should reject registration if phone number already exists (409 Conflict)', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: 'existing-id',
        customerCode: 'KC-CUST-00001',
        phone: '9842712345',
      });

      await expect(
        customerService.create(
          {
            fullName: 'Duplicate User',
            phone: '9842712345',
            addressLine1: 'Some street',
            city: 'Perundurai',
            pincode: '638052',
          },
          mockBranchId,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('3. Search, Pagination & KYC Status Filter', () => {
    it('should search customers by keyword with pagination metadata', async () => {
      const mockList = [
        {
          id: mockCustomerId,
          customerCode: 'KC-CUST-00001',
          fullName: 'Sundaram S',
          phone: '9842712345',
          isKycVerified: true,
          _count: { tickets: 1, nominees: 1, documents: 0 },
        },
      ];

      prismaMock.customer.findMany.mockResolvedValue(mockList);
      prismaMock.customer.count.mockResolvedValue(1);

      const result = await customerService.findAll({
        search: 'Sundaram',
        page: 1,
        limit: 10,
        isKycVerified: 'true',
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.data[0].customerCode).toBe('KC-CUST-00001');
    });
  });

  describe('4. Nominee Management', () => {
    it('should add a nominee linked to the customer', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId });
      const mockNominee = {
        id: 'nominee-001',
        customerId: mockCustomerId,
        fullName: 'Kavitha S',
        relationship: 'Spouse',
        phone: '9842798765',
        aadhaarLast4: '8912',
      };
      prismaMock.nominee.create.mockResolvedValue(mockNominee);

      const result = await customerService.addNominee(mockCustomerId, {
        fullName: 'Kavitha S',
        relationship: 'Spouse',
        phone: '9842798765',
        aadhaarLast4: '8912',
      });

      expect(result.fullName).toBe('Kavitha S');
      expect(result.relationship).toBe('Spouse');
      expect(result.aadhaarLast4).toBe('8912');
    });

    it('should remove a nominee successfully', async () => {
      prismaMock.nominee.findUnique.mockResolvedValue({
        id: 'nominee-001',
        customerId: mockCustomerId,
      });
      prismaMock.nominee.delete.mockResolvedValue({});

      const result = await customerService.removeNominee(mockCustomerId, 'nominee-001');
      expect(result.success).toBe(true);
      expect(prismaMock.nominee.delete).toHaveBeenCalledWith({
        where: { id: 'nominee-001' },
      });
    });

    it('should throw NotFoundException if nominee does not belong to customer', async () => {
      prismaMock.nominee.findUnique.mockResolvedValue({
        id: 'nominee-001',
        customerId: 'different-customer-id',
      });

      await expect(
        customerService.removeNominee(mockCustomerId, 'nominee-001'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('5. KYC Status Verification', () => {
    it('should update KYC verification status', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId });
      prismaMock.customer.update.mockResolvedValue({ id: mockCustomerId, isKycVerified: true });

      const result = await customerService.updateKycStatus(mockCustomerId, {
        isKycVerified: true,
      });

      expect(result.success).toBe(true);
      expect(result.isKycVerified).toBe(true);
      expect(prismaMock.customer.update).toHaveBeenCalledWith({
        where: { id: mockCustomerId },
        data: { isKycVerified: true },
      });
    });
  });

  describe('6. Controller Persona Security & Self-Access Enforcement', () => {
    it('should allow staff to view any customer profile', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId });

      const staffPayload = {
        sub: 'staff-user-001',
        phone: '9876543210',
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        tokenType: 'access' as const,
      };

      const result = await customerController.findOne(mockCustomerId, staffPayload);
      expect(result.id).toBe(mockCustomerId);
    });

    it('should allow customer to view their own profile', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId });

      const customerPayload = {
        sub: mockCustomerId,
        phone: '9842712345',
        roles: [Role.CUSTOMER],
        branchId: mockBranchId,
        tokenType: 'access' as const,
      };

      const result = await customerController.findOne(mockCustomerId, customerPayload);
      expect(result.id).toBe(mockCustomerId);
    });

    it('should throw ForbiddenException if customer tries to view another customer profile', async () => {
      const customerPayload = {
        sub: 'different-customer-id',
        phone: '9842799999',
        roles: [Role.CUSTOMER],
        branchId: mockBranchId,
        tokenType: 'access' as const,
      };

      await expect(
        customerController.findOne(mockCustomerId, customerPayload),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('7. Customer Device FCM Push Token Registration', () => {
    it('should register a valid FCM token for the customer via service', async () => {
      const mockToken = 'fcm-subscriber-token-99999';
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId });
      prismaMock.customer.update.mockResolvedValue({
        id: mockCustomerId,
        customerCode: 'KC-CUST-00001',
        phone: '9842712345',
        fcmToken: mockToken,
        updatedAt: new Date(),
      });

      const res = await customerService.updateFcmToken(mockCustomerId, mockToken);
      expect(res.success).toBe(true);
      expect(res.fcmToken).toBe(mockToken);
      expect(res.message).toContain('registered successfully');
      expect(prismaMock.customer.update).toHaveBeenCalledWith({
        where: { id: mockCustomerId },
        data: { fcmToken: mockToken },
        select: expect.any(Object),
      });
    });

    it('should clear/deregister the FCM token when null', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId });
      prismaMock.customer.update.mockResolvedValue({
        id: mockCustomerId,
        customerCode: 'KC-CUST-00001',
        phone: '9842712345',
        fcmToken: null,
        updatedAt: new Date(),
      });

      const res = await customerService.updateFcmToken(mockCustomerId, null);
      expect(res.success).toBe(true);
      expect(res.fcmToken).toBeNull();
      expect(res.message).toContain('deregistered successfully');
      expect(prismaMock.customer.update).toHaveBeenCalledWith({
        where: { id: mockCustomerId },
        data: { fcmToken: null },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if customer not found', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(
        customerService.updateFcmToken('unknown-cust', 'token-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow customer to update their own FCM token via controller', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId });
      prismaMock.customer.update.mockResolvedValue({
        id: mockCustomerId,
        customerCode: 'KC-CUST-00001',
        phone: '9842712345',
        fcmToken: 'token-self',
        updatedAt: new Date(),
      });

      const customerPayload = {
        sub: mockCustomerId,
        phone: '9842712345',
        roles: [Role.CUSTOMER],
        branchId: mockBranchId,
        tokenType: 'access' as const,
      };

      const res = await customerController.updateFcmToken(
        mockCustomerId,
        { fcmToken: 'token-self' },
        customerPayload,
      );
      expect(res.success).toBe(true);
    });

    it('should allow staff (SUPER_ADMIN / COLLECTION_AGENT) to update customer FCM token via controller', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId });
      prismaMock.customer.update.mockResolvedValue({
        id: mockCustomerId,
        customerCode: 'KC-CUST-00001',
        phone: '9842712345',
        fcmToken: 'token-staff-assigned',
        updatedAt: new Date(),
      });

      const staffPayload = {
        sub: 'staff-user-001',
        phone: '9876543210',
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        tokenType: 'access' as const,
      };

      const res = await customerController.updateFcmToken(
        mockCustomerId,
        { fcmToken: 'token-staff-assigned' },
        staffPayload,
      );
      expect(res.success).toBe(true);
    });

    it('should throw ForbiddenException if customer attempts to update another subscriber token (Anti-IDOR)', async () => {
      const customerPayload = {
        sub: 'different-customer-id',
        phone: '9842799999',
        roles: [Role.CUSTOMER],
        branchId: mockBranchId,
        tokenType: 'access' as const,
      };

      await expect(
        customerController.updateFcmToken(
          mockCustomerId,
          { fcmToken: 'token-hijack' },
          customerPayload,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('7. Customer KYC Document Uploads & Presigned URLs', () => {
    const mockFile = {
      originalname: 'aadhaar_front.jpg',
      mimetype: 'image/jpeg',
      size: 512 * 1024,
      buffer: Buffer.from('fake-image-bytes'),
    };

    const mockCreatedDoc = {
      id: 'doc-uuid-001',
      customerId: mockCustomerId,
      docType: KycDocumentType.AADHAAR_FRONT,
      fileName: 'aadhaar_front.jpg',
      verified: false,
      uploadedAt: new Date(),
    };

    it('should successfully upload a KYC document and record in DB', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId, customerCode: 'KC-CUST-00001' });
      prismaMock.customerDocument.create.mockResolvedValue(mockCreatedDoc);

      const res = await customerService.uploadDocument(
        mockCustomerId,
        { docType: KycDocumentType.AADHAAR_FRONT },
        mockFile,
      );

      expect(res.id).toBe('doc-uuid-001');
      expect(storageServiceMock.uploadFile).toHaveBeenCalled();
      expect(prismaMock.customerDocument.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if file is missing', async () => {
      await expect(
        customerService.uploadDocument(
          mockCustomerId,
          { docType: KycDocumentType.AADHAAR_FRONT },
          undefined as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for unsupported file format', async () => {
      const badFile = {
        ...mockFile,
        mimetype: 'application/x-executable',
      };

      await expect(
        customerService.uploadDocument(
          mockCustomerId,
          { docType: KycDocumentType.AADHAAR_FRONT },
          badFile,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if file exceeds 10 MB limit', async () => {
      const oversizedFile = {
        ...mockFile,
        size: 11 * 1024 * 1024,
      };

      await expect(
        customerService.uploadDocument(
          mockCustomerId,
          { docType: KycDocumentType.AADHAAR_FRONT },
          oversizedFile,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if customer does not exist on upload', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(
        customerService.uploadDocument(
          'non-existent-id',
          { docType: KycDocumentType.AADHAAR_FRONT },
          mockFile,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow customer to upload document for their own profile via controller', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId });
      prismaMock.customerDocument.create.mockResolvedValue(mockCreatedDoc);

      const customerPayload = {
        sub: mockCustomerId,
        phone: '9842712345',
        roles: [Role.CUSTOMER],
        branchId: mockBranchId,
        tokenType: 'access' as const,
      };

      const res = await customerController.uploadDocument(
        mockCustomerId,
        { docType: KycDocumentType.AADHAAR_FRONT },
        mockFile,
        customerPayload,
      );

      expect(res.id).toBe('doc-uuid-001');
    });

    it('should throw ForbiddenException if customer uploads for another customer ID (Anti-IDOR)', async () => {
      const customerPayload = {
        sub: 'other-cust-id',
        phone: '9842799999',
        roles: [Role.CUSTOMER],
        branchId: mockBranchId,
        tokenType: 'access' as const,
      };

      await expect(
        customerController.uploadDocument(
          mockCustomerId,
          { docType: KycDocumentType.AADHAAR_FRONT },
          mockFile,
          customerPayload,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should generate a 15-minute presigned viewing URL for valid document', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId });
      prismaMock.customerDocument.findFirst.mockResolvedValue({
        id: 'doc-uuid-001',
        customerId: mockCustomerId,
        s3Key: 'kyc/cust-uuid-001/doc.jpg',
      });

      const res = await customerService.getDocumentPresignedUrl(mockCustomerId, 'doc-uuid-001');
      expect(res.url).toContain('https://storage-presigned/');
      expect(res.expiresInSeconds).toBe(900);
    });

    it('should throw NotFoundException if document does not exist for customer', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId });
      prismaMock.customerDocument.findFirst.mockResolvedValue(null);

      await expect(
        customerService.getDocumentPresignedUrl(mockCustomerId, 'doc-non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if customer views document of another customer (Anti-IDOR)', async () => {
      const customerPayload = {
        sub: 'other-cust-id',
        phone: '9842799999',
        roles: [Role.CUSTOMER],
        branchId: mockBranchId,
        tokenType: 'access' as const,
      };

      await expect(
        customerController.getDocumentUrl(
          mockCustomerId,
          'doc-uuid-001',
          customerPayload,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('8. Anti-BOLA / IDOR Cross-Branch Guardians (OWASP API1:2023)', () => {
    const branchPrdId = 'branch-prd-001';
    const branchErdId = 'branch-erd-002';

    const branchManagerPrdPayload = {
      sub: 'manager-prd-uuid',
      phone: '9876543212',
      roles: [Role.BRANCH_MANAGER],
      branchId: branchPrdId,
      tokenType: 'access' as const,
    };

    const superAdminPayload = {
      sub: 'admin-uuid',
      phone: '9876543210',
      roles: [Role.SUPER_ADMIN],
      branchId: branchPrdId,
      tokenType: 'access' as const,
    };

    const mockErdCustomer = {
      id: 'cust-erd-uuid-999',
      customerCode: 'KC-CUST-00999',
      fullName: 'S. Ramanathan',
      phone: '9842199999',
      branchId: branchErdId,
      isKycVerified: false,
    };

    const mockKycDoc = {
      id: 'doc-erd-001',
      customerId: mockErdCustomer.id,
      docType: KycDocumentType.AADHAAR_FRONT,
      s3Key: 'kyc/cust-erd-uuid-999/AADHAAR_FRONT-test.jpg',
      fileName: 'aadhaar.jpg',
      verified: false,
      uploadedAt: new Date(),
    };

    it('BOLA-INV-1: Branch Manager of Branch PRD cannot view presigned KYC URL of Branch ERD customer', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(mockErdCustomer);

      await expect(
        customerController.getDocumentUrl(mockErdCustomer.id, mockKycDoc.id, branchManagerPrdPayload),
      ).rejects.toThrow(ForbiddenException);
    });

    it('BOLA-INV-2: Branch Manager of Branch PRD cannot delete KYC document of Branch ERD customer', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(mockErdCustomer);

      await expect(
        customerController.deleteDocument(mockErdCustomer.id, mockKycDoc.id, branchManagerPrdPayload),
      ).rejects.toThrow(ForbiddenException);
    });

    it('BOLA-INV-3: Branch Manager of Branch PRD cannot upload KYC document for Branch ERD customer', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(mockErdCustomer);

      await expect(
        customerController.uploadDocument(
          mockErdCustomer.id,
          { docType: KycDocumentType.AADHAAR_FRONT },
          { originalname: 'doc.jpg', mimetype: 'image/jpeg', size: 1024, buffer: Buffer.from('abc') } as any,
          branchManagerPrdPayload,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('BOLA-INV-4: Branch Manager of Branch PRD cannot update profile of Branch ERD customer', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(mockErdCustomer);

      await expect(
        customerController.update(
          mockErdCustomer.id,
          { fullName: 'Tampered Name' },
          branchManagerPrdPayload,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('BOLA-INV-5: Branch Manager of Branch PRD cannot update KYC status of Branch ERD customer', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(mockErdCustomer);

      await expect(
        customerController.updateKycStatus(
          mockErdCustomer.id,
          { isKycVerified: true },
          branchManagerPrdPayload,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('BOLA-INV-6: Super Admin can view, update, and manage Branch ERD customer (Global Oversight)', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(mockErdCustomer);
      prismaMock.customerDocument.findFirst.mockResolvedValue(mockKycDoc);
      storageServiceMock.getPresignedUrl.mockResolvedValue('https://storage/presigned-url');

      const res = await customerController.getDocumentUrl(
        mockErdCustomer.id,
        mockKycDoc.id,
        superAdminPayload,
      );
      expect(res.url).toBe('https://storage/presigned-url');
    });

    it('BOLA-INV-7: Branch Manager of Branch PRD CAN access a customer belonging to Branch PRD (Same Branch)', async () => {
      const mockPrdCustomer = { ...mockErdCustomer, branchId: branchPrdId };
      prismaMock.customer.findUnique.mockResolvedValue(mockPrdCustomer);
      prismaMock.customerDocument.findFirst.mockResolvedValue(mockKycDoc);
      storageServiceMock.getPresignedUrl.mockResolvedValue('https://storage/presigned-url-prd');

      const res = await customerController.getDocumentUrl(
        mockPrdCustomer.id,
        mockKycDoc.id,
        branchManagerPrdPayload,
      );
      expect(res.url).toBe('https://storage/presigned-url-prd');
    });
  });
});
