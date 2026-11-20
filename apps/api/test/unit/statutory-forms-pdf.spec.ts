import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { PdfController } from '../../src/pdf/pdf.controller';
import { PdfService } from '../../src/pdf/pdf.service';
import { FormISanctionTemplate } from '../../src/pdf/templates/form-i-sanction.template';
import { FormIiRegistrationTemplate } from '../../src/pdf/templates/form-ii-registration.template';
import { FormVDeclarationTemplate } from '../../src/pdf/templates/form-v-declaration.template';
import { FormViiCertificateTemplate } from '../../src/pdf/templates/form-vii-certificate.template';
import { FormIxNoticeTemplate } from '../../src/pdf/templates/form-ix-notice.template';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/storage/storage.service';

describe('Statutory Registrar Forms PDF Suite (Tamil Nadu Chit Funds Rules, 1984)', () => {
  let pdfService: PdfService;
  let pdfController: PdfController;
  let prismaMock: any;
  let storageMock: any;

  const partnerUser: JwtPayload = {
    sub: 'usr-partner-1',
    phone: '9876543210',
    roles: [Role.PARTNER],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const superAdminUser: JwtPayload = {
    sub: 'usr-admin-1',
    phone: '9876543219',
    roles: [Role.SUPER_ADMIN],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const branchManagerPRD: JwtPayload = {
    sub: 'usr-bm-1',
    phone: '9876543212',
    roles: [Role.BRANCH_MANAGER],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const branchManagerOther: JwtPayload = {
    sub: 'usr-bm-2',
    phone: '9876543299',
    roles: [Role.BRANCH_MANAGER],
    branchId: 'branch-OTHER',
    tokenType: 'access',
  };

  const customerUser: JwtPayload = {
    sub: 'cust-uuid-1',
    phone: '9842143210',
    roles: [Role.CUSTOMER],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const mockBranch = {
    id: 'branch-PRD',
    code: 'PRD',
    name: 'Head Office - Perundurai',
    nameTamil: 'தலைமை கிளை - பெருந்துறை',
    address: '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052',
    phone: '+91 98765 43210',
  };

  const mockChitGroup = {
    id: 'chit-group-uuid-1',
    branchId: 'branch-PRD',
    branch: mockBranch,
    groupCode: 'KCA-1L-20M-01',
    groupName: '1 Lakh 20 Months Group A',
    chitValue: 100000n,
    durationMonths: 20,
    totalTickets: 20,
    baseInstallment: 5000n,
    foremanCommissionRate: '4.00',
    maxDiscountCeiling: 25000n,
    status: 'ACTIVE',
    sanctionOrderNumber: 'ROC/ERD/SANCTION/2026/042',
    sanctionDate: new Date('2026-01-15T10:00:00Z'),
    startDate: new Date('2026-02-01T10:00:00Z'),
    endDate: new Date('2027-09-01T10:00:00Z'),
    createdAt: new Date('2026-01-10T10:00:00Z'),
    updatedAt: new Date('2026-01-20T10:00:00Z'),
    tickets: Array.from({ length: 20 }, (_, idx) => ({
      id: `ticket-uuid-${idx + 1}`,
      ticketNumber: idx + 1,
      customer: {
        id: `cust-uuid-${idx + 1}`,
        customerCode: `KC-CUST-${String(idx + 1).padStart(4, '0')}`,
        fullName: `Subscriber Member ${idx + 1}`,
        fullNameTamil: `சந்தாதாரர் ${idx + 1}`,
        phone: idx === 0 ? '9842143210' : `98765000${String(idx).padStart(2, '0')}`,
        addressLine1: 'Perundurai',
        city: 'Erode',
      },
    })),
  };

  const mockAuction = {
    id: 'auction-uuid-1',
    chitGroupId: 'chit-group-uuid-1',
    chitGroup: mockChitGroup,
    installmentMonth: 4,
    auctionDate: new Date('2026-05-15T11:00:00Z'),
    bidDiscount: 25000n,
    prizeMoney: 75000n,
    foremanCommissionAmount: 4000n,
    totalDividend: 21000n,
    dividendPerTicket: 1050n,
    status: 'COMPLETED',
  };

  beforeEach(() => {
    prismaMock = {
      chitGroup: {
        findUnique: jest.fn().mockResolvedValue(mockChitGroup),
        findMany: jest.fn().mockResolvedValue([mockChitGroup]),
      },
      auction: {
        findUnique: jest.fn().mockResolvedValue(mockAuction),
      },
      subscriberTicket: {
        findUnique: jest.fn().mockResolvedValue(mockChitGroup.tickets[0]),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'usr-partner-1',
          name: 'P. Kumaran (Managing Partner)',
          phone: '9876543210',
          roles: [Role.PARTNER],
        }),
      },
    };

    storageMock = {
      uploadFile: jest.fn().mockImplementation(
        async (key: string, buffer: Buffer, mimeType = 'application/pdf') => ({
          key,
          url: `/api/v1/storage/file/${key}`,
          sizeBytes: buffer.length,
          mimeType,
        }),
      ),
      getPresignedUrl: jest.fn().mockImplementation(async (key: string) => {
        return `https://storage.kumaranfinance.in/${key}?sig=mockSignature123`;
      }),
    };

    pdfService = new PdfService(
      prismaMock as unknown as PrismaService,
      storageMock as unknown as StorageService,
    );
    pdfController = new PdfController(pdfService);
  });

  describe('1. Form I — Previous Sanction Application (Section 4(2) & Rule 3)', () => {
    it('should generate valid PDF binary starting with %PDF- header', async () => {
      const buffer = await FormISanctionTemplate.generate({
        groupCode: 'KCA-1L-20M-01',
        groupName: '1 Lakh 20 Months Group A',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        maxDiscountCeiling: 25000n,
        foremanCommissionRate: '4.00',
        branchAddress: mockBranch.address,
        managingPartnerName: 'P. Kumaran (Managing Partner)',
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(500);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('should generate Form I via service and store in S3 with presigned URL', async () => {
      const result = await pdfService.generateFormISanctionPdf(
        'chit-group-uuid-1',
        partnerUser,
      );

      expect(result.buffer).toBeDefined();
      expect(result.key).toBe('statutory/form-i/chit-group-uuid-1.pdf');
      expect(result.presignedUrl).toContain('statutory/form-i/chit-group-uuid-1.pdf');
      expect(storageMock.uploadFile).toHaveBeenCalledWith(
        'statutory/form-i/chit-group-uuid-1.pdf',
        expect.any(Buffer),
        'application/pdf',
      );
    });

    it('should deny Customer from accessing Form I previous sanction application (403 Forbidden)', async () => {
      await expect(
        pdfService.generateFormISanctionPdf('chit-group-uuid-1', customerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should deny Branch Manager from another branch from accessing Form I (403 Forbidden)', async () => {
      await expect(
        pdfService.generateFormISanctionPdf('chit-group-uuid-1', branchManagerOther),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Form II — Chit Agreement Registration Application (Section 7 & Rule 5)', () => {
    it('should generate valid Form II PDF binary', async () => {
      const buffer = await FormIiRegistrationTemplate.generate({
        groupCode: 'KCA-1L-20M-01',
        groupName: '1 Lakh 20 Months Group A',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        maxDiscountCeiling: 25000n,
        sanctionOrderNumber: 'ROC/ERD/SANCTION/2026/042',
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('should generate Form II via service and upload with correct storage key', async () => {
      const result = await pdfService.generateFormIiRegistrationPdf(
        'chit-group-uuid-1',
        branchManagerPRD,
      );

      expect(result.key).toBe('statutory/form-ii/chit-group-uuid-1.pdf');
      expect(result.presignedUrl).toContain('statutory/form-ii');
    });
  });

  describe('3. Form V — 100% Subscription Declaration (Section 9(1) & Rule 10)', () => {
    it('should generate Form V PDF containing 20 enrolled subscribers', async () => {
      const buffer = await FormVDeclarationTemplate.generate({
        groupCode: 'KCA-1L-20M-01',
        groupName: '1 Lakh 20 Months Group A',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        subscribedTicketsCount: 20,
        subscribers: mockChitGroup.tickets.map((t) => ({
          ticketNumber: t.ticketNumber,
          customerName: t.customer.fullName,
          customerCode: t.customer.customerCode,
          phone: t.customer.phone,
        })),
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('should generate Form V via service with full roster', async () => {
      const result = await pdfService.generateFormVDeclarationPdf(
        'chit-group-uuid-1',
        partnerUser,
      );

      expect(result.key).toBe('statutory/form-v/chit-group-uuid-1.pdf');
      expect(storageMock.uploadFile).toHaveBeenCalled();
    });
  });

  describe('4. Form VII — Agreement Furnishing Certificate (Section 10(2) & Rule 12)', () => {
    it('should generate Form VII certificate PDF with commencement and draw dates', async () => {
      const buffer = await FormViiCertificateTemplate.generate({
        groupCode: 'KCA-1L-20M-01',
        groupName: '1 Lakh 20 Months Group A',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        sanctionOrderNumber: 'ROC/ERD/SANCTION/2026/042',
        commencementCertificateDate: new Date('2026-01-20'),
        copiesFurnishedDate: new Date('2026-01-25'),
        firstDrawDate: new Date('2026-02-01'),
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('should generate Form VII via service and verify storage upload', async () => {
      const result = await pdfService.generateFormViiCertificatePdf(
        'chit-group-uuid-1',
        superAdminUser,
      );

      expect(result.key).toBe('statutory/form-vii/chit-group-uuid-1.pdf');
    });
  });

  describe('5. Form IX — Auction Draw Notice (Section 16 & Rule 16)', () => {
    it('should generate Form IX notice PDF for subscriber', async () => {
      const buffer = await FormIxNoticeTemplate.generate({
        groupCode: 'KCA-1L-20M-01',
        groupName: '1 Lakh 20 Months Group A',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        maxDiscountCeiling: 25000n,
        installmentMonth: 4,
        auctionDate: new Date('2026-05-15T11:00:00Z'),
        subscriberName: 'Sundaram P',
        subscriberTicketNumber: 1,
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('should allow customer to download Form IX notice for their ticket in assigned branch', async () => {
      const result = await pdfService.generateFormIxNoticePdf(
        'auction-uuid-1',
        customerUser,
        'ticket-uuid-1',
      );

      expect(result.key).toBe('statutory/form-ix/auction-uuid-1-ticket-uuid-1.pdf');
      expect(result.presignedUrl).toBeDefined();
    });
  });

  describe('6. Controller Delivery Modes & Status Codes', () => {
    it('should return JSON with presigned URL when download=true', async () => {
      const res: any = {
        setHeader: jest.fn(),
        json: jest.fn(),
        redirect: jest.fn(),
        end: jest.fn(),
      };

      await pdfController.getFormISanctionPdf(
        'chit-group-uuid-1',
        true,
        'false',
        'false',
        partnerUser,
        res,
      );

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'statutory/form-i/chit-group-uuid-1.pdf',
          presignedUrl: expect.stringContaining('statutory/form-i'),
          expiresInSeconds: 900,
        }),
      );
    });

    it('should stream binary PDF directly when stream=true', async () => {
      const res: any = {
        setHeader: jest.fn(),
        json: jest.fn(),
        redirect: jest.fn(),
        end: jest.fn(),
      };

      await pdfController.getFormIiRegistrationPdf(
        'chit-group-uuid-1',
        false,
        'false',
        'true',
        partnerUser,
        res,
      );

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('form-ii-registration'),
      );
      expect(res.end).toHaveBeenCalledWith(expect.any(Buffer));
    });
  });
});
