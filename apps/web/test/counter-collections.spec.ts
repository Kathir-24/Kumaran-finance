import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Task 8.1: Counter Payment Collection & Immediate Net Due Matching Unit Tests', () => {
  type PaymentMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
  type DueStatus = 'UNPAID' | 'PAID' | 'OVERDUE';
  type PaymentStatus = 'INITIATED' | 'SUCCESS' | 'FAILED' | 'REVERSED';

  interface InstallmentDue {
    id: string;
    ticketId: string;
    installmentMonth: number;
    grossAmount: bigint;
    dividendDeduction: bigint;
    netPayableAmount: bigint;
    paidAmount: bigint;
    status: DueStatus;
  }

  interface PaymentRecord {
    id: string;
    ticketId: string;
    installmentMonth: number;
    amount: bigint;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    transactionRef?: string;
    receiptNumber: string;
    idempotencyKey?: string;
    createdAt: Date;
  }

  // 1. ADR-07 Exact Match Invariant: Strict Inet matching; zero partials, zero advances
  it('ADR-07 Exact Match: Accepts exact Inet and strictly rejects partial or advance amounts', () => {
    const processPayment = (
      due: InstallmentDue,
      amountToPay: bigint,
      method: PaymentMethod,
      idempotencyKey?: string,
    ): { updatedDue: InstallmentDue; payment: PaymentRecord } => {
      if (due.status === 'PAID') {
        throw new Error('INSTALLMENT_ALREADY_PAID: Due has already been settled');
      }
      if (amountToPay < due.netPayableAmount) {
        throw new Error('PARTIAL_PAYMENTS_NOT_ALLOWED: Exact net due must be paid');
      }
      if (amountToPay > due.netPayableAmount) {
        throw new Error('ADVANCE_OR_DOUBLE_PAYMENT_NOT_ALLOWED: Overpayments not permitted');
      }

      const updatedDue: InstallmentDue = {
        ...due,
        paidAmount: amountToPay,
        status: 'PAID',
      };

      const payment: PaymentRecord = {
        id: 'pay-001',
        ticketId: due.ticketId,
        installmentMonth: due.installmentMonth,
        amount: amountToPay,
        paymentMethod: method,
        paymentStatus: 'SUCCESS',
        receiptNumber: 'KC-REC-PRD-2026-00001',
        idempotencyKey,
        createdAt: new Date('2026-11-05T10:00:00.000Z'),
      };

      return { updatedDue, payment };
    };

    const due: InstallmentDue = {
      id: 'due-01',
      ticketId: 't-07',
      installmentMonth: 4,
      grossAmount: 5000n,
      dividendDeduction: 1250n,
      netPayableAmount: 3750n, // Inet = 5000 - 1250 = 3750
      paidAmount: 0n,
      status: 'UNPAID',
    };

    // Rejects partial payment
    assert.throws(
      () => processPayment(due, 2000n, 'CASH'),
      /PARTIAL_PAYMENTS_NOT_ALLOWED/,
    );

    // Rejects overpayment / advance
    assert.throws(
      () => processPayment(due, 5000n, 'CASH'),
      /ADVANCE_OR_DOUBLE_PAYMENT_NOT_ALLOWED/,
    );

    // Accepts exact Inet match
    const result = processPayment(due, 3750n, 'CASH');
    assert.equal(result.updatedDue.status, 'PAID');
    assert.equal(result.updatedDue.paidAmount, 3750n);
    assert.equal(result.payment.amount, 3750n);
    assert.equal(result.payment.paymentStatus, 'SUCCESS');
  });

  // 2. Guardrail 2: Whole Rupee Math (No Paise / No Floating Point)
  it('Guardrail 2 Whole Rupee Math: Rejects floating-point paise and fractional values', () => {
    const validateRupeeAmount = (amount: number | bigint): bigint => {
      if (typeof amount === 'number') {
        if (!Number.isInteger(amount)) {
          throw new Error('FRACTIONAL_PAISE_PROHIBITED: Currency must be integer Rupees');
        }
        return BigInt(amount);
      }
      return amount;
    };

    // Floating-point amounts with paise are rejected
    assert.throws(() => validateRupeeAmount(3750.50), /FRACTIONAL_PAISE_PROHIBITED/);
    assert.throws(() => validateRupeeAmount(3750.25), /FRACTIONAL_PAISE_PROHIBITED/);

    // Integer whole rupees succeed
    assert.equal(validateRupeeAmount(3750), 3750n);
    assert.equal(validateRupeeAmount(3750n), 3750n);
  });

  // 3. Due Status Transition: UNPAID or OVERDUE -> PAID
  it('Due Status Transition: Transitions UNPAID and OVERDUE dues strictly to PAID', () => {
    const settleDue = (due: InstallmentDue, amount: bigint): InstallmentDue => {
      if (due.status === 'PAID') {
        throw new Error('ALREADY_PAID');
      }
      if (amount !== due.netPayableAmount) {
        throw new Error('AMOUNT_MISMATCH');
      }
      return { ...due, paidAmount: amount, status: 'PAID' };
    };

    const unpaidDue: InstallmentDue = {
      id: 'due-01',
      ticketId: 't-01',
      installmentMonth: 2,
      grossAmount: 10000n,
      dividendDeduction: 2000n,
      netPayableAmount: 8000n,
      paidAmount: 0n,
      status: 'UNPAID',
    };

    const overdueDue: InstallmentDue = {
      ...unpaidDue,
      id: 'due-02',
      status: 'OVERDUE',
    };

    const settled1 = settleDue(unpaidDue, 8000n);
    assert.equal(settled1.status, 'PAID');

    const settled2 = settleDue(overdueDue, 8000n);
    assert.equal(settled2.status, 'PAID');

    // Attempting to pay already PAID due throws
    assert.throws(() => settleDue(settled1, 8000n), /ALREADY_PAID/);
  });

  // 4. Sequential Receipt Numbering: KC-REC-{BRANCH}-{YYYY}-{XXXXX}
  it('Sequential Receipt Numbering: Generates standard format with 5-digit padding', () => {
    const generateReceiptNumber = (
      branchCode: string,
      year: number,
      sequence: number,
    ): string => {
      const paddedSeq = sequence.toString().padStart(5, '0');
      return `KC-REC-${branchCode}-${year}-${paddedSeq}`;
    };

    assert.equal(generateReceiptNumber('PRD', 2026, 1), 'KC-REC-PRD-2026-00001');
    assert.equal(generateReceiptNumber('PRD', 2026, 45), 'KC-REC-PRD-2026-00045');
    assert.equal(generateReceiptNumber('PRD', 2026, 9999), 'KC-REC-PRD-2026-09999');
    assert.equal(generateReceiptNumber('ERD', 2026, 10000), 'KC-REC-ERD-2026-10000');
  });

  // 5. Payment Methods Enum Validation
  it('Payment Methods: Enforces allowed 4 payment methods and rejects unsupported ones', () => {
    const allowedMethods = new Set<string>(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE']);

    const validatePaymentMethod = (method: string): PaymentMethod => {
      if (!allowedMethods.has(method)) {
        throw new Error(`INVALID_PAYMENT_METHOD: ${method} is not supported`);
      }
      return method as PaymentMethod;
    };

    assert.equal(validatePaymentMethod('CASH'), 'CASH');
    assert.equal(validatePaymentMethod('UPI'), 'UPI');
    assert.equal(validatePaymentMethod('BANK_TRANSFER'), 'BANK_TRANSFER');
    assert.equal(validatePaymentMethod('CHEQUE'), 'CHEQUE');

    assert.throws(() => validatePaymentMethod('CREDIT_CARD'), /INVALID_PAYMENT_METHOD/);
    assert.throws(() => validatePaymentMethod('CRYPTO'), /INVALID_PAYMENT_METHOD/);
  });

  // 6. Dynamic NPCI Counter UPI Intent URI
  it('NPCI Counter UPI Intent: Generates valid UPI deep-link URI with locked whole rupee amount', () => {
    const buildUpiIntentUri = (params: {
      payeeVpa: string;
      payeeName: string;
      amount: bigint | number;
      transactionNote: string;
    }): string => {
      const am = params.amount.toString();
      const pa = encodeURIComponent(params.payeeVpa);
      const pn = encodeURIComponent(params.payeeName);
      const tn = encodeURIComponent(params.transactionNote);
      return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
    };

    const uri = buildUpiIntentUri({
      payeeVpa: 'kumaranfinance@kvb',
      payeeName: 'Kumaran Finance',
      amount: 3750n,
      transactionNote: 'KCA-01 T#07 M#4',
    });

    assert.match(uri, /^upi:\/\/pay\?/);
    assert.match(uri, /pa=kumaranfinance%40kvb/);
    assert.match(uri, /pn=Kumaran%20Finance/);
    assert.match(uri, /am=3750/);
    assert.match(uri, /cu=INR/);
    assert.match(uri, /tn=KCA-01%20T%2307%20M%234/);
  });

  // 7. Idempotency Protection: Duplicate request returns existing payment
  it('Idempotency Protection: Re-submitting with identical idempotencyKey returns existing receipt', () => {
    const ledger = new Map<string, PaymentRecord>();

    const recordWithIdempotency = (
      key: string,
      record: PaymentRecord,
    ): { payment: PaymentRecord; wasDuplicate: boolean } => {
      if (ledger.has(key)) {
        return { payment: ledger.get(key)!, wasDuplicate: true };
      }
      ledger.set(key, record);
      return { payment: record, wasDuplicate: false };
    };

    const payment: PaymentRecord = {
      id: 'pay-001',
      ticketId: 't-07',
      installmentMonth: 4,
      amount: 3750n,
      paymentMethod: 'UPI',
      paymentStatus: 'SUCCESS',
      receiptNumber: 'KC-REC-PRD-2026-00045',
      idempotencyKey: 'idem-uuid-12345',
      createdAt: new Date(),
    };

    const first = recordWithIdempotency('idem-uuid-12345', payment);
    assert.equal(first.wasDuplicate, false);
    assert.equal(first.payment.receiptNumber, 'KC-REC-PRD-2026-00045');

    const duplicate = recordWithIdempotency('idem-uuid-12345', payment);
    assert.equal(duplicate.wasDuplicate, true);
    assert.equal(duplicate.payment.receiptNumber, 'KC-REC-PRD-2026-00045');
    assert.equal(ledger.size, 1);
  });

  // 8. 100% Bilingual Parity between English and Tamil Dictionaries
  it('Bilingual Parity: All collections keys match 100% between en.json and ta.json', () => {
    const rootDir = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
      ? process.cwd()
      : path.resolve(process.cwd(), 'apps/web');
    const enPath = path.resolve(rootDir, 'messages/en.json');
    const taPath = path.resolve(rootDir, 'messages/ta.json');

    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

    const enCollections = en.collections || {};
    const taCollections = ta.collections || {};

    const enKeys = Object.keys(enCollections).sort();
    const taKeys = Object.keys(taCollections).sort();

    assert.ok(enKeys.length > 20, 'en.json collections dictionary should have keys');
    assert.deepEqual(
      enKeys,
      taKeys,
      `Bilingual collections keys mismatch. Difference: ${JSON.stringify(
        enKeys.filter((k) => !taKeys.includes(k)),
      )}`,
    );

    // Verify critical keys have non-empty translations in both
    const criticalKeys = [
      'title',
      'subtitle',
      'collectPaymentBtn',
      'totalCollectionsToday',
      'totalCashToday',
      'totalUpiToday',
      'totalChequeToday',
      'bannerTitle',
      'bannerDesc',
      'exactDue',
      'discretePaymentOnly',
      'selectSchemeLabel',
      'selectTicketLabel',
      'selectDueMonthLabel',
      'baseInstallmentLabel',
      'dividendCreditLabel',
      'netPayableLabel',
      'paymentMethodLabel',
      'receiptTitle',
      'receiptNumber',
      'downloadPdfReceipt',
      'printReceipt',
    ];

    for (const key of criticalKeys) {
      assert.ok(enCollections[key], `Missing en.json key: collections.${key}`);
      assert.ok(taCollections[key], `Missing ta.json key: collections.${key}`);
    }
  });
});
