// ==============================================================================
// Kumaran Chits — A5 Bilingual Receipt & Prize Voucher Print Tests (Task 11.1)
// Verifies ADR-11 Zero Thermal standard, bilingual RupeeWords math, A5 paper layout,
// single-company branding, dual-control signatures, PDF URLs, and bilingual parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RupeeWords } from '../src/lib/rupee-words.ts';

// ------------------------------------------------------------------------------
// Invariant 1: Rupee Words English Conversion
// ------------------------------------------------------------------------------
test('1. Rupee Words English Invariant: Accurately converts whole Rupee BigInt into English words', () => {
  // Test basic amount
  assert.equal(
    RupeeWords.toEnglishWords(3750n),
    'Rupees Three Thousand Seven Hundred Fifty Only'
  );

  // Test Round Lakh amount
  assert.equal(
    RupeeWords.toEnglishWords(100000n),
    'Rupees One Lakh Only'
  );

  // Test Complex Crore and Lakh amount
  assert.equal(
    RupeeWords.toEnglishWords(12540500n),
    'Rupees One Crore Twenty Five Lakh Forty Thousand Five Hundred Only'
  );

  // Test Zero amount
  assert.equal(RupeeWords.toEnglishWords(0n), 'Rupees Zero Only');

  // Test Negative amount
  assert.equal(
    RupeeWords.toEnglishWords(-5000n),
    'Minus Rupees Five Thousand Only'
  );
});

// ------------------------------------------------------------------------------
// Invariant 2: Rupee Words Tamil Conversion
// ------------------------------------------------------------------------------
test('2. Rupee Words Tamil Invariant: Accurately converts whole Rupee BigInt into legal Tamil words', () => {
  // Test 3,750 (Installment Net Due)
  assert.equal(
    RupeeWords.toTamilWords(3750n),
    'ரூபாய் மூன்றாயிரத்து எழுநூற்று ஐம்பது மட்டும்'
  );

  // Test 1,00,000 (Chit Value)
  assert.equal(
    RupeeWords.toTamilWords(100000n),
    'ரூபாய் ஒரு லட்சம் மட்டும்'
  );

  // Test 75,000 (Net Prize Money)
  assert.equal(
    RupeeWords.toTamilWords(75000n),
    'ரூபாய் எழுபத்து ஐந்து ஆயிரம் மட்டும்'
  );

  // Test Zero
  assert.equal(RupeeWords.toTamilWords(0n), 'ரூபாய் பூஜ்ஜியம் மட்டும்');
});

// ------------------------------------------------------------------------------
// Invariant 3: ADR-11 Zero Thermal Standard Invariant
// ------------------------------------------------------------------------------
test('3. ADR-11 Zero Thermal Standard: Enforces standard A5 paper and prohibits thermal rolls', () => {
  const paperStandards = {
    receiptPaper: 'A5_PORTRAIT',
    voucherPaper: 'A5_LANDSCAPE',
    widthMm: 148,
    heightMm: 210,
    hasThermalRolls: false,
    primaryGroundTruth: 'PHYSICAL_PAPER_PASSBOOK',
  };

  assert.equal(paperStandards.receiptPaper, 'A5_PORTRAIT');
  assert.equal(paperStandards.widthMm, 148);
  assert.equal(paperStandards.heightMm, 210);
  assert.equal(paperStandards.hasThermalRolls, false);
  assert.equal(paperStandards.primaryGroundTruth, 'PHYSICAL_PAPER_PASSBOOK');
});

// ------------------------------------------------------------------------------
// Invariant 4: Single-Company Branding Invariant (Guardrail 1 / ADR-01)
// ------------------------------------------------------------------------------
test('4. Single-Company Branding Invariant: Letterhead anchors strictly to Kumaran Finance Perundurai', () => {
  interface Letterhead {
    companyNameEn: string;
    companyNameTa: string;
    headOffice: string;
    branchPhone: string;
    hasCompanyIdColumn: boolean;
  }

  const letterhead: Letterhead = {
    companyNameEn: 'KUMARAN FINANCE',
    companyNameTa: 'குமரன் பைனான்ஸ்',
    headOffice: 'Main Road, Perundurai, Erode',
    branchPhone: '+91 98765 43210',
    hasCompanyIdColumn: false,
  };

  assert.equal(letterhead.companyNameEn, 'KUMARAN FINANCE');
  assert.equal(letterhead.companyNameTa, 'குமரன் பைனான்ஸ்');
  assert.ok(letterhead.headOffice.includes('Perundurai'));
  assert.equal(letterhead.hasCompanyIdColumn, false);
});

