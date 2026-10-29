import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../src/auth/interfaces/jwt-payload.interface';
import { FontResolverHelper } from '../src/pdf/helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../src/pdf/helpers/rupee-words.helper';
import { PdfService } from '../src/pdf/pdf.service';
import { FormXviiMinutesTemplate } from '../src/pdf/templates/form-xvii-minutes.template';
import { FormXxiPassbookTemplate } from '../src/pdf/templates/form-xxi-passbook.template';
import { PayoutVoucherTemplate } from '../src/pdf/templates/payout-voucher.template';
import { SubscriptionReceiptTemplate } from '../src/pdf/templates/subscription-receipt.template';
import { PrismaService } from '../src/prisma/prisma.service';
import { DocumentAccessHelper } from '../src/storage/helpers/document-access.helper';
import { StorageService } from '../src/storage/storage.service';

describe('Component 2: Bilingual PDF Canvas Engine Tests', () => {
  let pdfService: PdfService;
  let prismaMock: any;
  let storageMock: any;

  const superAdminUser: JwtPayload = {
    sub: 'usr-admin-1',
    phone: '9842100001',
    roles: [Role.SUPER_ADMIN],
    branchId: 'branch-PRD',
  };

  const branchManagerUser: JwtPayload = {
    sub: 'usr-bm-1',
    phone: '9842100002',
    roles: [Role.BRANCH_MANAGER],
    branchId: 'branch-PRD',
  };

  const branchManagerOtherBranch: JwtPayload = {
    sub: 'usr-bm-2',
    phone: '9842100003',
    roles: [Role.BRANCH_MANAGER],
    branchId: 'branch-OTHER',
  };

  const collectionAgent1: JwtPayload = {
    sub: 'usr-agent-1',
    phone: '9842100004',
    roles: [Role.COLLECTION_AGENT],
    branchId: 'branch-PRD',
  };

  const collectionAgent2: JwtPayload = {
    sub: 'usr-agent-2',
    phone: '9842100005',
    roles: [Role.COLLECTION_AGENT],
    branchId: 'branch-PRD',
  };

  const customerSundaram: JwtPayload = {
    sub: 'usr-cust-1',
    phone: '9842143210',
    roles: [Role.CUSTOMER],
  };

  const customerOther: JwtPayload = {
    sub: 'usr-cust-2',
    phone: '9999999999',
    roles: [Role.CUSTOMER],
  };

  const auditorUser: JwtPayload = {
    sub: 'usr-audit-1',
    phone: '9842100099',
    roles: [Role.AUDITOR],
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
    };

    storageMock = {
      uploadFile: jest.fn().mockResolvedValue({
        key: 'receipts/PRD/2026/KC-REC-001.pdf',
        url: '/api/v1/storage/file/receipts/PRD/2026/KC-REC-001.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
      }),
      getPresignedUrl: jest.fn().mockResolvedValue('https://storage.kumaranfinance.com/signed-url?exp=900'),
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
              branch: { id: 'branch-PRD', name: 'Head Office', address: 'Perundurai', phone: '9876543210' },
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
      expect(result.presignedUrl).toBe('https://storage.kumaranfinance.com/signed-url?exp=900');
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
          branch: { id: 'branch-PRD', name: 'Head Office', address: 'Perundurai' },
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
    it('should allow Super Admin and Auditor full access to any key', () => {
      expect(() => {
        DocumentAccessHelper.assertStorageKeyAccess('kyc/cust-1/aadhaar.pdf', superAdminUser);
        DocumentAccessHelper.assertStorageKeyAccess('safety-proof/group-1/cheque.pdf', auditorUser);
      }).not.toThrow();
    });

    it('should prevent collection agents from accessing customer KYC files', () => {
      expect(() => {
        DocumentAccessHelper.assertStorageKeyAccess('kyc/cust-1/aadhaar.pdf', collectionAgent1);
      }).toThrow(ForbiddenException);
    });

    it('should prevent customer from accessing another customer KYC file', () => {
      expect(() => {
        DocumentAccessHelper.assertStorageKeyAccess('kyc/other-cust-id/pan.pdf', customerSundaram);
      }).toThrow(ForbiddenException);
    });

    it('should allow customer to access their own KYC folder', () => {
      expect(() => {
        DocumentAccessHelper.assertStorageKeyAccess(`kyc/${customerSundaram.sub}/aadhaar.pdf`, customerSundaram);
      }).not.toThrow();
    });

    it('should prevent customer and collection agents from accessing internal safety-proof and minutes keys', () => {
      expect(() => {
        DocumentAccessHelper.assertStorageKeyAccess('minutes/group-1/m4.pdf', customerSundaram);
      }).toThrow(ForbiddenException);

      expect(() => {
        DocumentAccessHelper.assertStorageKeyAccess('safety-proof/auc-1/cheque.pdf', collectionAgent1);
      }).toThrow(ForbiddenException);
    });

    it('should restrict direct storage access to receipts and vouchers for customer and collection agents', () => {
      // Customer blocked from raw storage path
      expect(() => {
        DocumentAccessHelper.assertStorageKeyAccess('receipts/PRD/2026/KC-REC-001.pdf', customerSundaram);
      }).toThrow(ForbiddenException);

      expect(() => {
        DocumentAccessHelper.assertStorageKeyAccess('vouchers/PRD/2026/KC-VOU-001.pdf', customerSundaram);
      }).toThrow(ForbiddenException);

      // Collection agent blocked from raw storage path
      expect(() => {
        DocumentAccessHelper.assertStorageKeyAccess('receipts/PRD/2026/KC-REC-001.pdf', collectionAgent1);
      }).toThrow(ForbiddenException);

      // Super Admin and Auditor permitted
      expect(() => {
        DocumentAccessHelper.assertStorageKeyAccess('receipts/PRD/2026/KC-REC-001.pdf', superAdminUser);
        DocumentAccessHelper.assertStorageKeyAccess('vouchers/PRD/2026/KC-VOU-001.pdf', auditorUser);
      }).not.toThrow();
    });
  });
});

