import { NotFoundException } from '@nestjs/common';
import { FontResolverHelper } from '../src/pdf/helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../src/pdf/helpers/rupee-words.helper';
import { PdfService } from '../src/pdf/pdf.service';
import { FormXviiMinutesTemplate } from '../src/pdf/templates/form-xvii-minutes.template';
import { FormXxiPassbookTemplate } from '../src/pdf/templates/form-xxi-passbook.template';
import { PayoutVoucherTemplate } from '../src/pdf/templates/payout-voucher.template';
import { ThermalReceiptTemplate } from '../src/pdf/templates/thermal-receipt.template';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';

describe('Component 2: Bilingual PDF Canvas Engine Tests', () => {
  let pdfService: PdfService;
  let prismaMock: any;
  let storageMock: any;

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
    it('should generate a valid 80mm thermal subscription receipt PDF buffer', async () => {
      const buffer = await ThermalReceiptTemplate.generate({
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

  describe('4. PdfService Storage Integration', () => {
    it('should generate receipt PDF, save to storage, update DB, and return presigned URL', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        id: 'pay-001',
        amount: 3750n,
        paymentMethod: 'CASH',
        createdAt: new Date('2026-10-18T10:00:00Z'),
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
      });

      const result = await pdfService.generateReceiptPdf('pay-001');

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(storageMock.uploadFile).toHaveBeenCalled();
      expect(prismaMock.receipt.update).toHaveBeenCalledWith({
        where: { id: 'rec-001' },
        data: expect.objectContaining({ pdfS3Key: expect.any(String) }),
      });
      expect(storageMock.getPresignedUrl).toHaveBeenCalledWith(expect.any(String), 900);
      expect(result.presignedUrl).toBe('https://storage.kumaranfinance.com/signed-url?exp=900');
    });

    it('should throw NotFoundException if payment has no receipt', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(null);
      await expect(pdfService.generateReceiptPdf('missing-id')).rejects.toThrow(NotFoundException);
    });
  });
});
