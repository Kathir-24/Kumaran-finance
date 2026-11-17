import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '@prisma/client';
import { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { CreateCustomerDto } from '../../src/customer/dto/create-customer.dto';
import { UpdateCustomerDto } from '../../src/customer/dto/update-customer.dto';
import { CreateNomineeDto } from '../../src/customer/dto/create-nominee.dto';
import { CustomerService } from '../../src/customer/customer.service';
import { DocumentAccessHelper } from '../../src/storage/helpers/document-access.helper';

describe('Module 3: Customer Intake, KYC, Nominees & Anti-BOLA Validation Suite', () => {
  let customerService: CustomerService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      customer: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      branch: {
        findFirst: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    customerService = new CustomerService(prismaMock as any, {} as any);
  });

  // ============================================================================
  // 1. DEF-01: Indian Mobile Phone Regex & Validation
  // ============================================================================
  describe('1. DEF-01: Indian Mobile Number Invariant (ADR-18: ^[6-9]\\d{9}$)', () => {
    it('should accept valid 10-digit Indian mobile numbers starting with 6, 7, 8, 9 for customer intake', async () => {
      const validPhones = ['6380123456', '7373123456', '8903123456', '9842712345'];

      for (const phone of validPhones) {
        const dto = plainToInstance(CreateCustomerDto, {
          fullName: 'Sundaram S',
          phone,
          addressLine1: '14, Main Road, Perundurai',
        });
        const errors = await validate(dto);
        const phoneErrors = errors.filter((e) => e.property === 'phone');
        expect(phoneErrors).toHaveLength(0);
      }
    });

    it('should reject invalid mobile numbers starting with 0, 1, 2, 3, 4, 5 for customer intake', async () => {
      const invalidPhones = ['0984212345', '1234567890', '2222222222', '3456789012', '4567890123', '5555555555'];

      for (const phone of invalidPhones) {
        const dto = plainToInstance(CreateCustomerDto, {
          fullName: 'Sundaram S',
          phone,
          addressLine1: '14, Main Road, Perundurai',
        });
        const errors = await validate(dto);
        const phoneErrors = errors.filter((e) => e.property === 'phone');
        expect(phoneErrors.length).toBeGreaterThan(0);
      }
    });

    it('should reject numbers with length != 10 or containing non-digits', async () => {
      const malformedPhones = ['984271234', '98427123450', '98427ABCD5', '98427 1234', '+9198427123'];

      for (const phone of malformedPhones) {
        const dto = plainToInstance(CreateCustomerDto, {
          fullName: 'Sundaram S',
          phone,
          addressLine1: '14, Main Road, Perundurai',
        });
        const errors = await validate(dto);
        const phoneErrors = errors.filter((e) => e.property === 'phone');
        expect(phoneErrors.length).toBeGreaterThan(0);
      }
    });

    it('should enforce ADR-18 Indian mobile regex on altPhone if provided', async () => {
      const dtoValidAlt = plainToInstance(CreateCustomerDto, {
        fullName: 'Sundaram S',
        phone: '9842712345',
        altPhone: '9443212345',
        addressLine1: '14, Main Road, Perundurai',
      });
      const errorsValid = await validate(dtoValidAlt);
      expect(errorsValid.filter((e) => e.property === 'altPhone')).toHaveLength(0);

      const dtoInvalidAlt = plainToInstance(CreateCustomerDto, {
        fullName: 'Sundaram S',
        phone: '9842712345',
        altPhone: '1234567890',
        addressLine1: '14, Main Road, Perundurai',
      });
      const errorsInvalid = await validate(dtoInvalidAlt);
      expect(errorsInvalid.filter((e) => e.property === 'altPhone').length).toBeGreaterThan(0);
    });

    it('should enforce ADR-18 Indian mobile regex on nominee phone in CreateNomineeDto', async () => {
      const validNominee = plainToInstance(CreateNomineeDto, {
        fullName: 'Kavitha S',
        relationship: 'Spouse',
        phone: '9842798765',
      });
      const validErrors = await validate(validNominee);
      expect(validErrors.filter((e) => e.property === 'phone')).toHaveLength(0);

      const invalidNominee = plainToInstance(CreateNomineeDto, {
        fullName: 'Kavitha S',
        relationship: 'Spouse',
        phone: '0123456789',
      });
      const invalidErrors = await validate(invalidNominee);
      expect(invalidErrors.filter((e) => e.property === 'phone').length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 2. DEF-08: PAN Normalization & Validation
  // ============================================================================
  describe('2. DEF-08: PAN Normalization & Validation', () => {
    it('should accept valid 10-character uppercase Indian PAN (5 letters, 4 digits, 1 letter)', async () => {
      const dto = plainToInstance(CreateCustomerDto, {
        fullName: 'Sundaram S',
        phone: '9842712345',
        addressLine1: '14, Main Road, Perundurai',
        panNumber: 'ABCDE1234F',
      });
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === 'panNumber')).toHaveLength(0);
    });

    it('should auto-transform and uppercase lowercase PAN entries during transformation', async () => {
      const dto = plainToInstance(CreateCustomerDto, {
        fullName: 'Sundaram S',
        phone: '9842712345',
        addressLine1: '14, Main Road, Perundurai',
        panNumber: '  abcde1234f  ',
      });
      expect(dto.panNumber).toBe('ABCDE1234F');
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === 'panNumber')).toHaveLength(0);
    });

    it('should auto-transform and uppercase PAN entries in UpdateCustomerDto', async () => {
      const dto = plainToInstance(UpdateCustomerDto, {
        panNumber: 'xyzab9876k',
      });
      expect(dto.panNumber).toBe('XYZAB9876K');
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === 'panNumber')).toHaveLength(0);
    });

    it('should reject invalid PAN syntax formats', async () => {
      const invalidPans = ['12345ABCDE', 'ABC1234F', 'ABCDEF1234', 'ABCDE12345', 'ABCDE12345F'];

      for (const pan of invalidPans) {
        const dto = plainToInstance(CreateCustomerDto, {
          fullName: 'Sundaram S',
          phone: '9842712345',
          addressLine1: '14, Main Road, Perundurai',
          panNumber: pan,
        });
        const errors = await validate(dto);
        expect(errors.filter((e) => e.property === 'panNumber').length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // 3. Aadhaar Last 4 Data Minimization (ADR-17 & DPDP Act 2023)
  // ============================================================================
  describe('3. Aadhaar Last 4 Data Minimization (ADR-17 & DPDP Act 2023)', () => {
    it('should accept valid 4-digit masked Aadhaar', async () => {
      const dto = plainToInstance(CreateCustomerDto, {
        fullName: 'Sundaram S',
        phone: '9842712345',
        addressLine1: '14, Main Road, Perundurai',
        aadhaarLast4: '4821',
      });
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === 'aadhaarLast4')).toHaveLength(0);
    });

    it('should strictly reject full 12-digit Aadhaar numbers to prevent privacy leaks', async () => {
      const dto = plainToInstance(CreateCustomerDto, {
        fullName: 'Sundaram S',
        phone: '9842712345',
        addressLine1: '14, Main Road, Perundurai',
        aadhaarLast4: '123456789012',
      });
      const errors = await validate(dto);
      const aadhaarErrors = errors.filter((e) => e.property === 'aadhaarLast4');
      expect(aadhaarErrors.length).toBeGreaterThan(0);
      expect(aadhaarErrors[0].constraints?.matches).toBeDefined();
    });

    it('should reject non-4-digit Aadhaar values in CreateNomineeDto', async () => {
      const invalidNominee = plainToInstance(CreateNomineeDto, {
        fullName: 'Kavitha S',
        relationship: 'Spouse',
        phone: '9842798765',
        aadhaarLast4: '123456789012',
      });
      const errors = await validate(invalidNominee);
      expect(errors.filter((e) => e.property === 'aadhaarLast4').length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 4. DEF-04: Anti-BOLA Branch Isolation on Customer Intake
  // ============================================================================
  describe('4. DEF-04: Anti-BOLA Branch Isolation on Customer Intake', () => {
    const branchPrdId = 'branch-prd-uuid-001';
    const branchErdId = 'branch-erd-uuid-002';

    it('should reject customer creation when Branch Manager attempts cross-branch creation', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      const branchManagerUser: JwtPayload = {
        sub: 'user-bm-001',
        phone: '9842000001',
        roles: [Role.BRANCH_MANAGER],
        branchId: branchPrdId,
        tokenType: 'access',
      };

      const dto: CreateCustomerDto = {
        fullName: 'Sundaram S',
        phone: '9842712345',
        addressLine1: '14, Main Road',
        branchId: branchErdId, // Attempting to create for ERD while assigned to PRD
      };

      await expect(customerService.create(dto, branchManagerUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(customerService.create(dto, branchManagerUser)).rejects.toThrow(
        /BOLA_VIOLATION: Staff cannot create customers in another branch office/,
      );
    });

    it('should reject customer creation when Collection Agent attempts cross-branch creation', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);

      const agentUser: JwtPayload = {
        sub: 'user-agent-001',
        phone: '9842000002',
        roles: [Role.COLLECTION_AGENT],
        branchId: branchPrdId,
        tokenType: 'access',
      };

      const dto: CreateCustomerDto = {
        fullName: 'Sundaram S',
        phone: '9842712345',
        addressLine1: '14, Main Road',
        branchId: branchErdId,
      };

      await expect(customerService.create(dto, agentUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should permit customer creation for Super Admin across any branch office', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);
      prismaMock.customer.create.mockResolvedValue({
        id: 'cust-uuid-001',
        customerCode: 'KC-CUST-00001',
        branchId: branchErdId,
        fullName: 'Sundaram S',
        phone: '9842712345',
      });

      const superAdminUser: JwtPayload = {
        sub: 'user-admin-001',
        phone: '9842000000',
        roles: [Role.SUPER_ADMIN],
        branchId: branchPrdId,
        tokenType: 'access',
      };

      const dto: CreateCustomerDto = {
        fullName: 'Sundaram S',
        phone: '9842712345',
        addressLine1: '14, Main Road',
        branchId: branchErdId,
      };

      const result = await customerService.create(dto, superAdminUser);
      expect(result).toHaveProperty('id', 'cust-uuid-001');
      expect(prismaMock.customer.create).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 5. DEF-05: Anti-BOLA Branch Scoping on FCM Push Token Updates
  // ============================================================================
  describe('5. DEF-05: Anti-BOLA Branch Scoping on FCM Token Updates', () => {
    const branchPrdId = 'branch-prd-uuid-001';
    const branchErdId = 'branch-erd-uuid-002';

    it('should throw ForbiddenException when Branch Manager updates FCM token for a customer in another branch', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: 'cust-erd-001',
        branchId: branchErdId,
        phone: '9842700001',
      });

      const branchManagerPrd: JwtPayload = {
        sub: 'user-bm-prd',
        phone: '9842000001',
        roles: [Role.BRANCH_MANAGER],
        branchId: branchPrdId,
        tokenType: 'access',
      };

      await expect(
        customerService.updateFcmToken('cust-erd-001', 'token-abc-123', branchManagerPrd),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow Branch Manager to update FCM token for customer in their own branch', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: 'cust-prd-001',
        branchId: branchPrdId,
        phone: '9842700001',
      });
      prismaMock.customer.update.mockResolvedValue({
        id: 'cust-prd-001',
        customerCode: 'KC-CUST-00001',
        phone: '9842700001',
        fcmToken: 'token-new-123',
        updatedAt: new Date(),
      });

      const branchManagerPrd: JwtPayload = {
        sub: 'user-bm-prd',
        phone: '9842000001',
        roles: [Role.BRANCH_MANAGER],
        branchId: branchPrdId,
        tokenType: 'access',
      };

      const result = await customerService.updateFcmToken(
        'cust-prd-001',
        'token-new-123',
        branchManagerPrd,
      );
      expect(result.success).toBe(true);
      expect(result.fcmToken).toBe('token-new-123');
    });
  });

  // ============================================================================
  // 6. DEF-03: Collection Agent Document Upload Authorization
  // ============================================================================
  describe('6. DEF-03: Collection Agent Document Access Authorization', () => {
    const branchPrdId = 'branch-prd-uuid-001';
    const branchErdId = 'branch-erd-uuid-002';

    it('should permit Collection Agent to access and upload documents for customer in their assigned branch', () => {
      const customerInPrd = {
        id: 'cust-prd-001',
        branchId: branchPrdId,
        phone: '9842712345',
      };

      const agentUser: JwtPayload = {
        sub: 'user-agent-001',
        phone: '9842000002',
        roles: [Role.COLLECTION_AGENT],
        branchId: branchPrdId,
        tokenType: 'access',
      };

      expect(() => {
        DocumentAccessHelper.assertCustomerAccess(customerInPrd, agentUser);
      }).not.toThrow();
    });

    it('should throw ForbiddenException when Collection Agent accesses customer of another branch office', () => {
      const customerInErd = {
        id: 'cust-erd-001',
        branchId: branchErdId,
        phone: '9842712345',
      };

      const agentUser: JwtPayload = {
        sub: 'user-agent-001',
        phone: '9842000002',
        roles: [Role.COLLECTION_AGENT],
        branchId: branchPrdId,
        tokenType: 'access',
      };

      expect(() => {
        DocumentAccessHelper.assertCustomerAccess(customerInErd, agentUser);
      }).toThrow(ForbiddenException);
      expect(() => {
        DocumentAccessHelper.assertCustomerAccess(customerInErd, agentUser);
      }).toThrow(/BOLA_VIOLATION: Access denied. Customer profile and KYC documents belong to another branch office/);
    });
  });
});
