import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CustomerController } from '../src/customer/customer.controller';
import { CustomerService } from '../src/customer/customer.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Module 2: Customer & Nominee Management Tests', () => {
  let customerService: CustomerService;
  let customerController: CustomerController;
  let prismaMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockCustomerId = 'cust-uuid-001';

  beforeEach(() => {
    prismaMock = {
      customer: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
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

    customerService = new CustomerService(prismaMock as unknown as PrismaService);
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
        email: 'staff@kumaranfinance.com',
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
        email: null,
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
        email: null,
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
        email: null,
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
        email: 'admin@kumaranfinance.com',
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
        email: null,
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
});
