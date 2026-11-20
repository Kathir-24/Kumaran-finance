import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import PDFDocument from 'pdfkit';
import type { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { FontResolverHelper } from '../../src/pdf/helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../../src/pdf/helpers/rupee-words.helper';
import { PdfController } from '../../src/pdf/pdf.controller';
import { PdfService } from '../../src/pdf/pdf.service';
import { FormXviiMinutesTemplate } from '../../src/pdf/templates/form-xvii-minutes.template';
import { FormXxiPassbookTemplate } from '../../src/pdf/templates/form-xxi-passbook.template';
import { PayoutVoucherTemplate } from '../../src/pdf/templates/payout-voucher.template';
import { SubscriptionReceiptTemplate } from '../../src/pdf/templates/subscription-receipt.template';
import { PrismaService } from '../../src/prisma/prisma.service';
import { DocumentAccessHelper } from '../../src/storage/helpers/document-access.helper';
import { StorageService } from '../../src/storage/storage.service';

describe('Component 2: Bilingual PDF Canvas Engine Tests', () => {
  let pdfService: PdfService;
  let prismaMock: any;
  let storageMock: any;

  const superAdminUser: JwtPayload = {
    sub: 'usr-admin-1',
    phone: '9842100001',
    roles: [Role.SUPER_ADMIN],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const branchManagerUser: JwtPayload = {
    sub: 'usr-bm-1',
    phone: '9842100002',
    roles: [Role.BRANCH_MANAGER],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const branchManagerOtherBranch: JwtPayload = {
    sub: 'usr-bm-2',
    phone: '9842100003',
    roles: [Role.BRANCH_MANAGER],
    branchId: 'branch-OTHER',
    tokenType: 'access',
  };

  const collectionAgent1: JwtPayload = {
    sub: 'usr-agent-1',
    phone: '9842100004',
    roles: [Role.COLLECTION_AGENT],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const collectionAgent2: JwtPayload = {
    sub: 'usr-agent-2',
    phone: '9842100005',
    roles: [Role.COLLECTION_AGENT],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const customerSundaram: JwtPayload = {
    sub: 'usr-cust-1',
    phone: '9842143210',
    roles: [Role.CUSTOMER],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const customerOther: JwtPayload = {
    sub: 'usr-cust-2',
    phone: '9999999999',
    roles: [Role.CUSTOMER],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  const auditorUser: JwtPayload = {
    sub: 'usr-audit-1',
    phone: '9842100099',
    roles: [Role.AUDITOR],
    branchId: 'branch-PRD',
    tokenType: 'access',
  };

  beforeEach(() => {
    prismaMock = {
      payment: {
        findUnique: jest.fn(),
      },
      receipt: {
        update: jest.fn(),
      },
      auctionWinner: {
        findUnique: jest.fn(),
      },
      auction: {
        findUnique: jest.fn(),
      },
      subscriberTicket: {
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
      uploadFile: jest.fn().mockImplementation(
        async (key: string, buffer: Buffer, mimeType = 'application/pdf') => ({
          key,
          url: `/api/v1/storage/file/${key}`,
          sizeBytes: buffer?.length ?? 1024,
          mimeType,
        }),
      ),
      getFile: jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF-1.4 pre-rendered-receipt-content'),
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      }),
      getPresignedUrl: jest.fn().mockResolvedValue('https://storage.kumaranfinance.in/signed-url?exp=900'),
    };

    pdfService = new PdfService(
      prismaMock as unknown as PrismaService,
      storageMock as unknown as StorageService,
    );
  });


  describe('1. RupeeWordsHelper (English & Tamil Whole-Rupee Conversion)', () => {
    it('should convert amounts into correct English words', () => {
      expect(RupeeWordsHelper.toEnglishWords(0n)).toBe('Zero Rupees Only');
      expect(RupeeWordsHelper.toEnglishWords(3750n)).toBe('Three Thousand Seven Hundred Fifty Rupees Only');
      expect(RupeeWordsHelper.toEnglishWords(5000n)).toBe('Five Thousand Rupees Only');
      expect(RupeeWordsHelper.toEnglishWords(25000n)).toBe('Twenty Five Thousand Rupees Only');
      expect(RupeeWordsHelper.toEnglishWords(100000n)).toBe('One Lakh Rupees Only');
    });

    it('should convert amounts into correct Tamil words', () => {
      expect(RupeeWordsHelper.toTamilWords(0n)).toBe('ரூபாய் பூஜ்ஜியம் மட்டும்');
      expect(RupeeWordsHelper.toTamilWords(3750n)).toBe('ரூபாய் மூன்றாயிரத்து எழுநூற்று ஐம்பது மட்டும்');
      expect(RupeeWordsHelper.toTamilWords(5000n)).toBe('ரூபாய் ஐந்தாயிரம் மட்டும்');
      expect(RupeeWordsHelper.toTamilWords(25000n)).toBe('ரூபாய் இருபத்தைந்து ஆயிரம் மட்டும்');
      expect(RupeeWordsHelper.toTamilWords(100000n)).toBe('ரூபாய் ஒரு லட்சம் மட்டும்');
    });
  });

  describe('2. FontResolverHelper', () => {
    it('should locate the bundled Noto Sans Tamil fonts', () => {
      const reg = FontResolverHelper.getTamilRegularFont();
      const bold = FontResolverHelper.getTamilBoldFont();

      expect(reg).toBeDefined();
      expect(bold).toBeDefined();
      expect(reg).toContain('NotoSansTamil-Regular.ttf');
      expect(bold).toContain('NotoSansTamil-Bold.ttf');
    });
  });

  describe('3. Canvas Templates Generation (Buffer & PDF Header Verification)', () => {
    it('should generate a valid subscription receipt PDF buffer', async () => {
      const buffer = await SubscriptionReceiptTemplate.generate({
        receiptNumber: 'KC-REC-PRD-2026-00412',
        date: new Date('2026-10-18T10:45:00Z'),
        groupCode: 'KCA-1L-20M-01',
        installmentMonth: 4,
        durationMonths: 20,
        ticketNumber: 7,
        subscriberName: 'S. Sundaram',
        subscriberNameTamil: 'சுந்தரம்',
        address: '14, Netaji Road, Perundurai',
        phone: '9842143210',
        baseInstallment: 5000n,
        dividendDeduction: 1250n,
        netPayableAmount: 3750n,
        amountPaid: 3750n,
        paymentMethod: 'CASH',
        collectedByName: 'M. Kathiresan (AG-01)',
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(500);
      // Valid PDF magic bytes '%PDF-'
      expect(buffer.toString('utf8', 0, 5)).toBe('%PDF-');
    });

    it('KFC-PDF-001: should generate valid subscription receipt PDF with bilingual CANCELLED watermark for reversed payments', async () => {
      const receiptData = {
        receiptNumber: 'KC-REC-PRD-2026-00412',
        date: new Date('2026-10-18T10:45:00Z'),
        groupCode: 'KCA-1L-20M-01',
        installmentMonth: 4,
        durationMonths: 20,
        ticketNumber: 7,
        subscriberName: 'S. Sundaram',
        subscriberNameTamil: 'சுந்தரம்',
        address: '14, Netaji Road, Perundurai',
        phone: '9842143210',
        baseInstallment: 5000n,
        dividendDeduction: 1250n,
        netPayableAmount: 3750n,
        amountPaid: 3750n,
        paymentMethod: 'CASH',
        collectedByName: 'M. Kathiresan (AG-01)',
      };

      const uncancelledBuffer = await SubscriptionReceiptTemplate.generate({
        ...receiptData,
        isCancelled: false,
      });

      const cancelledBuffer = await SubscriptionReceiptTemplate.generate({
        ...receiptData,
        isCancelled: true, // Reversed payment watermark
      });

      expect(cancelledBuffer).toBeInstanceOf(Buffer);
      expect(cancelledBuffer.length).toBeGreaterThan(500);
      expect(cancelledBuffer.toString('utf8', 0, 5)).toBe('%PDF-');

      // Assert watermark adds additional graphics state operators (save/rotate/color/restore)
      expect(cancelledBuffer.length).toBeGreaterThan(uncancelledBuffer.length);
    });

    it('should generate a valid bilingual prize payout voucher PDF buffer', async () => {
      const buffer = await PayoutVoucherTemplate.generate({
        voucherNumber: 'KC-VOU-PRD-2026-00001',
        disbursedAt: new Date('2026-10-18T16:00:00Z'),
        groupCode: 'KCA-1L-20M-01',
        chitValue: 100000n,
        installmentMonth: 4,
        auctionDate: new Date('2026-10-18T10:00:00Z'),
        ticketNumber: 7,
        winnerCode: 'KC-CUST-00007',
        winnerName: 'S. Sundaram',
        winnerNameTamil: 'சுந்தரம்',
        phone: '9842143210',
        bidDiscount: 25000n,
        netPrizeMoney: 75000n,
        disbursementMode: 'BANK_TRANSFER_NEFT',
        paymentReference: 'NEFT-AXIS-009988',
        agreementSigned: true,
        nomineeSigned: true,
        isSecurityRequired: false,
        verifiedByUserName: 'Staff Maker',
        authorizedByUserName: 'Partner Checker',
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString('utf8', 0, 5)).toBe('%PDF-');
    });

    it('should generate a valid Form XVII auction minutes PDF buffer', async () => {
      const buffer = await FormXviiMinutesTemplate.generate({
        groupCode: 'KCA-1L-20M-01',
        groupName: 'Perundurai 1 Lakh',
        chitValue: 100000n,
        durationMonths: 20,
        baseInstallment: 5000n,
        installmentMonth: 4,
        auctionDate: new Date('2026-10-18T10:00:00Z'),
        bidDiscount: 25000n,
        foremanCommissionAmount: 4000n,
        totalDividend: 21000n,
        dividendPerTicket: 1050n,
        nextMonthNetInstallment: 3950n,
        prizeMoney: 75000n,
        winnerTicketNumber: 7,
        winnerName: 'S. Sundaram',
        winnerCustomerCode: 'KC-CUST-00007',
        winnerPhone: '9842143210',
        wasTieBreakWinner: true,
        tiedBidders: [
          { ticketNumber: 7, customerName: 'S. Sundaram', tokenNumberDrawn: 1, isWinner: true },
          { ticketNumber: 12, customerName: 'L. Loganathan', tokenNumberDrawn: 2, isWinner: false },
        ],
        subscribersPresent: 18,
        minutesText: 'Auction conducted peacefully.',
        signedByForeman: true,
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString('utf8', 0, 5)).toBe('%PDF-');
    });

    it('should generate a valid Form XXI subscriber passbook ledger PDF buffer', async () => {
      const buffer = await FormXxiPassbookTemplate.generate({
        groupCode: 'KCA-1L-20M-01',
        groupName: 'Perundurai 1 Lakh',
        chitValue: 100000n,
        durationMonths: 20,
        baseInstallment: 5000n,
        ticketNumber: 7,
        isPrized: false,
        customerCode: 'KC-CUST-00007',
        customerName: 'S. Sundaram',
        phone: '9842143210',
        totalGrossDue: 20000n,
        totalDividendCredit: 3300n,
        totalNetPayable: 16700n,
        totalPaid: 16700n,
        totalOutstandingArrears: 0n,
        schedule: [
          {
            installmentMonth: 1,
            dueDate: new Date('2026-01-18'),
            grossAmount: 5000n,
            dividendDeduction: 0n,
            netPayableAmount: 5000n,
            paidAmount: 5000n,
            status: 'PAID',
            paymentDate: new Date('2026-01-15'),
            receiptNumber: 'KC-REC-PRD-2026-00001',
          },
        ],
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString('utf8', 0, 5)).toBe('%PDF-');
    });
  });

  describe('4. PdfService Storage Integration & Receipt Access Control', () => {
    const mockPaymentData = {
      id: 'pay-001',
      branchId: 'branch-PRD',
      amount: 3750n,
      paymentMethod: 'CASH',
      createdAt: new Date('2026-10-18T10:00:00Z'),
      recordedByUserId: 'usr-agent-1',
      recordedByUser: { name: 'M. Kathiresan' },
      receipt: { id: 'rec-001', receiptNumber: 'KC-REC-PRD-2026-00045' },
      allocations: [
        {
          due: {
            installmentMonth: 4,
            grossAmount: 5000n,
            dividendDeduction: 1250n,
            netPayableAmount: 3750n,
          },
          ticket: {
            ticketNumber: 7,
            customer: {
              fullName: 'S. Sundaram',
              fullNameTamil: 'சுந்தரம்',
              addressLine1: '14, Netaji Road',
              city: 'Perundurai',
              phone: '9842143210',
            },
            chitGroup: {
              groupCode: 'KCA-1L-20M-01',
              durationMonths: 20,
              branch: { id: 'branch-PRD', code: 'PRD', name: 'Head Office', address: 'Perundurai', phone: '9876543210' },
            },
          },
        },
      ],
    };

    it('should generate receipt PDF, save to storage, update DB, and return presigned URL for SUPER_ADMIN', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPaymentData);

      const result = await pdfService.generateReceiptPdf('pay-001', superAdminUser);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(storageMock.uploadFile).toHaveBeenCalled();
      expect(prismaMock.receipt.update).toHaveBeenCalledWith({
        where: { id: 'rec-001' },
        data: expect.objectContaining({ pdfS3Key: expect.any(String) }),
      });
      expect(storageMock.getPresignedUrl).toHaveBeenCalledWith(expect.any(String), 900);
      expect(result.presignedUrl).toBe('https://storage.kumaranfinance.in/signed-url?exp=900');
    });

    it('should pre-render receipt PDF when requestingUser is omitted (background BullMQ worker mode)', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPaymentData);

      const result = await pdfService.generateReceiptPdf('pay-001');

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(storageMock.uploadFile).toHaveBeenCalled();
      expect(prismaMock.receipt.update).toHaveBeenCalledWith({
        where: { id: 'rec-001' },
        data: expect.objectContaining({ pdfS3Key: expect.any(String) }),
      });
      expect(result.presignedUrl).toBe('https://storage.kumaranfinance.in/signed-url?exp=900');
    });

    it('should return pre-rendered PDF directly if receipt.pdfS3Key already exists without regenerating', async () => {
      const mockPaymentWithS3Key = {
        ...mockPaymentData,
        receipt: {
          id: 'rec-001',
          receiptNumber: 'KC-REC-PRD-2026-00045',
          pdfS3Key: 'receipts/PRD/2026/KC-REC-001.pdf',
        },
      };
      prismaMock.payment.findUnique.mockResolvedValue(mockPaymentWithS3Key);

      const result = await pdfService.generateReceiptPdf('pay-001', superAdminUser);

      expect(storageMock.getFile).toHaveBeenCalledWith('receipts/PRD/2026/KC-REC-001.pdf');
      expect(result.key).toBe('receipts/PRD/2026/KC-REC-001.pdf');
      expect(result.presignedUrl).toBe('https://storage.kumaranfinance.in/signed-url?exp=900');
    });

    it('KFC-PDF-001: should BYPASS pre-rendered cache and regenerate watermarked cancelled PDF when payment is REVERSED', async () => {
      const mockReversedPaymentWithOldS3Key = {
        ...mockPaymentData,
        paymentStatus: 'REVERSED',
        receipt: {
          id: 'rec-001',
          receiptNumber: 'KC-REC-PRD-2026-00045',
          pdfS3Key: 'receipts/PRD/2026/KC-REC-001.pdf', // Old uncancelled key
        },
      };
      prismaMock.payment.findUnique.mockResolvedValue(mockReversedPaymentWithOldS3Key);

      const result = await pdfService.generateReceiptPdf('pay-001', superAdminUser);

      // Must NOT return the old uncancelled key
      expect(result.key).toContain('-cancelled.pdf');
      expect(storageMock.uploadFile).toHaveBeenCalledWith(
        expect.stringContaining('-cancelled.pdf'),
        expect.any(Buffer),
        'application/pdf',
      );
      expect(prismaMock.receipt.update).toHaveBeenCalledWith({
        where: { id: 'rec-001' },
        data: expect.objectContaining({ pdfS3Key: expect.stringContaining('-cancelled.pdf') }),
      });
    });

    it('should allow customer to download their own receipt', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPaymentData);

      const result = await pdfService.generateReceiptPdf('pay-001', customerSundaram);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should block customer from downloading another customer receipt (OWASP BOLA protection)', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPaymentData);

      await expect(
        pdfService.generateReceiptPdf('pay-001', customerOther),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow collection agent to download receipt they personally recorded', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPaymentData);

      const result = await pdfService.generateReceiptPdf('pay-001', collectionAgent1);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should block collection agent from downloading receipt recorded by another agent', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPaymentData);

      await expect(
        pdfService.generateReceiptPdf('pay-001', collectionAgent2),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block branch manager from another branch from accessing receipt', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPaymentData);

      await expect(
        pdfService.generateReceiptPdf('pay-001', branchManagerOtherBranch),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if payment has no receipt', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(null);
      await expect(
        pdfService.generateReceiptPdf('missing-id', superAdminUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('5. Prize Payout Voucher Access Control', () => {
    const mockWinnerData = {
      auctionId: 'auc-001',
      disbursementStatus: 'DISBURSED',
      disbursedAmount: 75000n,
      disbursementMode: 'CASH',
      paymentReference: 'VOU-001',
      agreementSigned: true,
      nomineeSigned: true,
      isSecurityRequired: false,
      disbursedAt: new Date(),
      verifiedByUserId: 'usr-bm-1',
      authorizedByUserId: 'usr-admin-1',
      auction: {
        installmentMonth: 4,
        auctionDate: new Date(),
        bidDiscount: 25000n,
        chitGroup: {
          groupCode: 'KCA-1L-20M-01',
          chitValue: 100000n,
          branchId: 'branch-PRD',
          branch: { id: 'branch-PRD', code: 'PRD', name: 'Head Office', address: 'Perundurai' },
        },
      },
      ticket: {
        ticketNumber: 7,
        customer: {
          customerCode: 'KC-CUST-00007',
          fullName: 'S. Sundaram',
          fullNameTamil: 'சுந்தரம்',
          phone: '9842143210',
        },
      },
    };

    it('should allow winner customer to download their own payout voucher', async () => {
      prismaMock.auctionWinner.findUnique.mockResolvedValue(mockWinnerData);
      prismaMock.user.findUnique.mockResolvedValue({ name: 'Staff' });

      const result = await pdfService.generatePayoutVoucherPdf('auc-001', customerSundaram);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should block other customers from downloading winner payout voucher', async () => {
      prismaMock.auctionWinner.findUnique.mockResolvedValue(mockWinnerData);

      await expect(
        pdfService.generatePayoutVoucherPdf('auc-001', customerOther),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should strictly block collection agents from accessing prize payout vouchers', async () => {
      prismaMock.auctionWinner.findUnique.mockResolvedValue(mockWinnerData);

      await expect(
        pdfService.generatePayoutVoucherPdf('auc-001', collectionAgent1),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('6. Statutory Form XVII Auction Minutes Access Control', () => {
    const mockAuctionData = {
      id: 'auc-001',
      status: 'COMPLETED',
      installmentMonth: 4,
      auctionDate: new Date(),
      bidDiscount: 25000n,
      foremanCommissionAmount: 4000n,
      totalDividend: 21000n,
      dividendPerTicket: 1050n,
      prizeMoney: 75000n,
      chitGroup: {
        id: 'group-001',
        groupCode: 'KCA-1L-20M-01',
        groupName: 'Perundurai 1 Lakh',
        chitValue: 100000n,
        durationMonths: 20,
        baseInstallment: 5000n,
        sanctionOrderNumber: 'ROC/CHIT/2026/01',
        branchId: 'branch-PRD',
        branch: { name: 'Head Office' },
      },
      winner: {
        wasTieBreakWinner: false,
        ticket: {
          ticketNumber: 7,
          customer: {
            customerCode: 'KC-CUST-00007',
            fullName: 'S. Sundaram',
            fullNameTamil: 'சுந்தரம்',
            phone: '9842143210',
          },
        },
      },
      tieBidders: [],
      minutes: {
        subscribersPresent: 18,
        minutesText: 'Minutes recorded',
        signedByForeman: true,
      },
    };

    it('should allow Super Admin and Branch Manager to download Form XVII minutes', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockAuctionData);

      const result = await pdfService.generateAuctionMinutesPdf('auc-001', branchManagerUser);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should block customers from accessing internal statutory minutes', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockAuctionData);

      await expect(
        pdfService.generateAuctionMinutesPdf('auc-001', customerSundaram),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block collection agents from accessing statutory minutes', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockAuctionData);

      await expect(
        pdfService.generateAuctionMinutesPdf('auc-001', collectionAgent1),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('7. Form XXI Continuous Passbook Access Control', () => {
    const mockTicketData = {
      id: 'tkt-001',
      ticketNumber: 7,
      isPrized: false,
      chitGroup: {
        id: 'group-001',
        groupCode: 'KCA-1L-20M-01',
        groupName: 'Perundurai 1 Lakh',
        chitValue: 100000n,
        durationMonths: 20,
        baseInstallment: 5000n,
        branchId: 'branch-PRD',
      },
      customer: {
        customerCode: 'KC-CUST-00007',
        fullName: 'S. Sundaram',
        fullNameTamil: 'சுந்தரம்',
        phone: '9842143210',
      },
      dues: [
        {
          installmentMonth: 1,
          dueDate: new Date('2026-01-18'),
          grossAmount: 5000n,
          dividendDeduction: 0n,
          netPayableAmount: 5000n,
          paidAmount: 5000n,
          status: 'PAID',
          allocations: [],
        },
      ],
    };

    it('should allow customer to download their own passbook statement', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicketData);

      const result = await pdfService.generatePassbookPdf('tkt-001', customerSundaram);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should block a customer from downloading another customer passbook', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicketData);

      await expect(
        pdfService.generatePassbookPdf('tkt-001', customerOther),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block collection agents from downloading member passbook statements', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicketData);

      await expect(
        pdfService.generatePassbookPdf('tkt-001', collectionAgent1),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('8. DocumentAccessHelper Storage Key Category Access', () => {
    it('should allow Super Admin and Auditor full access to any key', async () => {
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess('kyc/cust-1/aadhaar.pdf', superAdminUser),
      ).resolves.toBeUndefined();
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess('safety-proof/group-1/cheque.pdf', auditorUser),
      ).resolves.toBeUndefined();
    });

    it('should prevent collection agents from accessing customer KYC files', async () => {
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess('kyc/cust-1/aadhaar.pdf', collectionAgent1),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent customer from accessing another customer KYC file', async () => {
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess('kyc/other-cust-id/pan.pdf', customerSundaram),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow customer to access their own KYC folder', async () => {
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(`kyc/${customerSundaram.sub}/aadhaar.pdf`, customerSundaram),
      ).resolves.toBeUndefined();
    });

    it('should prevent customer and collection agents from accessing internal safety-proof and minutes keys', async () => {
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess('minutes/group-1/m4.pdf', customerSundaram),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        DocumentAccessHelper.assertStorageKeyAccess('safety-proof/auc-1/cheque.pdf', collectionAgent1),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should restrict direct storage access to receipts and vouchers for customer and collection agents', async () => {
      // Customer blocked from raw storage path
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess('receipts/PRD/2026/KC-REC-001.pdf', customerSundaram),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        DocumentAccessHelper.assertStorageKeyAccess('vouchers/PRD/2026/KC-VOU-001.pdf', customerSundaram),
      ).rejects.toThrow(ForbiddenException);

      // Collection agent blocked from raw storage path
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess('receipts/PRD/2026/KC-REC-001.pdf', collectionAgent1),
      ).rejects.toThrow(ForbiddenException);

      // Super Admin and Auditor permitted
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess('receipts/PRD/2026/KC-REC-001.pdf', superAdminUser),
      ).resolves.toBeUndefined();
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess('vouchers/PRD/2026/KC-VOU-001.pdf', auditorUser),
      ).resolves.toBeUndefined();
    });
  });

  describe('9. PdfController HTTP 302 S3/CDN Redirects & Streaming Fallback', () => {
    let controller: PdfController;
    let mockRes: any;

    const controllerPayment = {
      id: 'pay-001',
      branchId: 'branch-PRD',
      amount: 3750n,
      paymentMethod: 'CASH',
      createdAt: new Date('2026-10-18T10:00:00Z'),
      recordedByUserId: 'usr-agent-1',
      recordedByUser: { name: 'M. Kathiresan' },
      receipt: { id: 'rec-001', receiptNumber: 'KC-REC-PRD-2026-00045' },
      allocations: [
        {
          due: {
            installmentMonth: 4,
            grossAmount: 5000n,
            dividendDeduction: 1250n,
            netPayableAmount: 3750n,
          },
          ticket: {
            ticketNumber: 7,
            customer: {
              fullName: 'S. Sundaram',
              fullNameTamil: 'சுந்தரம்',
              addressLine1: '14, Netaji Road',
              city: 'Perundurai',
              phone: '9842143210',
            },
            chitGroup: {
              groupCode: 'KCA-1L-20M-01',
              durationMonths: 20,
              branch: { id: 'branch-PRD', code: 'PRD', name: 'Head Office', address: 'Perundurai', phone: '9876543210' },
            },
          },
        },
      ],
    };

    const controllerWinner = {
      auctionId: 'auc-001',
      disbursementStatus: 'DISBURSED',
      disbursedAmount: 75000n,
      disbursementMode: 'CASH',
      paymentReference: 'VOU-001',
      agreementSigned: true,
      nomineeSigned: true,
      isSecurityRequired: false,
      disbursedAt: new Date(),
      verifiedByUserId: 'usr-bm-1',
      authorizedByUserId: 'usr-admin-1',
      auction: {
        installmentMonth: 4,
        auctionDate: new Date(),
        bidDiscount: 25000n,
        chitGroup: {
          groupCode: 'KCA-1L-20M-01',
          chitValue: 100000n,
          branchId: 'branch-PRD',
          branch: { id: 'branch-PRD', code: 'PRD', name: 'Head Office', address: 'Perundurai' },
        },
      },
      ticket: {
        ticketNumber: 7,
        customer: {
          customerCode: 'KC-CUST-00007',
          fullName: 'S. Sundaram',
          fullNameTamil: 'சுந்தரம்',
          phone: '9842143210',
        },
      },
    };

    const controllerAuction = {
      id: 'auc-001',
      status: 'COMPLETED',
      installmentMonth: 4,
      auctionDate: new Date('2026-10-18T10:00:00Z'),
      bidDiscount: 25000n,
      foremanCommissionAmount: 4000n,
      totalDividend: 21000n,
      dividendPerTicket: 1050n,
      prizeMoney: 75000n,
      chitGroup: {
        id: 'group-001',
        groupCode: 'KCA-1L-20M-01',
        groupName: 'Perundurai 1 Lakh',
        chitValue: 100000n,
        durationMonths: 20,
        baseInstallment: 5000n,
        sanctionOrderNumber: 'ROC/CHIT/2026/01',
        branchId: 'branch-PRD',
        branch: { name: 'Head Office' },
      },
      winner: {
        wasTieBreakWinner: false,
        ticket: {
          ticketNumber: 7,
          customer: {
            customerCode: 'KC-CUST-00007',
            fullName: 'S. Sundaram',
            fullNameTamil: 'சுந்தரம்',
            phone: '9842143210',
          },
        },
      },
      tieBidders: [],
      minutes: {
        subscribersPresent: 18,
        minutesText: 'Minutes recorded',
        signedByForeman: true,
      },
    };

    const controllerTicket = {
      id: 'tkt-001',
      ticketNumber: 7,
      isPrized: false,
      chitGroup: {
        id: 'group-001',
        groupCode: 'KCA-1L-20M-01',
        groupName: 'Perundurai 1 Lakh',
        chitValue: 100000n,
        durationMonths: 20,
        baseInstallment: 5000n,
        branchId: 'branch-PRD',
      },
      customer: {
        customerCode: 'KC-CUST-00007',
        fullName: 'S. Sundaram',
        fullNameTamil: 'சுந்தரம்',
        phone: '9842143210',
      },
      dues: [
        {
          installmentMonth: 1,
          dueDate: new Date('2026-01-18'),
          grossAmount: 5000n,
          dividendDeduction: 0n,
          netPayableAmount: 5000n,
          paidAmount: 5000n,
          status: 'PAID',
          allocations: [],
        },
      ],
    };

    beforeEach(() => {
      controller = new PdfController(pdfService);
      mockRes = {
        redirect: jest.fn(),
        json: jest.fn(),
        setHeader: jest.fn(),
        end: jest.fn(),
      };
    });

    it('should redirect to presigned S3 URL when redirect=true on receipt PDF', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(controllerPayment);

      await controller.getReceiptPdf('pay-001', false, 'true', 'false', superAdminUser, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        'https://storage.kumaranfinance.in/signed-url?exp=900',
      );
      expect(mockRes.end).not.toHaveBeenCalled();
    });

    it('should return JSON payload when download=true on receipt PDF', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(controllerPayment);

      await controller.getReceiptPdf('pay-001', true, 'false', 'false', superAdminUser, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        key: expect.any(String),
        presignedUrl: 'https://storage.kumaranfinance.in/signed-url?exp=900',
        expiresInSeconds: 900,
      });
      expect(mockRes.redirect).not.toHaveBeenCalled();
    });

    it('should stream binary buffer when neither redirect nor download is true', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(controllerPayment);

      await controller.getReceiptPdf('pay-001', false, 'false', 'true', superAdminUser, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.end).toHaveBeenCalledWith(expect.any(Buffer));
      expect(mockRes.redirect).not.toHaveBeenCalled();
    });

    it('should redirect to presigned URL when redirect=true on payout voucher PDF', async () => {
      prismaMock.auctionWinner.findUnique.mockResolvedValue(controllerWinner);

      await controller.getVoucherPdf('auc-001', false, 'true', 'false', superAdminUser, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        'https://storage.kumaranfinance.in/signed-url?exp=900',
      );
    });

    it('should redirect to presigned URL when redirect=true on Form XVII minutes PDF', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(controllerAuction);

      await controller.getMinutesPdf('auc-001', false, 'true', 'false', superAdminUser, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        'https://storage.kumaranfinance.in/signed-url?exp=900',
      );
    });

    it('should redirect to presigned URL when redirect=true on Form XXI passbook PDF', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(controllerTicket);

      await controller.getPassbookPdf('tkt-001', false, 'true', 'false', superAdminUser, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        'https://storage.kumaranfinance.in/signed-url?exp=900',
      );
    });
  });

  describe('7. DEF-BE-02: Canonical Branch.code Storage Key Generation & Self-Healing', () => {
    const uuidBranchId = '07c70d9d-a8aa-45d3-b34e-15a2dd0cc88c';

    const buildReceiptPayment = (
      branch: { id: string; code?: string | null; name: string; address: string; phone: string },
      pdfS3Key?: string,
    ) => ({
      id: 'pay-be02-001',
      branchId: branch.id,
      amount: 3750n,
      paymentMethod: 'CASH',
      createdAt: new Date('2026-10-18T10:00:00Z'),
      recordedByUserId: 'usr-agent-1',
      recordedByUser: { name: 'M. Kathiresan' },
      receipt: {
        id: 'rec-be02-001',
        receiptNumber: 'KC-REC-PRD-2026-00014',
        ...(pdfS3Key ? { pdfS3Key } : {}),
      },
      allocations: [
        {
          due: {
            installmentMonth: 4,
            grossAmount: 5000n,
            dividendDeduction: 1250n,
            netPayableAmount: 3750n,
          },
          ticket: {
            ticketNumber: 7,
            customer: {
              fullName: 'S. Sundaram',
              fullNameTamil: 'சுந்தரம்',
              addressLine1: '14, Netaji Road',
              city: 'Perundurai',
              phone: '9842143210',
            },
            chitGroup: {
              groupCode: 'KCA-1L-20M-01',
              durationMonths: 20,
              branch,
            },
          },
        },
      ],
    });

    const buildVoucherWinner = (
      branch: { id: string; code?: string | null; name: string; address: string },
      paymentReference = 'KC-VOU-PRD-2026-00004',
    ) => ({
      auctionId: 'auc-be02-001',
      disbursementStatus: 'DISBURSED',
      disbursedAmount: 75000n,
      disbursementMode: 'CASH',
      paymentReference,
      agreementSigned: true,
      nomineeSigned: true,
      isSecurityRequired: false,
      disbursedAt: new Date('2026-10-18T10:00:00Z'),
      verifiedByUserId: 'usr-bm-1',
      authorizedByUserId: 'usr-admin-1',
      auction: {
        installmentMonth: 4,
        auctionDate: new Date('2026-10-10T10:00:00Z'),
        bidDiscount: 25000n,
        chitGroup: {
          groupCode: 'KCA-1L-20M-01',
          chitValue: 100000n,
          branchId: branch.id,
          branch,
        },
      },
      ticket: {
        ticketNumber: 7,
        customer: {
          customerCode: 'KC-CUST-00007',
          fullName: 'S. Sundaram',
          fullNameTamil: 'சுந்தரம்',
          phone: '9842143210',
        },
      },
    });

    it.each(['PRD', 'ERD', 'CBE-01'])(
      'N1: should store receipt and payout voucher under Branch.code "%s" instead of UUID tail',
      async (branchCode) => {
        const payment = buildReceiptPayment({
          id: uuidBranchId,
          code: branchCode,
          name: `Branch ${branchCode}`,
          address: 'Tamil Nadu',
          phone: '9876543210',
        });
        const expectedReceiptKey = `receipts/${branchCode}/2026/KC-REC-PRD-2026-00014.pdf`;
        prismaMock.payment.findUnique.mockResolvedValue(payment);

        const receiptRes = await pdfService.generateReceiptPdf('pay-be02-001', superAdminUser);

        expect(receiptRes.key).toBe(expectedReceiptKey);
        expect(receiptRes.key).not.toContain('15a2dd0cc88c');
        expect(storageMock.uploadFile).toHaveBeenCalledWith(
          expectedReceiptKey,
          expect.any(Buffer),
          'application/pdf',
        );
        expect(prismaMock.receipt.update).toHaveBeenCalledWith({
          where: { id: 'rec-be02-001' },
          data: { pdfS3Key: expectedReceiptKey },
        });

        const winner = buildVoucherWinner(
          {
            id: uuidBranchId,
            code: branchCode,
            name: `Branch ${branchCode}`,
            address: 'Tamil Nadu',
          },
          'NEFT-AXIS-009988',
        );
        const expectedVoucherKey = `vouchers/${branchCode}/2026/KC-VOU-${branchCode}-2026-KCA-1L-20M-01-00004.pdf`;
        prismaMock.auctionWinner.findUnique.mockResolvedValue(winner);
        prismaMock.user.findUnique.mockResolvedValue({ name: 'Staff' });

        const voucherRes = await pdfService.generatePayoutVoucherPdf('auc-be02-001', superAdminUser);

        expect(voucherRes.key).toBe(expectedVoucherKey);
        expect(voucherRes.key).not.toContain('15a2dd0cc88c');
        expect(voucherRes.key).not.toContain('NEFT-AXIS-009988');
        expect(storageMock.uploadFile).toHaveBeenCalledWith(
          expectedVoucherKey,
          expect.any(Buffer),
          'application/pdf',
        );
      },
    );

    it('N2: should fall back strictly to PRD when branch.code is omitted or null', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(
        buildReceiptPayment({
          id: uuidBranchId,
          code: undefined,
          name: 'Legacy Branch',
          address: 'Perundurai',
          phone: '9876543210',
        }),
      );

      const receiptRes = await pdfService.generateReceiptPdf('pay-be02-001', superAdminUser);
      expect(receiptRes.key).toBe('receipts/PRD/2026/KC-REC-PRD-2026-00014.pdf');
      expect(receiptRes.key).not.toContain('undefined');
      expect(receiptRes.key).not.toContain('15a2dd0cc88c');

      prismaMock.auctionWinner.findUnique.mockResolvedValue(
        buildVoucherWinner({
          id: uuidBranchId,
          code: null,
          name: 'Legacy Branch',
          address: 'Perundurai',
        }),
      );
      prismaMock.user.findUnique.mockResolvedValue({ name: 'Staff' });

      const voucherRes = await pdfService.generatePayoutVoucherPdf('auc-be02-001', superAdminUser);
      expect(voucherRes.key).toBe('vouchers/PRD/2026/KC-VOU-PRD-2026-KCA-1L-20M-01-00004.pdf');
      expect(voucherRes.key).not.toContain('null');
      expect(voucherRes.key).not.toContain('15a2dd0cc88c');
    });

    it('N3: should self-heal legacy UUID-keyed receipt to canonical Branch.code path when missing from storage', async () => {
      const legacyKey = 'receipts/15a2dd0cc88c/2026/KC-REC-PRD-2026-00014.pdf';
      const canonicalKey = 'receipts/PRD/2026/KC-REC-PRD-2026-00014.pdf';

      prismaMock.payment.findUnique.mockResolvedValue(
        buildReceiptPayment(
          {
            id: uuidBranchId,
            code: 'PRD',
            name: 'Head Office',
            address: 'Perundurai',
            phone: '9876543210',
          },
          legacyKey,
        ),
      );
      storageMock.getFile.mockRejectedValueOnce(new Error('NoSuchKey'));

      const result = await pdfService.generateReceiptPdf('pay-be02-001', superAdminUser);

      expect(storageMock.getFile).toHaveBeenCalledWith(legacyKey);
      expect(result.key).toBe(canonicalKey);
      expect(storageMock.uploadFile).toHaveBeenCalledWith(
        canonicalKey,
        expect.any(Buffer),
        'application/pdf',
      );
      expect(prismaMock.receipt.update).toHaveBeenCalledWith({
        where: { id: 'rec-be02-001' },
        data: { pdfS3Key: canonicalKey },
      });
    });
  });

  describe('10. Module 7 Forensic Remediation Suite (BigInt, Guardrails 2/3/9, BOLA, Voucher Parity, Header Sanitization)', () => {
    it('DEF-M7-PDF-01: RupeeWordsHelper uses pure BigInt math (zero Number overflow/paise) and fixes Tamil 13 & sub-thousand words', () => {
      // Pure BigInt above Number.MAX_SAFE_INTEGER (9,007,199,254,740,991) — would lose low digits with Number()
      const hugeAmount = 10_000_000_000_000_001n;
      const hugeEn = RupeeWordsHelper.toEnglishWords(hugeAmount);
      expect(hugeEn).toContain('One');
      expect(hugeEn).toContain('Crore');
      expect(hugeEn).not.toContain('undefined');
      expect(hugeEn).toMatch(/One Rupees Only$/);

      // Large crore amounts >= 1000 Crore must NEVER output "undefined Hundred Crore"
      expect(RupeeWordsHelper.toEnglishWords(20_000_000_000n)).toBe('Two Thousand Crore Rupees Only');
      expect(RupeeWordsHelper.toEnglishWords(10_000_000_000n)).toBe('One Thousand Crore Rupees Only');

      // Tamil 13 corruption fix ('பreleaseதின்மூன்று' -> 'பதிமூன்று')
      expect(RupeeWordsHelper.toTamilWords(13n)).toBe('ரூபாய் பதிமூன்று மட்டும்');
      expect(RupeeWordsHelper.toTamilWords(3713n)).toBe('ரூபாய் மூன்றாயிரத்து எழுநூற்று பதிமூன்று மட்டும்');
      expect(RupeeWordsHelper.toTamilWords(13n)).not.toContain('release');

      // Tamil sub-thousand conversion must NOT leak raw Arabic digits (e.g. 75,000 or 12,00,000)
      const ta75k = RupeeWordsHelper.toTamilWords(75000n);
      expect(ta75k).toBe('ரூபாய் எழுபத்தைந்து ஆயிரம் மட்டும்');
      expect(ta75k).not.toMatch(/[0-9]/);

      const ta12L = RupeeWordsHelper.toTamilWords(1200000n);
      expect(ta12L).toBe('ரூபாய் பன்னிரண்டு லட்சம் மட்டும்');
      expect(ta12L).not.toMatch(/[0-9]/);

      // Negative guard
      expect(RupeeWordsHelper.toEnglishWords(-5000n)).toBe('Minus Five Thousand Rupees Only');
      expect(RupeeWordsHelper.toTamilWords(-5000n)).toBe('கழித்தல் ரூபாய் ஐந்தாயிரம் மட்டும்');

      // Pure BigInt Indian grouping formatter (zero paise '.00', exact above MAX_SAFE_INTEGER)
      expect(RupeeWordsHelper.formatWholeRupees(0n)).toBe('0');
      expect(RupeeWordsHelper.formatWholeRupees(3750n)).toBe('3,750');
      expect(RupeeWordsHelper.formatWholeRupees(100000n)).toBe('1,00,000');
      expect(RupeeWordsHelper.formatWholeRupees(10_000_000_000_000_001n)).toBe('10,00,00,00,00,00,00,001');
      expect(RupeeWordsHelper.formatWholeRupees(100000n)).not.toContain('.00');

      // Dynamic frozen commission rate formatter
      expect(RupeeWordsHelper.formatCommissionRatePercent('5.00')).toBe('5.00%');
      expect(RupeeWordsHelper.formatCommissionRatePercent(3.5)).toBe('3.50%');
      expect(RupeeWordsHelper.formatCommissionRatePercent(null)).toBe('4.00%');
    });

    it('DEF-M7-PDF-02: FontResolverHelper falls back safely on corrupt font and sanitizes dates & Content-Disposition segments', () => {
      const fakeDoc = {
        font: jest.fn().mockImplementation((src: string) => {
          if (src.includes('corrupt')) {
            throw new Error('Invalid TTF header');
          }
        }),
      };

      const resolved = FontResolverHelper.resolveSafeFont(fakeDoc, '/tmp/corrupt.ttf', 'Helvetica');
      expect(resolved).toBe('Helvetica');
      expect(fakeDoc.font).toHaveBeenCalledWith('Helvetica');

      expect(FontResolverHelper.formatPdfDate(new Date('2026-10-18T00:00:00Z'))).toBe('2026-10-18');
      expect(FontResolverHelper.formatPdfDate('not-a-date')).toBe('-');
      expect(FontResolverHelper.formatPdfDate(null)).toBe('-');

      // CRLF / header / quote / path traversal injection sanitization
      const malicious = 'pay-001"\r\nX-Injected: evil; filename="../../etc/passwd';
      const safe = FontResolverHelper.sanitizeDispositionSegment(malicious, 'receipt');
      expect(safe).not.toMatch(/[\r\n";/\\]/);
      expect(safe).not.toContain('..');
      expect(safe.length).toBeGreaterThan(0);
    });

    it('DEF-M7-PDF-03 (Guardrail 3): Form XVII renders dynamic frozen foremanCommissionRate instead of hardcoded 4%', async () => {
      const renderedTexts: string[] = [];
      const origText = PDFDocument.prototype.text;
      jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (this: any, text: any) {
        renderedTexts.push(String(text));
        return origText.apply(this, arguments as any);
      });

      try {
        prismaMock.auction.findUnique.mockResolvedValue({
          id: 'auc-rate-5',
          status: 'COMPLETED',
          installmentMonth: 3,
          auctionDate: new Date('2026-10-18T10:00:00Z'),
          bidDiscount: 25000n,
          foremanCommissionRate: '5.00',
          foremanCommissionAmount: 5000n,
          totalDividend: 20000n,
          dividendPerTicket: 1000n,
          prizeMoney: 75000n,
          chitGroup: {
            id: 'group-5pct',
            groupCode: 'KCA-1L-20M-05',
            groupName: '5% Commission Group',
            chitValue: 100000n,
            durationMonths: 20,
            baseInstallment: 5000n,
            foremanCommissionRate: '5.00',
            branchId: 'branch-PRD',
            branch: { id: 'branch-PRD', code: 'PRD', name: 'Head Office', address: 'Perundurai' },
          },
          winner: {
            wasTieBreakWinner: false,
            ticket: {
              ticketNumber: 3,
              customer: {
                customerCode: 'KC-CUST-00003',
                fullName: 'R. Murugan',
                fullNameTamil: 'முருகன்',
                phone: '9842100033',
              },
            },
          },
          tieBidders: [],
          minutes: {
            subscribersPresent: 19,
            minutesText: 'Auction recorded at 5% commission.',
            signedByForeman: true,
          },
        });

        await pdfService.generateAuctionMinutesPdf('auc-rate-5', superAdminUser);

        const commLine = renderedTexts.find((t) => t.includes('Foreman Commission'));
        expect(commLine).toBeDefined();
        expect(commLine).toContain('(5.00%)');
        expect(commLine).not.toContain('(4%)');
        expect(commLine).not.toContain('(4.00%)');
      } finally {
        jest.restoreAllMocks();
      }
    });

    it('DEF-M7-PDF-04 (Module 6 Voucher Parity & ADR-15): Payout Voucher renders canonical KC-VOU number, arrears offset breakdown, and zero property documents', async () => {
      const renderedTexts: string[] = [];
      const origText = PDFDocument.prototype.text;
      jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (this: any, text: any) {
        renderedTexts.push(String(text));
        return origText.apply(this, arguments as any);
      });

      try {
        prismaMock.auctionWinner.findUnique.mockResolvedValue({
          auctionId: 'auc-arrears-01',
          disbursementStatus: 'DISBURSED',
          disbursedAmount: 65000n, // ₹75,000 gross prize - ₹10,000 arrears offset
          disbursementMode: 'BANK_TRANSFER_NEFT',
          paymentReference: 'UTR-KVB20261018001',
          agreementSigned: true,
          nomineeSigned: true,
          isSecurityRequired: true,
          securityType: 'PROMISSORY_NOTE',
          blankChequeDetails: null,
          disbursedAt: new Date('2026-10-18T12:00:00Z'),
          verifiedByUserId: 'usr-bm-1',
          authorizedByUserId: 'usr-admin-1',
          auction: {
            installmentMonth: 4,
            auctionDate: new Date('2026-10-10T10:00:00Z'),
            bidDiscount: 25000n,
            prizeMoney: 75000n,
            foremanCommissionRate: '4.00',
            foremanCommissionAmount: 4000n,
            chitGroup: {
              groupCode: 'KCA-1L-20M-01',
              chitValue: 100000n,
              foremanCommissionRate: '4.00',
              branchId: 'branch-PRD',
              branch: { id: 'branch-PRD', code: 'PRD', name: 'Head Office', address: 'Main Road, Perundurai' },
            },
          },
          ticket: {
            ticketNumber: 7,
            customer: {
              customerCode: 'KC-CUST-00007',
              fullName: 'S. Sundaram',
              fullNameTamil: 'சுந்தரம்',
              phone: '9842143210',
            },
          },
        });
        prismaMock.user.findUnique.mockResolvedValue({ name: 'Partner Checker' });

        const result = await pdfService.generatePayoutVoucherPdf('auc-arrears-01', superAdminUser);
        expect(result.key).toBe('vouchers/PRD/2026/KC-VOU-PRD-2026-KCA-1L-20M-01-00004.pdf');

        const allText = renderedTexts.join('\n');
        expect(allText).toContain('KC-VOU-PRD-2026-KCA-1L-20M-01-00004');
        expect(allText).toContain('UTR-KVB20261018001');
        expect(allText).toContain('Arrears Offset: - ₹ 10,000');
        expect(allText).toContain('Gross Prize: ₹ 75,000');
        expect(allText).toContain('NET PRIZE: ₹ 65,000');
        expect(allText).toContain('Promissory Note');
        // Guardrail 9 (ADR-15): Zero property deeds/documents
        expect(allText.toLowerCase()).not.toContain('property deed');
        expect(allText.toLowerCase()).not.toContain('mortgage');
      } finally {
        jest.restoreAllMocks();
      }
    });

    it('DEF-M7-PDF-05 (Fail-Closed Anti-BOLA): rejects null/undefined branchId for Branch Manager & Collection Agent, undefined phone bypass, and status oracle leaks', async () => {
      const bmNoBranch: JwtPayload = {
        sub: 'usr-bm-nobranch',
        phone: '9842100090',
        roles: [Role.BRANCH_MANAGER],
        branchId: null,
        tokenType: 'access',
      };
      const agentNoBranch: JwtPayload = {
        sub: 'usr-agent-1',
        phone: '9842100004',
        roles: [Role.COLLECTION_AGENT],
        branchId: undefined as any,
        tokenType: 'access',
      };
      const agentOtherBranch: JwtPayload = {
        sub: 'usr-agent-1', // Same recordedByUserId, DIFFERENT branchId!
        phone: '9842100004',
        roles: [Role.COLLECTION_AGENT],
        branchId: 'branch-OTHER',
        tokenType: 'access',
      };
      const custUndefinedPhone: JwtPayload = {
        sub: 'usr-cust-bad',
        phone: undefined as any,
        roles: [Role.CUSTOMER],
        branchId: 'branch-PRD',
        tokenType: 'access',
      };

      const receiptFixture = {
        id: 'pay-bola-01',
        branchId: 'branch-PRD',
        amount: 3750n,
        paymentMethod: 'CASH',
        createdAt: new Date('2026-10-18T10:00:00Z'),
        recordedByUserId: 'usr-agent-1',
        recordedByUser: { name: 'Agent' },
        receipt: { id: 'rec-b1', receiptNumber: 'KC-REC-PRD-2026-00099' },
        allocations: [
          {
            due: { installmentMonth: 1, grossAmount: 5000n, dividendDeduction: 0n, netPayableAmount: 5000n },
            ticket: {
              ticketNumber: 1,
              customer: { id: 'cust-real-id', fullName: 'S. Sundaram', phone: undefined as any, addressLine1: 'Rd', city: 'PRD' },
              chitGroup: { groupCode: 'KCA-1L-20M-01', durationMonths: 20, branchId: 'branch-PRD', branch: { code: 'PRD', name: 'HO', address: 'PRD', phone: '987' } },
            },
          },
        ],
      };

      prismaMock.payment.findUnique.mockResolvedValue(receiptFixture);
      await expect(pdfService.generateReceiptPdf('pay-bola-01', bmNoBranch)).rejects.toThrow(ForbiddenException);
      await expect(pdfService.generateReceiptPdf('pay-bola-01', agentNoBranch)).rejects.toThrow(ForbiddenException);
      await expect(pdfService.generateReceiptPdf('pay-bola-01', agentOtherBranch)).rejects.toThrow(ForbiddenException);
      await expect(pdfService.generateReceiptPdf('pay-bola-01', custUndefinedPhone)).rejects.toThrow(ForbiddenException);

      // Undisbursed winner: non-winner customer & collection agent MUST receive 403 Forbidden (not 404 status leak!)
      prismaMock.auctionWinner.findUnique.mockResolvedValue({
        auctionId: 'auc-pending',
        disbursementStatus: 'PENDING_VERIFICATION',
        auction: { installmentMonth: 2, auctionDate: new Date(), chitGroup: { branchId: 'branch-PRD' } },
        ticket: { ticketNumber: 7, customer: { id: 'cust-1', phone: '9842143210' } },
      });

      await expect(pdfService.generatePayoutVoucherPdf('auc-pending', customerOther)).rejects.toThrow(ForbiddenException);
      await expect(pdfService.generatePayoutVoucherPdf('auc-pending', collectionAgent1)).rejects.toThrow(ForbiddenException);
      await expect(pdfService.generatePayoutVoucherPdf('auc-pending', bmNoBranch)).rejects.toThrow(ForbiddenException);

      // Customer calling Form XVII minutes fails immediately with ForbiddenException before DB lookup
      prismaMock.auction.findUnique.mockClear();
      await expect(pdfService.generateAuctionMinutesPdf('auc-secret', customerSundaram)).rejects.toThrow(ForbiddenException);
      expect(prismaMock.auction.findUnique).not.toHaveBeenCalled();

      // Passbook: customer with mismatched customer.id rejected even if phone somehow matched
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: 'tkt-mismatch',
        ticketNumber: 1,
        isPrized: false,
        chitGroup: { id: 'grp-1', groupCode: 'KCA', groupName: 'G', chitValue: 100000n, durationMonths: 20, baseInstallment: 5000n, branchId: 'branch-PRD' },
        customer: { id: 'different-customer-uuid', customerCode: 'KC-CUST-1', fullName: 'Other', phone: customerSundaram.phone },
        dues: [],
      });
      await expect(pdfService.generatePassbookPdf('tkt-mismatch', customerSundaram)).rejects.toThrow(ForbiddenException);
      await expect(pdfService.generatePassbookPdf('tkt-mismatch', bmNoBranch)).rejects.toThrow(ForbiddenException);
    });

    it('DEF-M7-PDF-06: Form XXI passbook excludes REVERSED/FAILED payment allocations and selects active SUCCESS receipt', async () => {
      const renderedTexts: string[] = [];
      const origText = PDFDocument.prototype.text;
      jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (this: any, text: any) {
        renderedTexts.push(String(text));
        return origText.apply(this, arguments as any);
      });

      try {
        prismaMock.subscriberTicket.findUnique.mockResolvedValue({
          id: 'tkt-rev-01',
          ticketNumber: 7,
          isPrized: false,
          chitGroup: {
            id: 'group-001',
            groupCode: 'KCA-1L-20M-01',
            groupName: 'Perundurai 1 Lakh',
            chitValue: 100000n,
            durationMonths: 20,
            baseInstallment: 5000n,
            branchId: 'branch-PRD',
          },
          customer: {
            customerCode: 'KC-CUST-00007',
            fullName: 'S. Sundaram',
            phone: '9842143210',
          },
          dues: [
            {
              installmentMonth: 1,
              dueDate: new Date('2026-01-18'),
              grossAmount: 5000n,
              dividendDeduction: 0n,
              netPayableAmount: 5000n,
              paidAmount: 5000n,
              status: 'PAID',
              allocations: [
                {
                  payment: {
                    paymentStatus: 'REVERSED',
                    createdAt: new Date('2026-01-10'),
                    receipt: { receiptNumber: 'KC-REC-PRD-2026-OLD-REVERSED' },
                  },
                },
                {
                  payment: {
                    paymentStatus: 'SUCCESS',
                    createdAt: new Date('2026-01-15'),
                    receipt: { receiptNumber: 'KC-REC-PRD-2026-ACTIVE-VALID' },
                  },
                },
              ],
            },
          ],
        });

        await pdfService.generatePassbookPdf('tkt-rev-01', superAdminUser);
        const allText = renderedTexts.join('\n');
        expect(allText).toContain('KC-REC-PRD-2026-ACTIVE-VALID');
        expect(allText).not.toContain('KC-REC-PRD-2026-OLD-REVERSED');
      } finally {
        jest.restoreAllMocks();
      }
    });

    it('DEF-M7-PDF-07: PdfController sanitizes Content-Disposition filename, sets security headers, and honors stream=true over redirect=true', async () => {
      const controller = new PdfController(pdfService);
      const headers: Record<string, any> = {};
      const mockRes: any = {
        redirect: jest.fn(),
        json: jest.fn(),
        setHeader: jest.fn((k: string, v: any) => {
          headers[k] = v;
        }),
        end: jest.fn(),
      };

      prismaMock.payment.findUnique.mockResolvedValue({
        id: 'pay-safe',
        branchId: 'branch-PRD',
        amount: 3750n,
        paymentMethod: 'CASH',
        createdAt: new Date('2026-10-18T10:00:00Z'),
        recordedByUserId: 'usr-agent-1',
        recordedByUser: { name: 'Agent' },
        receipt: { id: 'rec-1', receiptNumber: 'KC-REC-PRD-2026-00045' },
        allocations: [
          {
            due: { installmentMonth: 1, grossAmount: 5000n, dividendDeduction: 1250n, netPayableAmount: 3750n },
            ticket: {
              ticketNumber: 7,
              customer: { fullName: 'S. Sundaram', addressLine1: '14 Rd', city: 'Perundurai', phone: '9842143210' },
              chitGroup: { groupCode: 'KCA-1L-20M-01', durationMonths: 20, branchId: 'branch-PRD', branch: { code: 'PRD', name: 'HO', address: 'PRD', phone: '987' } },
            },
          },
        ],
      });

      const maliciousId = 'pay-001"\r\nX-Evil: 1; filename="../evil';
      await controller.getReceiptPdf(maliciousId, false, 'true', 'true', superAdminUser, mockRes);

      // stream=true must override redirect=true
      expect(mockRes.redirect).not.toHaveBeenCalled();
      expect(mockRes.end).toHaveBeenCalledWith(expect.any(Buffer));
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Cache-Control']).toBe('private, no-store');
      expect(headers['Content-Disposition']).toMatch(/^inline; filename="receipt-[A-Za-z0-9._-]+\.pdf"$/);
      expect(headers['Content-Disposition']).not.toMatch(/[\r\n]/);
      expect(headers['Content-Disposition']).not.toContain('..');
    });

    it('R2-PDF-1 (Form XVII Status, Guardrail 5 Month 2..N-1 & Anti-Oracle): blocks SCHEDULED/Month 1/Month N auctions and checks branch auth before winner existence', async () => {
      const baseAuction = {
        id: 'auc-r2-01',
        status: 'COMPLETED',
        installmentMonth: 4,
        auctionDate: new Date('2026-10-18T10:00:00Z'),
        bidDiscount: 25000n,
        foremanCommissionRate: '4.00',
        foremanCommissionAmount: 4000n,
        totalDividend: 21000n,
        dividendPerTicket: 1050n,
        prizeMoney: 75000n,
        chitGroup: {
          id: 'group-r2',
          groupCode: 'KCA-1L-20M-01',
          groupName: 'Perundurai 1 Lakh',
          chitValue: 100000n,
          durationMonths: 20,
          baseInstallment: 5000n,
          foremanCommissionRate: '4.00',
          branchId: 'branch-PRD',
          branch: { id: 'branch-PRD', code: 'PRD', name: 'Head Office', address: 'Perundurai' },
        },
        winner: {
          wasTieBreakWinner: false,
          ticket: {
            ticketNumber: 7,
            customer: {
              id: 'cust-7',
              customerCode: 'KC-CUST-00007',
              fullName: 'S. Sundaram',
              phone: '9842143210',
            },
          },
        },
        tieBidders: [],
        minutes: { subscribersPresent: 18, minutesText: 'OK', signedByForeman: true },
      };

      // Cross-branch manager on auction with winner: null MUST receive 403 Forbidden (not 404 oracle)
      prismaMock.auction.findUnique.mockResolvedValue({ ...baseAuction, winner: null });
      await expect(
        pdfService.generateAuctionMinutesPdf('auc-r2-01', branchManagerOtherBranch),
      ).rejects.toThrow(ForbiddenException);

      // Unfinalized SCHEDULED auction (even with tentative winner) MUST fail closed with 400
      prismaMock.auction.findUnique.mockResolvedValue({ ...baseAuction, status: 'SCHEDULED' });
      await expect(
        pdfService.generateAuctionMinutesPdf('auc-r2-01', superAdminUser),
      ).rejects.toThrow(BadRequestException);

      // Guardrail 5: Month 1 and Month N (20 on 20-month group) MUST fail closed with 400
      prismaMock.auction.findUnique.mockResolvedValue({ ...baseAuction, installmentMonth: 1 });
      await expect(
        pdfService.generateAuctionMinutesPdf('auc-r2-01', superAdminUser),
      ).rejects.toThrow(BadRequestException);

      prismaMock.auction.findUnique.mockResolvedValue({ ...baseAuction, installmentMonth: 20 });
      await expect(
        pdfService.generateAuctionMinutesPdf('auc-r2-01', superAdminUser),
      ).rejects.toThrow(BadRequestException);

      // MINUTES_FILED on Month 2..N-1 succeeds
      prismaMock.auction.findUnique.mockResolvedValue({ ...baseAuction, status: 'MINUTES_FILED', installmentMonth: 19 });
      const res = await pdfService.generateAuctionMinutesPdf('auc-r2-01', superAdminUser);
      expect(res.buffer.toString('utf8', 0, 5)).toBe('%PDF-');
    });

    it('R2-PDF-2 (Passbook Strict PAID + SUCCESS Filter): excludes unverified INITIATED UPI claims from unpaid dues', async () => {
      const renderedTexts: string[] = [];
      const origText = PDFDocument.prototype.text;
      jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (this: any, text: any) {
        renderedTexts.push(String(text));
        return origText.apply(this, arguments as any);
      });

      try {
        prismaMock.subscriberTicket.findUnique.mockResolvedValue({
          id: 'tkt-upi-01',
          ticketNumber: 7,
          isPrized: false,
          chitGroup: {
            id: 'group-001',
            groupCode: 'KCA-1L-20M-01',
            groupName: 'Perundurai 1 Lakh',
            chitValue: 100000n,
            durationMonths: 20,
            baseInstallment: 5000n,
            branchId: 'branch-PRD',
          },
          customer: {
            id: 'cust-7',
            customerCode: 'KC-CUST-00007',
            fullName: 'S. Sundaram',
            phone: '9842143210',
          },
          dues: [
            {
              installmentMonth: 1,
              dueDate: new Date('2026-01-18T10:00:00Z'),
              grossAmount: 5000n,
              dividendDeduction: 0n,
              netPayableAmount: 5000n,
              paidAmount: 0n,
              status: 'UNPAID',
              allocations: [
                {
                  payment: {
                    paymentStatus: 'INITIATED',
                    createdAt: new Date('2026-01-17T10:00:00Z'),
                    receipt: { receiptNumber: 'KC-REC-PRD-2026-UNVERIFIED-UPI' },
                  },
                },
              ],
            },
            {
              installmentMonth: 2,
              dueDate: new Date('2026-02-18T10:00:00Z'),
              grossAmount: 5000n,
              dividendDeduction: 1000n,
              netPayableAmount: 4000n,
              paidAmount: 4000n,
              status: 'PAID',
              allocations: [
                {
                  payment: {
                    paymentStatus: 'INITIATED',
                    createdAt: new Date('2026-02-10T10:00:00Z'),
                    receipt: { receiptNumber: 'KC-REC-PRD-2026-INITIATED-IGNORE' },
                  },
                },
                {
                  payment: {
                    paymentStatus: 'SUCCESS',
                    createdAt: new Date('2026-02-12T10:00:00Z'),
                    receipt: { receiptNumber: 'KC-REC-PRD-2026-SETTLED-OK' },
                  },
                },
              ],
            },
          ],
        });

        await pdfService.generatePassbookPdf('tkt-upi-01', superAdminUser);
        const allText = renderedTexts.join('\n');
        expect(allText).toContain('KC-REC-PRD-2026-SETTLED-OK');
        expect(allText).not.toContain('KC-REC-PRD-2026-UNVERIFIED-UPI');
        expect(allText).not.toContain('KC-REC-PRD-2026-INITIATED-IGNORE');
      } finally {
        jest.restoreAllMocks();
      }
    });

    it('R2-PDF-3 (IST UTC+05:30 Date & Year Alignment): prevents 00:00–05:29 IST day and New Year boundary drift', async () => {
      // 2026-10-18T19:00:00Z is 2026-10-19 00:30 IST
      expect(FontResolverHelper.formatPdfDate(new Date('2026-10-18T19:00:00Z'))).toBe('2026-10-19');
      // 2026-12-31T19:00:00Z is 2027-01-01 00:30 IST
      expect(FontResolverHelper.formatPdfDate(new Date('2026-12-31T19:00:00Z'))).toBe('2027-01-01');
      expect(FontResolverHelper.getIstYear(new Date('2026-12-31T19:00:00Z'))).toBe(2027);

      // Receipt created at 00:30 IST on Jan 1, 2027 must archive under 2027/
      prismaMock.payment.findUnique.mockResolvedValue({
        id: 'pay-ist-ny',
        branchId: 'branch-PRD',
        amount: 3750n,
        paymentMethod: 'UPI',
        createdAt: new Date('2026-12-31T19:00:00Z'),
        recordedByUserId: 'usr-agent-1',
        recordedByUser: { name: 'Agent' },
        receipt: { id: 'rec-ny', receiptNumber: 'KC-REC-PRD-2027-00001' },
        allocations: [
          {
            due: { installmentMonth: 1, grossAmount: 5000n, dividendDeduction: 1250n, netPayableAmount: 3750n },
            ticket: {
              ticketNumber: 7,
              customer: { fullName: 'S. Sundaram', addressLine1: 'Rd', city: 'Perundurai', phone: '9842143210' },
              chitGroup: { groupCode: 'KCA-1L-20M-01', durationMonths: 20, branchId: 'branch-PRD', branch: { code: 'PRD', name: 'HO', address: 'PRD', phone: '987' } },
            },
          },
        ],
      });
      const recRes = await pdfService.generateReceiptPdf('pay-ist-ny', superAdminUser);
      expect(recRes.key).toBe('receipts/PRD/2027/KC-REC-PRD-2027-00001.pdf');

      // Voucher disbursed at 00:30 IST on Jan 1, 2027 must use year 2027 in voucher number & storage key
      prismaMock.auctionWinner.findUnique.mockResolvedValue({
        auctionId: 'auc-ist-ny',
        disbursementStatus: 'DISBURSED',
        disbursedAmount: 75000n,
        disbursementMode: 'CASH',
        paymentReference: 'CASH-01',
        agreementSigned: true,
        nomineeSigned: true,
        isSecurityRequired: false,
        disbursedAt: new Date('2026-12-31T19:00:00Z'),
        verifiedByUserId: 'usr-bm-1',
        authorizedByUserId: 'usr-admin-1',
        auction: {
          installmentMonth: 4,
          auctionDate: new Date('2026-12-31T10:00:00Z'),
          bidDiscount: 25000n,
          prizeMoney: 75000n,
          chitGroup: {
            groupCode: 'KCA-1L-20M-01',
            chitValue: 100000n,
            branchId: 'branch-PRD',
            branch: { id: 'branch-PRD', code: 'PRD', name: 'HO', address: 'PRD' },
          },
        },
        ticket: {
          ticketNumber: 7,
          customer: { customerCode: 'KC-CUST-00007', fullName: 'S. Sundaram', phone: '9842143210' },
        },
      });
      prismaMock.user.findUnique.mockResolvedValue({ name: 'Partner' });
      const vouRes = await pdfService.generatePayoutVoucherPdf('auc-ist-ny', superAdminUser);
      expect(vouRes.key).toBe('vouchers/PRD/2027/KC-VOU-PRD-2027-KCA-1L-20M-01-00004.pdf');
    });

    it('R2-PDF-4 (Receipt Anti-Oracle & Explicit Customer Select Allowlist): authorizes before checking !payment.receipt and avoids bare customer:true', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        id: 'pay-no-receipt',
        branchId: 'branch-PRD',
        recordedByUserId: 'usr-agent-1',
        receipt: null,
        allocations: [
          {
            ticket: {
              customer: { id: 'cust-1', phone: '9842143210' },
              chitGroup: { branchId: 'branch-PRD' },
            },
          },
        ],
      });

      // Unauthorized customer on payment without receipt MUST receive 403 Forbidden (not 404 oracle)
      await expect(
        pdfService.generateReceiptPdf('pay-no-receipt', customerOther),
      ).rejects.toThrow(ForbiddenException);

      // Verify Prisma query uses explicit safe customer select (no bare customer: true)
      const lastCallArgs = prismaMock.payment.findUnique.mock.calls[prismaMock.payment.findUnique.mock.calls.length - 1][0];
      const customerInclude = lastCallArgs.include.allocations.include.ticket.include.customer;
      expect(customerInclude).toHaveProperty('select');
      expect(customerInclude.select).not.toHaveProperty('refreshTokenHash');
      expect(customerInclude.select).not.toHaveProperty('panNumber');
      expect(customerInclude.select).not.toHaveProperty('fcmToken');
    });

    it('XR-M7-PDF-01: PdfController sets Cache-Control: private, no-store on ?download=true JSON and ?redirect=true 302 responses, and wires ParseUUIDPipe on all 4 routes', async () => {
      const controller = new PdfController(pdfService);
      const { ROUTE_ARGS_METADATA } = await import('@nestjs/common/constants');

      // Verify ParseUUIDPipe is attached to the route @Param on all 4 handlers
      for (const methodName of ['getReceiptPdf', 'getVoucherPdf', 'getMinutesPdf', 'getPassbookPdf'] as const) {
        const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, PdfController, methodName);
        const paramEntries = Object.values(meta || {}) as Array<{ pipes?: any[] }>;
        const hasUuidPipe = paramEntries.some((entry) =>
          (entry.pipes || []).some((p) => p?.constructor?.name === 'ParseUUIDPipe'),
        );
        expect(hasUuidPipe).toBe(true);
      }

      const paymentFixture = {
        id: '11111111-1111-4111-8111-111111111111',
        branchId: 'branch-PRD',
        paymentStatus: 'SUCCESS',
        amount: 3750n,
        paymentMethod: 'CASH',
        createdAt: new Date('2026-10-18T10:00:00Z'),
        recordedByUserId: 'usr-agent-1',
        recordedByUser: { name: 'Agent' },
        receipt: { id: 'rec-1', receiptNumber: 'KC-REC-PRD-2026-00045' },
        allocations: [
          {
            due: { installmentMonth: 1, grossAmount: 5000n, dividendDeduction: 1250n, netPayableAmount: 3750n },
            ticket: {
              ticketNumber: 7,
              customer: { fullName: 'S. Sundaram', addressLine1: '14 Rd', city: 'Perundurai', phone: '9842143210' },
              chitGroup: { groupCode: 'KCA-1L-20M-01', durationMonths: 20, branchId: 'branch-PRD', branch: { code: 'PRD', name: 'HO', address: 'PRD', phone: '987' } },
            },
          },
        ],
      };

      prismaMock.payment.findUnique.mockResolvedValue(paymentFixture);
      const jsonRes: any = { setHeader: jest.fn(), json: jest.fn(), redirect: jest.fn(), end: jest.fn() };
      await controller.getReceiptPdf(paymentFixture.id, true, 'false', 'false', superAdminUser, jsonRes);
      expect(jsonRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
      expect(jsonRes.json).toHaveBeenCalled();

      prismaMock.payment.findUnique.mockResolvedValue(paymentFixture);
      const redirectRes: any = { setHeader: jest.fn(), json: jest.fn(), redirect: jest.fn(), end: jest.fn() };
      await controller.getReceiptPdf(paymentFixture.id, false, 'true', 'false', superAdminUser, redirectRes);
      expect(redirectRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
      expect(redirectRes.redirect).toHaveBeenCalled();
    });

    it('XR-M7-PDF-02: formatCommissionRatePercent preserves 3+ decimal frozen rates instead of falling back to 4.00%', () => {
      expect(RupeeWordsHelper.formatCommissionRatePercent('5.000')).toBe('5.00%');
      expect(RupeeWordsHelper.formatCommissionRatePercent('3.5000')).toBe('3.50%');
      expect(RupeeWordsHelper.formatCommissionRatePercent('4.250')).toBe('4.25%');
      expect(RupeeWordsHelper.formatCommissionRatePercent('5.00000')).not.toBe('4.00%');
    });

    it('XR-M7-PDF-04: Pre-lookup caller guard blocks branchless/phoneless/empty-role callers BEFORE DB lookup, and receipt PDF rejects INITIATED/FAILED payments', async () => {
      const bmBlankBranch: JwtPayload = {
        sub: 'usr-bm-blank',
        phone: '9842100090',
        roles: [Role.BRANCH_MANAGER],
        branchId: '   ',
        tokenType: 'access',
      };
      const custBlankPhone: JwtPayload = {
        sub: 'usr-cust-blank',
        phone: '   ',
        roles: [Role.CUSTOMER],
        branchId: 'branch-PRD',
        tokenType: 'access',
      };
      const emptyRoleUser: JwtPayload = {
        sub: 'usr-empty',
        phone: '9842100001',
        roles: [],
        branchId: 'branch-PRD',
        tokenType: 'access',
      };

      prismaMock.payment.findUnique.mockClear();
      prismaMock.auctionWinner.findUnique.mockClear();
      prismaMock.auction.findUnique.mockClear();
      prismaMock.subscriberTicket.findUnique.mockClear();

      await expect(pdfService.generateReceiptPdf('pay-x', bmBlankBranch)).rejects.toThrow(ForbiddenException);
      await expect(pdfService.generateReceiptPdf('pay-x', custBlankPhone)).rejects.toThrow(ForbiddenException);
      await expect(pdfService.generateReceiptPdf('pay-x', emptyRoleUser)).rejects.toThrow(ForbiddenException);
      expect(prismaMock.payment.findUnique).not.toHaveBeenCalled();

      await expect(pdfService.generatePayoutVoucherPdf('auc-x', bmBlankBranch)).rejects.toThrow(ForbiddenException);
      expect(prismaMock.auctionWinner.findUnique).not.toHaveBeenCalled();

      await expect(pdfService.generateAuctionMinutesPdf('auc-x', bmBlankBranch)).rejects.toThrow(ForbiddenException);
      expect(prismaMock.auction.findUnique).not.toHaveBeenCalled();

      await expect(pdfService.generatePassbookPdf('tkt-x', custBlankPhone)).rejects.toThrow(ForbiddenException);
      expect(prismaMock.subscriberTicket.findUnique).not.toHaveBeenCalled();

      // Reject INITIATED & FAILED payments in generateReceiptPdf even if a receipt row exists
      for (const badStatus of ['INITIATED', 'FAILED'] as const) {
        prismaMock.payment.findUnique.mockResolvedValue({
          id: `pay-${badStatus}`,
          branchId: 'branch-PRD',
          paymentStatus: badStatus,
          recordedByUserId: 'usr-agent-1',
          receipt: { id: 'rec-bad', receiptNumber: 'KC-REC-PRD-2026-00999' },
          allocations: [],
        });
        await expect(
          pdfService.generateReceiptPdf(`pay-${badStatus}`, superAdminUser),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('XR-M7-PDF-05 (KC-09 Parity): Form XXI Passbook PDF resolves verified PRIZE_ARREARS_OFFSET_ALLOCATED settlement date & OFFSET voucher reference', async () => {
      const renderedTexts: string[] = [];
      const origText = PDFDocument.prototype.text;
      jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (this: any, text: any) {
        renderedTexts.push(String(text));
        return origText.apply(this, arguments as any);
      });

      try {
        prismaMock.subscriberTicket.findUnique.mockResolvedValue({
          id: 'tkt-offset-01',
          ticketNumber: 7,
          isPrized: true,
          chitGroup: {
            id: 'group-001',
            groupCode: 'KCA-1L-20M-01',
            groupName: 'Perundurai 1 Lakh',
            chitValue: 100000n,
            durationMonths: 20,
            baseInstallment: 5000n,
            branchId: 'branch-PRD',
          },
          customer: {
            id: 'cust-7',
            customerCode: 'KC-CUST-00007',
            fullName: 'S. Sundaram',
            phone: '9842143210',
          },
          winningAuction: {
            paymentReference: 'UTR-KVB-998877',
            disbursedAt: new Date('2026-10-18T12:00:00Z'),
          },
          dues: [
            {
              id: 'due-offset-m3',
              installmentMonth: 3,
              dueDate: new Date('2026-03-18T10:00:00Z'),
              grossAmount: 5000n,
              dividendDeduction: 1000n,
              netPayableAmount: 4000n,
              paidAmount: 4000n,
              status: 'PAID',
              allocations: [],
            },
          ],
        });
        prismaMock.auditLog.findMany.mockResolvedValue([
          {
            entityId: 'due-offset-m3',
            timestamp: new Date('2026-10-18T19:00:00Z'), // 2026-10-19 00:30 IST
            newValue: { offsetAmount: '4000' },
          },
        ]);

        await pdfService.generatePassbookPdf('tkt-offset-01', superAdminUser);
        const allText = renderedTexts.join('\n');
        expect(allText).toContain('OFFSET-UTR-KVB-998877');
        expect(allText).toContain('2026-10-19');
      } finally {
        jest.restoreAllMocks();
      }
    });
  });

  describe('11. Asynchronous Statutory PDF Architecture (PERF-01 / Issue 10)', () => {
    let mockBullMqProvider: any;
    let mockRedisProvider: any;
    let redisStore: Map<string, string>;
    let asyncPdfService: PdfService;
    let asyncPdfController: PdfController;

    beforeEach(() => {
      redisStore = new Map();

      mockRedisProvider = {
        getIsConnected: jest.fn().mockReturnValue(true),
        getClient: jest.fn().mockReturnValue({
          set: jest.fn().mockImplementation(async (key: string, val: string) => {
            redisStore.set(key, val);
            return 'OK';
          }),
          get: jest.fn().mockImplementation(async (key: string) => {
            return redisStore.get(key) || null;
          }),
        }),
      };

      mockBullMqProvider = {
        addJob: jest.fn().mockResolvedValue({
          jobId: 'job-mock-123',
          status: 'ENQUEUED',
        }),
      };

      asyncPdfService = new PdfService(
        prismaMock as unknown as PrismaService,
        storageMock as unknown as StorageService,
        mockBullMqProvider,
        mockRedisProvider,
      );

      asyncPdfController = new PdfController(asyncPdfService);
    });

    it('PERF-01: enqueueAsyncPdfGeneration enqueues job to BullMQ, writes QUEUED status to Redis, and returns checkStatusUrl', async () => {
      const result = await asyncPdfService.enqueueAsyncPdfGeneration(
        'PASSBOOK',
        'tkt-uuid-001',
        superAdminUser,
      );

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('QUEUED');
      expect(result.checkStatusUrl).toBe(`/api/v1/pdf/async/status/${result.jobId}`);

      expect(mockBullMqProvider.addJob).toHaveBeenCalledWith(
        'daily-maintenance-queue',
        'generate-statutory-pdf',
        expect.objectContaining({
          jobId: result.jobId,
          type: 'PASSBOOK',
          entityId: 'tkt-uuid-001',
          currentUser: superAdminUser,
        }),
        { jobId: result.jobId },
      );

      const statusInRedis = JSON.parse(redisStore.get(`pdf:status:${result.jobId}`) || '{}');
      expect(statusInRedis.status).toBe('QUEUED');
      expect(statusInRedis.type).toBe('PASSBOOK');
      expect(statusInRedis.entityId).toBe('tkt-uuid-001');
    });

    it('PERF-01: enqueueAsyncPdfGeneration rejects unauthorized caller BEFORE enqueuing to BullMQ (Pre-lookup anti-oracle guard)', async () => {
      await expect(
        asyncPdfService.enqueueAsyncPdfGeneration(
          'PASSBOOK',
          'tkt-uuid-001',
          collectionAgent1, // Collection agents cannot generate passbooks
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockBullMqProvider.addJob).not.toHaveBeenCalled();
    });

    it('PERF-01: processAsyncPdfJob renders passbook off main thread, uploads to S3, and writes COMPLETED status to Redis', async () => {
      const mockTicket = {
        id: 'tkt-async-passbook',
        ticketNumber: 7,
        isPrized: false,
        chitGroup: {
          id: 'group-prd-01',
          groupCode: 'KCA-1L-20M-01',
          groupName: 'KCA 1 Lakh 20 Months',
          chitValue: 100000n,
          durationMonths: 20,
          baseInstallment: 5000n,
          branchId: 'branch-PRD',
          branch: { code: 'PRD', address: 'Main Road, Perundurai' },
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
        dues: [],
      };

      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);

      const completed = await asyncPdfService.processAsyncPdfJob({
        jobId: 'async-job-888',
        type: 'PASSBOOK',
        entityId: 'tkt-async-passbook',
        currentUser: superAdminUser,
      });

      expect(completed.status).toBe('COMPLETED');
      expect(completed.jobId).toBe('async-job-888');
      expect(completed.key).toBe('passbooks/group-prd-01/ticket-7.pdf');
      expect(completed.presignedUrl).toBeDefined();
      expect(completed.expiresInSeconds).toBe(900);
      expect(completed.completedAt).toBeDefined();

      const statusInRedis = JSON.parse(redisStore.get('pdf:status:async-job-888') || '{}');
      expect(statusInRedis.status).toBe('COMPLETED');
      expect(statusInRedis.key).toBe('passbooks/group-prd-01/ticket-7.pdf');
      expect(statusInRedis.presignedUrl).toBeDefined();
    });

    it('PERF-01: processAsyncPdfJob records FAILED status in Redis and rethrows on rendering error', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(null);

      await expect(
        asyncPdfService.processAsyncPdfJob({
          jobId: 'async-job-fail-999',
          type: 'PASSBOOK',
          entityId: 'tkt-nonexistent',
          currentUser: superAdminUser,
        }),
      ).rejects.toThrow(NotFoundException);

      const statusInRedis = JSON.parse(redisStore.get('pdf:status:async-job-fail-999') || '{}');
      expect(statusInRedis.status).toBe('FAILED');
      expect(statusInRedis.error).toContain('Subscriber ticket not found');
      expect(statusInRedis.failedAt).toBeDefined();
    });

    it('PERF-01: getAsyncPdfStatus retrieves current job status from Redis or throws NotFoundException', async () => {
      redisStore.set(
        'pdf:status:job-ready-111',
        JSON.stringify({
          jobId: 'job-ready-111',
          status: 'COMPLETED',
          key: 'passbooks/group-prd-01/ticket-7.pdf',
          presignedUrl: 'https://storage.kumaranfinance.in/signed-passbook.pdf',
          expiresInSeconds: 900,
          completedAt: new Date().toISOString(),
        }),
      );

      const status = await asyncPdfService.getAsyncPdfStatus('job-ready-111');
      expect(status.status).toBe('COMPLETED');
      expect(status.presignedUrl).toBe('https://storage.kumaranfinance.in/signed-passbook.pdf');

      await expect(asyncPdfService.getAsyncPdfStatus('job-does-not-exist')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('PERF-01: PdfController POST async/passbook/:ticketId and GET async/status/:jobId endpoints operate correctly', async () => {
      const enqueueRes = await asyncPdfController.enqueuePassbookPdf(
        'tkt-uuid-controller-01',
        superAdminUser,
      );
      expect(enqueueRes.jobId).toBeDefined();
      expect(enqueueRes.status).toBe('QUEUED');
      expect(enqueueRes.checkStatusUrl).toBe(`/api/v1/pdf/async/status/${enqueueRes.jobId}`);

      const statusRes = await asyncPdfController.getAsyncPdfStatus(enqueueRes.jobId);
      expect(statusRes.status).toBe('QUEUED');
    });

    it('PERF-01: fallback mode operates smoothly in-process when BullMQ / Redis are offline', async () => {
      const offlineService = new PdfService(
        prismaMock as unknown as PrismaService,
        storageMock as unknown as StorageService,
        undefined, // No BullMQ
        undefined, // No Redis
      );

      const mockTicket = {
        id: 'tkt-offline',
        ticketNumber: 2,
        isPrized: false,
        chitGroup: {
          id: 'group-prd-01',
          groupCode: 'KCA-1L-20M-01',
          groupName: 'KCA 1 Lakh 20 Months',
          chitValue: 100000n,
          durationMonths: 20,
          baseInstallment: 5000n,
          branchId: 'branch-PRD',
          branch: { code: 'PRD', address: 'Main Road, Perundurai' },
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
        dues: [],
      };
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);

      const enqueued = await offlineService.enqueueAsyncPdfGeneration(
        'PASSBOOK',
        'tkt-offline',
        superAdminUser,
      );

      expect(enqueued.jobId).toBeDefined();
      expect(enqueued.status).toBe('COMPLETED'); // Direct execution fallback completed synchronously

      const status = await offlineService.getAsyncPdfStatus(enqueued.jobId);
      expect(status.status).toBe('COMPLETED');
      expect(status.key).toBe('passbooks/group-prd-01/ticket-2.pdf');
    });
  });
});

