import PDFDocument from 'pdfkit';
import { SubscriptionReceiptTemplate } from '../../src/pdf/templates/subscription-receipt.template';
import { PayoutVoucherTemplate } from '../../src/pdf/templates/payout-voucher.template';
import { FormXviiMinutesTemplate } from '../../src/pdf/templates/form-xvii-minutes.template';
import { FormXxiPassbookTemplate } from '../../src/pdf/templates/form-xxi-passbook.template';

describe('PDF Layout Regression & Defect Fix Tests (5 Confirmed Invariants)', () => {
  describe('Fix 1 & Fix 2 — Subscription Receipt Layout Invariants', () => {
    it('Fix 1: should constrain metadata columns with explicit widths to prevent collision with adjacent columns', async () => {
      const textCalls: { text: string; x?: number; y?: number; options?: any }[] = [];
      const origText = PDFDocument.prototype.text;
      jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
        this: any,
        text: any,
        x?: any,
        y?: any,
        options?: any,
      ) {
        textCalls.push({
          text: String(text),
          x: typeof x === 'number' ? x : undefined,
          y: typeof y === 'number' ? y : undefined,
          options: typeof x === 'object' ? x : typeof y === 'object' ? y : options,
        });
        return origText.apply(this, arguments as any);
      });

      try {
        const buffer = await SubscriptionReceiptTemplate.generate({
          receiptNumber: 'KC-REC-PRD-2026-1L-M1-EXTRA-LONG-RECEIPT-NUMBER-99999999',
          date: new Date('2026-10-18T10:45:00Z'),
          groupCode: 'KCA-1L-20M-01-VERY-LONG-GROUP-NAME',
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

        expect(buffer.toString('utf8', 0, 5)).toBe('%PDF-');

        // Verify Fix 1: Left and right metadata text calls must specify explicit column width
        const receiptNoCall = textCalls.find((c) => c.text.includes('ரசீது எண் / Receipt No'));
        expect(receiptNoCall).toBeDefined();
        expect(receiptNoCall?.options).toHaveProperty('width');
        expect(receiptNoCall?.options?.width).toBeLessThanOrEqual(185);

        const chitGroupCall = textCalls.find((c) => c.text.includes('சீட்டு குழு / Chit Group'));
        expect(chitGroupCall).toBeDefined();
        expect(chitGroupCall?.options).toHaveProperty('width');
        expect(chitGroupCall?.options?.width).toBeLessThanOrEqual(185);
      } finally {
        jest.restoreAllMocks();
      }
    });

    it('Fix 2: should render footer legal notices without hardcoded overlapping Y offsets', async () => {
      const textCalls: { text: string; x?: number; y?: number; options?: any }[] = [];
      const origText = PDFDocument.prototype.text;
      jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
        this: any,
        text: any,
        x?: any,
        y?: any,
        options?: any,
      ) {
        textCalls.push({
          text: String(text),
          x: typeof x === 'number' ? x : undefined,
          y: typeof y === 'number' ? y : undefined,
          options: typeof x === 'object' ? x : typeof y === 'object' ? y : options,
        });
        return origText.apply(this, arguments as any);
      });

      try {
        const buffer = await SubscriptionReceiptTemplate.generate({
          receiptNumber: 'KC-REC-PRD-2026-00412',
          date: new Date('2026-10-18T10:45:00Z'),
          groupCode: 'KCA-1L-20M-01',
          installmentMonth: 4,
          durationMonths: 20,
          ticketNumber: 7,
          subscriberName: 'S. Sundaram',
          subscriberNameTamil: 'சுந்தரம்',
          phone: '9842143210',
          baseInstallment: 5000n,
          dividendDeduction: 1250n,
          netPayableAmount: 3750n,
          amountPaid: 3750n,
          paymentMethod: 'CASH',
          collectedByName: 'M. Kathiresan (AG-01)',
        });

        expect(buffer.toString('utf8', 0, 5)).toBe('%PDF-');

        // Notice 1: Digital receipt notice
        const notice1 = textCalls.find((c) => c.text.includes('டிஜிட்டல் ரசீது'));
        expect(notice1).toBeDefined();

        // Notice 2: Tamil passbook notice - must not have a hardcoded fixed Y collision offset
        const notice2 = textCalls.find((c) => c.text.includes('கையொப்பமிட்ட பாஸ்புக்'));
        expect(notice2).toBeDefined();
        // Notice 2 should NOT have y hardcoded to currentY + 9
        expect(notice2?.y).toBeUndefined();

        // Notice 3: English passbook notice - must flow dynamically
        const notice3 = textCalls.find((c) => c.text.includes('primary acknowledged legal proof'));
        expect(notice3).toBeDefined();
        // Notice 3 should NOT have y hardcoded to currentY + 18
        expect(notice3?.y).toBeUndefined();
      } finally {
        jest.restoreAllMocks();
      }
    });
  });

  describe('Fix 3 — Prize Payout Voucher Layout Invariants', () => {
    it('Fix 3: should separate Mode and Ref onto distinct lines and span Rupee words & Checklist across full width', async () => {
      const textCalls: { text: string; x?: number; y?: number; options?: any }[] = [];
      const origText = PDFDocument.prototype.text;
      jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
        this: any,
        text: any,
        x?: any,
        y?: any,
        options?: any,
      ) {
        textCalls.push({
          text: String(text),
          x: typeof x === 'number' ? x : undefined,
          y: typeof y === 'number' ? y : undefined,
          options: typeof x === 'object' ? x : typeof y === 'object' ? y : options,
        });
        return origText.apply(this, arguments as any);
      });

      try {
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
          paymentReference: 'UTR-SBIN00293849102384-LONG-REF',
          agreementSigned: true,
          nomineeSigned: true,
          isSecurityRequired: false,
          verifiedByUserName: 'Staff Maker',
          authorizedByUserName: 'Partner Checker',
        });

        expect(buffer.toString('utf8', 0, 5)).toBe('%PDF-');

        // Mode and Ref must NOT share the same Y coordinate (they are now on separate lines)
        const modeCall = textCalls.find((c) => c.text.includes('முறை / Mode:'));
        const refCall = textCalls.find((c) => c.text.includes('குறிப்பு எண் / Ref:'));
        expect(modeCall).toBeDefined();
        expect(refCall).toBeDefined();
        expect(modeCall?.y).toBeDefined();
        expect(refCall?.y).toBeDefined();
        expect(modeCall?.y).not.toEqual(refCall?.y);
        expect(refCall!.y!).toBeGreaterThan(modeCall!.y!);

        // Rupee words must start at margin 25 with full width
        const wordsCall = textCalls.find((c) => c.text.includes('தொகை (சொற்களில்):'));
        expect(wordsCall).toBeDefined();
        expect(wordsCall?.x).toBe(25);
        expect(wordsCall?.options?.width).toBeGreaterThanOrEqual(500);

        // Safety proof checklist must start at margin 25 with full width
        const checklistCall = textCalls.find((c) => c.text.includes('பாதுகாப்பு சரிபார்ப்பு'));
        expect(checklistCall).toBeDefined();
        expect(checklistCall?.x).toBe(25);
        expect(checklistCall?.options?.width).toBeGreaterThanOrEqual(500);
      } finally {
        jest.restoreAllMocks();
      }
    });
  });

  describe('Fix 4 — Form XVII Auction Minutes Content Alignment Invariants', () => {
    it('Fix 4: should reset doc.x to 35 after financial table and span full width', async () => {
      const textCalls: { text: string; x?: number; y?: number; options?: any }[] = [];
      const origText = PDFDocument.prototype.text;
      jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
        this: any,
        text: any,
        x?: any,
        y?: any,
        options?: any,
      ) {
        textCalls.push({
          text: String(text),
          x: typeof x === 'number' ? x : undefined,
          y: typeof y === 'number' ? y : undefined,
          options: typeof x === 'object' ? x : typeof y === 'object' ? y : options,
        });
        return origText.apply(this, arguments as any);
      });

      try {
        const buffer = await FormXviiMinutesTemplate.generate({
          groupCode: 'KCA-1L-20M-01',
          groupName: 'Kumaran Scheme A',
          baseInstallment: 5000n,
          chitValue: 100000n,
          installmentMonth: 4,
          auctionDate: new Date('2026-10-18T10:00:00Z'),
          durationMonths: 20,
          bidDiscount: 25000n,
          foremanCommissionAmount: 4000n,
          totalDividend: 21000n,
          dividendPerTicket: 1050n,
          prizeMoney: 75000n,
          nextMonthNetInstallment: 3950n,
          winnerTicketNumber: 7,
          winnerCustomerCode: 'KC-CUST-00007',
          winnerName: 'S. Sundaram',
          winnerNameTamil: 'சுந்தரம்',
          winnerPhone: '9842143210',
          wasTieBreakWinner: true,
          tiedBidders: [
            { ticketNumber: 7, customerName: 'S. Sundaram', tokenNumberDrawn: 1, isWinner: true },
            { ticketNumber: 12, customerName: 'R. Ramasamy', tokenNumberDrawn: 2, isWinner: false },
          ],
          minutesText: 'ஏலம் முறைப்படி அமைதியான முறையில் அனைத்து உறுப்பினர்கள் முன்னிலையில் நடத்தப்பட்டது.',
          subscribersPresent: 18,
          signedByForeman: true,
        });

        expect(buffer.toString('utf8', 0, 5)).toBe('%PDF-');

        // Prize Money section must start at margin 35 (NOT inherited 380)
        const prizeMoneyCall = textCalls.find((c) => c.text.includes('பரிசு தொகை / Prize Money'));
        expect(prizeMoneyCall).toBeDefined();
        expect(prizeMoneyCall?.x).toBe(35);
        expect(prizeMoneyCall?.options?.width).toBeGreaterThanOrEqual(500);

        // Next Month Net Installment must start at margin 35
        const netInstCall = textCalls.find((c) => c.text.includes('அடுத்த மாத நிகர தவணை'));
        expect(netInstCall).toBeDefined();
        expect(netInstCall?.x).toBe(35);

        // Prized subscriber details header must start at margin 35
        const winnerDetailsCall = textCalls.find((c) => c.text.includes('வெற்றியாளர் விவரம்'));
        expect(winnerDetailsCall).toBeDefined();
        expect(winnerDetailsCall?.x).toBe(35);

        // Tie-breaker ceiling lot draw header must start at margin 35
        const tieLotCall = textCalls.find((c) => c.text.includes('குலுக்கல் முடிவு'));
        expect(tieLotCall).toBeDefined();
        expect(tieLotCall?.x).toBe(35);

        // Auction proceedings header must start at margin 35
        const proceedingsCall = textCalls.find((c) => c.text.includes('ஏல நடவடிக்கைகள்'));
        expect(proceedingsCall).toBeDefined();
        expect(proceedingsCall?.x).toBe(35);
      } finally {
        jest.restoreAllMocks();
      }
    });
  });

  describe('Fix 5 — Form XXI Subscriber Passbook Layout Invariants', () => {
    it('Fix 5: should bound table headers/cells and render statutory footer disclaimer centered at margin 30', async () => {
      const textCalls: { text: string; x?: number; y?: number; options?: any }[] = [];
      const origText = PDFDocument.prototype.text;
      jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
        this: any,
        text: any,
        x?: any,
        y?: any,
        options?: any,
      ) {
        textCalls.push({
          text: String(text),
          x: typeof x === 'number' ? x : undefined,
          y: typeof y === 'number' ? y : undefined,
          options: typeof x === 'object' ? x : typeof y === 'object' ? y : options,
        });
        return origText.apply(this, arguments as any);
      });

      try {
        const schedule = Array.from({ length: 5 }, (_, i) => ({
          installmentMonth: i + 1,
          dueDate: new Date(2026, i, 15),
          grossAmount: 5000n,
          dividendDeduction: 1000n,
          netPayableAmount: 4000n,
          paidAmount: 4000n,
          paymentDate: new Date(2026, i, 14),
          receiptNumber: `KC-REC-PRD-2026-M${i + 1}-001`,
          status: 'PAID' as const,
        }));

        const buffer = await FormXxiPassbookTemplate.generate({
          groupCode: 'KCA-1L-20M-01',
          groupName: 'Kumaran Chit Group A',
          chitValue: 100000n,
          durationMonths: 20,
          baseInstallment: 5000n,
          ticketNumber: 7,
          isPrized: true,
          customerCode: 'KC-CUST-00007',
          customerName: 'S. Sundaram',
          customerNameTamil: 'சுந்தரம்',
          phone: '9842143210',
          totalGrossDue: 20000n,
          totalDividendCredit: 4000n,
          totalNetPayable: 16000n,
          totalPaid: 16000n,
          totalOutstandingArrears: 0n,
          schedule,
        });

        expect(buffer.toString('utf8', 0, 5)).toBe('%PDF-');

        // Verify table headers have explicit widths and correct alignments
        const dueHeader = textCalls.find((c) => c.text === 'தவணை தேதி / Due Date');
        expect(dueHeader).toBeDefined();
        expect(dueHeader?.x).toBe(95);
        expect(dueHeader?.options?.width).toBe(85);

        const grossHeader = textCalls.find((c) => c.text === 'அடிப்படை / Gross');
        expect(grossHeader).toBeDefined();
        expect(grossHeader?.x).toBe(185);
        expect(grossHeader?.options?.width).toBe(75);
        expect(grossHeader?.options?.align).toBe('right');

        const statusHeader = textCalls.find((c) => c.text === 'நிலை / Status');
        expect(statusHeader).toBeDefined();
        expect(statusHeader?.x).toBe(730);
        expect(statusHeader?.options?.width).toBe(75);

        // Verify footer statutory passbook disclaimer starts at margin 30 (NOT inherited 710)
        const footerCall = textCalls.find((c) => c.text.includes('கணினி மூலம் உருவாக்கப்பட்ட அதிகாரப்பூர்வ சந்தாதாரர் பேரேடு'));
        expect(footerCall).toBeDefined();
        expect(footerCall?.x).toBe(30);
        expect(footerCall?.options?.width).toBeGreaterThanOrEqual(750);
        expect(footerCall?.options?.align).toBe('center');
      } finally {
        jest.restoreAllMocks();
      }
    });
  });
});