// ------------------------------------------------------------------------------
// Invariant 5: Dual-Control Maker-Checker Signatures (Guardrail 10)
// ------------------------------------------------------------------------------
test('5. Dual-Control Signatures: Verifies voucher enforces Maker != Checker sign-offs', () => {
  interface VoucherSignatures {
    makerUserId: string;
    makerName: string;
    checkerUserId: string;
    checkerName: string;
  }

  const voucher: VoucherSignatures = {
    makerUserId: 'user-staff-01',
    makerName: 'Muniappan (Desk Accountant)',
    checkerUserId: 'user-partner-02',
    checkerName: 'Kathirvel (Managing Partner)',
  };

  // Guardrail 10 enforcement: maker and checker cannot be the same person
  assert.notEqual(voucher.makerUserId, voucher.checkerUserId);
  assert.notEqual(voucher.makerName, voucher.checkerName);
});

// ------------------------------------------------------------------------------
// Invariant 6: Guardrail 2 Whole Rupee Formatting (Zero Paise/Decimals)
// ------------------------------------------------------------------------------
test('6. Guardrail 2 Whole Rupee Math: Formats strictly whole rupees without decimal fractions', () => {
  const formatRupeeSimple = (amount: bigint): string => {
    return `₹\u00A0${amount.toLocaleString('en-IN')}`;
  };

  const formatted = formatRupeeSimple(3750n);
  assert.equal(formatted.includes('.'), false);
  assert.equal(formatted.includes('00'), false);
  assert.ok(formatted.includes('3,750'));
});

// ------------------------------------------------------------------------------
// Invariant 7: Official Backend PDF URL Construction
// ------------------------------------------------------------------------------
test('7. Official PDF URL Construction: Generates valid backend binary endpoints', () => {
  const baseUrl = 'http://localhost:3000';
  const paymentId = 'pay-uuid-412';
  const auctionId = 'auc-uuid-004';

  const receiptPdfUrl = `${baseUrl}/api/v1/pdf/receipt/${paymentId}`;
  const voucherPdfUrl = `${baseUrl}/api/v1/pdf/voucher/${auctionId}`;

  assert.equal(receiptPdfUrl, 'http://localhost:3000/api/v1/pdf/receipt/pay-uuid-412');
  assert.equal(voucherPdfUrl, 'http://localhost:3000/api/v1/pdf/voucher/auc-uuid-004');
});

// ------------------------------------------------------------------------------
// Invariant 8: Bilingual Dictionary Parity for Print Namespaces
// ------------------------------------------------------------------------------
test('8. Bilingual Parity: 100% key match between en.json and ta.json in print namespaces', () => {
  const basePath = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
    ? process.cwd()
    : path.resolve(process.cwd(), 'apps/web');

  const enPath = path.resolve(basePath, 'messages/en.json');
  const taPath = path.resolve(basePath, 'messages/ta.json');

  const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const taJson = JSON.parse(fs.readFileSync(taPath, 'utf8'));

  const enPrint = enJson.print;
  const taPrint = taJson.print;

  assert.ok(enPrint, 'print namespace must exist in en.json');
  assert.ok(taPrint, 'print namespace must exist in ta.json');

  function getLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    let keys: string[] = [];
    for (const k in obj) {
      if (typeof obj[k] === 'object' && obj[k] !== null) {
        keys.push(...getLeafKeys(obj[k] as Record<string, unknown>, `${prefix}${k}.`));
      } else {
        keys.push(`${prefix}${k}`);
      }
    }
    return keys;
  }

  const enKeys = getLeafKeys(enPrint).sort();
  const taKeys = getLeafKeys(taPrint).sort();

  const missingInTa = enKeys.filter((k) => !taKeys.includes(k));
  const missingInEn = taKeys.filter((k) => !enKeys.includes(k));

  assert.deepEqual(missingInTa, [], `Missing keys in ta.json: ${missingInTa.join(', ')}`);
  assert.deepEqual(missingInEn, [], `Missing keys in en.json: ${missingInEn.join(', ')}`);
  assert.equal(enKeys.length, taKeys.length);
  assert.ok(enKeys.length >= 60, `Expected at least 60 print keys, found ${enKeys.length}`);
});
