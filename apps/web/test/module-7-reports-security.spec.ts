// ==============================================================================
// Kumaran Chits — Module 7 Web Reports, CSV/PDF Security, BigInt & RBAC Tests
// Verifies permanent fixes for M7-WEB-01..M7-WEB-06 directly against live modules.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  escapeCsvCell,
  sanitizeCsvFilename,
  serializeCsv,
} from '../src/lib/csv-export.ts';
import {
  downloadReceiptPdf,
  sanitizePdfFilename,
} from '../src/lib/pdf-download.ts';
import { KumaranApiError } from '../src/lib/api-client.ts';
import {
  calculateCommissionRupees,
  formatCommissionRateLabel,
  formatIstDateString,
  formatIstDisplayDate,
  formatIstDisplayTime,
  parseCommissionRateToBps,
  sumWholeRupees,
  toSafeBigInt,
} from '../src/components/reports/report-bigint.ts';
import {
  buildCanonicalVoucherNumber,
  mapVoucherApiResponseToVoucherData,
} from '../src/components/print/voucher-mapper.ts';
import {
  buildAuditLogsQueryParams,
  canQueryDashboardReports,
  canUserRecordRegistrarFiling,
  evaluateApprovalBannerAccess,
  isInvertedDateRange,
  parseTicketFilterParam,
  resolveDefaultersInitialBranchId,
  resolveFormXviiFilingCountdown,
  resolveFormXviiKpiCounts,
  resolvePrimaryQueueHref,
} from '../src/components/reports/report-access.ts';
import { isRoleAuthorizedForPath } from '../src/lib/route-permissions.ts';
import { formatRupee } from '../src/lib/currency.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, '..');

test('M7-WEB-01: CSV export neutralizes OWASP formula injection (=, +, -, @, tab, CR + leading whitespace) & emits UTF-8 BOM', () => {
  // Formula triggers at column start
  assert.equal(escapeCsvCell('=SUM(A1:A10)'), "'=SUM(A1:A10)");
  assert.equal(escapeCsvCell('+2+3'), "'+2+3");
  assert.equal(escapeCsvCell('-1+1'), "'-1+1");
  assert.equal(escapeCsvCell('@SUM(1,2)'), `"'@SUM(1,2)"`);
  assert.equal(escapeCsvCell('\t=CMD()'), "'\t=CMD()");
  assert.equal(escapeCsvCell('\r+1'), `"'` + '\r+1"');

  // Formula triggers after leading whitespace
  assert.equal(escapeCsvCell('   =HYPERLINK("http://evil.example")'), `"'   =HYPERLINK(""http://evil.example"")"`);
  assert.equal(escapeCsvCell(' \t +cmd|/C calc!A0'), "' \t +cmd|/C calc!A0");
  assert.equal(escapeCsvCell('  -100'), "'  -100");
  assert.equal(escapeCsvCell('  @import'), "'  @import");

  // RFC-4180 double-quote escaping & BigInt preservation
  assert.equal(escapeCsvCell('Perundurai, "Head Office"'), '"Perundurai, ""Head Office"""');
  assert.equal(escapeCsvCell(9007199254740993n), '9007199254740993');
  assert.equal(escapeCsvCell(null), '');
  assert.equal(escapeCsvCell(undefined), '');

  // UTF-8 BOM + Tamil Unicode script preservation
  const serialized = serializeCsv(
    ['நிறுவனம்', 'தொகை'],
    [['குமரன் பைனான்ஸ்', '=1+1']],
  );
  assert.ok(serialized.startsWith('\uFEFF'), 'CSV output must start with UTF-8 BOM for Excel Tamil rendering');
  assert.ok(serialized.includes('குமரன் பைனான்ஸ்'));
  assert.ok(serialized.includes("'=1+1"));

  // Filename sanitization
  assert.equal(sanitizeCsvFilename('../../etc/passwd'), 'etc_passwd.csv');
  assert.equal(sanitizeCsvFilename('day-book\r\n.csv'), 'day-book.csv');
  assert.equal(sanitizeCsvFilename('form_xxii_2026-10-22'), 'form_xxii_2026-10-22.csv');
});

test('M7-WEB-02: PDF download sanitizes filenames, forwards credentials: include, and rejects empty/non-Blob payloads', async () => {
  assert.equal(sanitizePdfFilename('../../../voucher.pdf'), 'voucher.pdf');
  assert.equal(sanitizePdfFilename('receipt:KC/001\r\n'), 'receipt_KC_001.pdf');
  assert.equal(sanitizePdfFilename('   '), 'kumaran-document.pdf');

  // Rejects empty blob with typed KumaranApiError
  const emptyBlobClient = {
    GET: async () => ({
      data: new Blob([], { type: 'application/pdf' }),
      response: new Response(null, { status: 200 }),
    }),
  } as any;

  await assert.rejects(
    async () =>
      downloadReceiptPdf('pay-empty', 'empty.pdf', {
        getClient: () => emptyBlobClient,
        triggerDownload: () => assert.fail('Must not download empty blob'),
      }),
    (err: unknown) => err instanceof KumaranApiError && err.code === 'INVALID_PDF_PAYLOAD',
  );

  // Verifies sanitized filename & credentials: 'include'
  let capturedOpts: any = null;
  let capturedFilename = '';
  const validBlob = new Blob(['%PDF-1.4-valid'], { type: 'application/pdf' });
  const validClient = {
    GET: async (_url: string, opts: any) => {
      capturedOpts = opts;
      return { data: validBlob, response: new Response(validBlob, { status: 200 }) };
    },
  } as any;

  await downloadReceiptPdf('pay-ok', '../evil/receipt-001', {
    getClient: () => validClient,
    triggerDownload: (_blob, name) => {
      capturedFilename = name;
    },
  });

  assert.equal(capturedOpts?.credentials, 'include');
  assert.equal(capturedFilename, 'evil_receipt-001.pdf');
});

test('M7-WEB-03: Voucher print mapper unwraps backend VoucherDataInput, preserves BigInt & canonical KC-VOU format', () => {
  const backendPayload = {
    voucherNumber: 'KC-VOU-PRD-2026-KCA-1L-20M-01-00004',
    isBilingual: true,
    issuedAt: '2026-11-18T07:00:00.000Z',
    data: {
      voucherNumber: 'KC-VOU-PRD-2026-KCA-1L-20M-01-00004',
      disbursedAt: '2026-11-18T07:00:00.000Z',
      chitGroupCode: 'KCA-1L-20M-01',
      chitValue: '9007199254740993',
      durationMonths: 20,
      installmentMonth: 4,
      ticketNumber: 7,
      subscriberName: 'M. Selvam',
      subscriberTamilName: 'எம். செல்வம்',
      customerCode: 'KC-CUST-00007',
      subscriberMobile: '9842700007',
      bidDiscount: '25000',
      grossPrizeMoney: '9007199254715993',
      arrearsDeducted: '3950',
      prizeMoney: '9007199254712043',
      disbursementMode: 'BANK_TRANSFER_NEFT',
      paymentReference: 'KVB-NEFT-20261118-001',
      makerName: 'Ramesh (Accountant)',
      checkerName: 'Kathirvel (Partner)',
      branchName: 'Head Office - Perundurai',
      branchPhone: '+91 98765 43210',
    },
    formattedText: '...',
  };

  const mapped = mapVoucherApiResponseToVoucherData(backendPayload);
  assert.equal(mapped.voucherNumber, 'KC-VOU-PRD-2026-KCA-1L-20M-01-00004');
  assert.equal(mapped.chitGroupCode, 'KCA-1L-20M-01');
  assert.equal(mapped.installmentMonth, 4);
  assert.equal(mapped.ticketNumber, 7);
  assert.equal(mapped.winnerCode, 'KC-CUST-00007');
  assert.equal(mapped.winnerName, 'M. Selvam');
  assert.equal(mapped.winnerNameTamil, 'எம். செல்வம்');
  assert.equal(mapped.winnerPhone, '9842700007');
  assert.equal(mapped.chitValue, 9007199254740993n);
  assert.equal(mapped.grossPrizeMoney, 9007199254715993n);
  assert.equal(mapped.arrearsDeducted, 3950n);
  assert.equal(mapped.netPrizeMoney, 9007199254712043n);
  assert.equal(mapped.verifiedByUserName, 'Ramesh (Accountant)');
  assert.equal(mapped.authorizedByUserName, 'Kathirvel (Partner)');

  // Canonical fallback when voucherNumber omitted
  const fallbackNo = buildCanonicalVoucherNumber({
    branchCode: 'PRD',
    issuedAt: '2026-11-18T00:00:00.000Z',
    groupCode: 'KCA-1L-20M-01',
    installmentMonth: 4,
  });
  assert.equal(fallbackNo, 'KC-VOU-PRD-2026-KCA-1L-20M-01-00004');

  // Guardrail 9 & 11 static checks on voucher-print-template.tsx
  const voucherSource = fs.readFileSync(
    path.join(WEB_ROOT, 'src/components/print/voucher-print-template.tsx'),
    'utf8',
  );
  assert.equal(/property\s+deed/i.test(voucherSource), false, 'Voucher must contain zero property-deed text (Guardrail 9)');
  assert.equal(
    voucherSource.includes('Partner / Manager Signature'),
    false,
    'Branch Manager cannot sign as prize payout Checker (Guardrail 10/11)',
  );
});

test('M7-WEB-04: Guardrail 2 BigInt report math avoids Number() overflow, NaN, and hardcoded 4% commission', () => {
  const hugeA = '9007199254740993'; // 2^53 + 1 (Number loses precision here)
  const hugeB = '1';
  assert.equal(toSafeBigInt(hugeA), 9007199254740993n);
  assert.equal(sumWholeRupees([hugeA, hugeB]), 9007199254740994n);
  assert.equal(formatRupee(sumWholeRupees([hugeA, hugeB])), '₹9,00,71,99,25,47,40,994');

  // Safe non-throwing parsing for empty/malformed/NaN inputs
  assert.equal(toSafeBigInt(''), 0n);
  assert.equal(toSafeBigInt(Number.NaN), 0n);
  assert.equal(toSafeBigInt(Number.POSITIVE_INFINITY), 0n);
  assert.equal(toSafeBigInt('-25000'), -25000n);
  assert.equal(toSafeBigInt('₹1,00,000.50'), 100000n);

  // Dynamic frozen commission rate (ADR-04 / Guardrail 3)
  assert.equal(parseCommissionRateToBps('4.00%'), 400n);
  assert.equal(parseCommissionRateToBps('3.5%'), 350n);
  assert.equal(parseCommissionRateToBps('5'), 500n);
  assert.equal(calculateCommissionRupees('100000', '4.00%'), 4000n);
  assert.equal(calculateCommissionRupees('100000', '3.50%'), 3500n);
  assert.equal(formatCommissionRateLabel('3.5'), '3.50%');

  // IST date formatter never outputs malformed string
  assert.match(formatIstDateString(new Date('2026-11-18T19:00:00.000Z')), /^2026-11-19$/);
});

test('M7-WEB-05: Guardrail 10 & 11 RBAC for audit logs, RegistrarFilingModal & PendingApprovalsBanner', () => {
  // 1. Audit logs strictly SUPER_ADMIN only
  assert.equal(isRoleAuthorizedForPath('/reports/audit-logs', ['SUPER_ADMIN']), true);
  assert.equal(isRoleAuthorizedForPath('/reports/audit-logs', ['AUDITOR']), false);
  assert.equal(isRoleAuthorizedForPath('/reports/audit-logs', ['BRANCH_MANAGER']), false);
  assert.equal(isRoleAuthorizedForPath('/reports/audit-logs', ['ACCOUNTANT']), false);

  // 2. Registrar filing gate (XR-AUC-05 / Guardrail 11)
  assert.equal(canUserRecordRegistrarFiling({ roles: ['PARTNER'] }), true);
  assert.equal(canUserRecordRegistrarFiling({ roles: ['SUPER_ADMIN'] }), false);
  assert.equal(canUserRecordRegistrarFiling({ roles: ['BRANCH_MANAGER'] }), true);
  assert.equal(canUserRecordRegistrarFiling({ roles: ['ACCOUNTANT'] }), true);
  assert.equal(canUserRecordRegistrarFiling({ roles: ['AUDITOR'] }), false);

  // 3. PendingApprovalsBanner access evaluation (Guardrail 11)
  const partnerAccess = evaluateApprovalBannerAccess({ roles: ['PARTNER'] });
  assert.equal(partnerAccess.canApproveFinancial, true);
  assert.equal(partnerAccess.isNonPartnerSuperAdmin, false);

  const itAdminAccess = evaluateApprovalBannerAccess({ roles: ['SUPER_ADMIN'] });
  assert.equal(itAdminAccess.canApproveFinancial, false);
  assert.equal(itAdminAccess.isNonPartnerSuperAdmin, true);

  const auditorAccess = evaluateApprovalBannerAccess({ roles: ['AUDITOR'] });
  assert.equal(auditorAccess.isReadOnlyAuditor, true);
  assert.equal(auditorAccess.canApproveFinancial, false);
});

test('M7-WEB-06: 100% Bilingual i18n key parity across reports, dashboard, and print namespaces', () => {
  const en = JSON.parse(fs.readFileSync(path.join(WEB_ROOT, 'messages/en.json'), 'utf8'));
  const ta = JSON.parse(fs.readFileSync(path.join(WEB_ROOT, 'messages/ta.json'), 'utf8'));

  const flatten = (obj: Record<string, unknown>, prefix = ''): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${key}` : key;
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        Object.assign(out, flatten(val as Record<string, unknown>, full));
      } else {
        out[full] = String(val ?? '');
      }
    }
    return out;
  };

  for (const ns of ['reports', 'dashboard', 'print'] as const) {
    const enFlat = flatten(en[ns], ns);
    const taFlat = flatten(ta[ns], ns);
    const enKeys = Object.keys(enFlat).sort();
    const taKeys = Object.keys(taFlat).sort();

    assert.deepEqual(
      enKeys.filter((k) => !(k in taFlat)),
      [],
      `Missing ${ns} keys in ta.json`,
    );
    assert.deepEqual(
      taKeys.filter((k) => !(k in enFlat)),
      [],
      `Missing ${ns} keys in en.json`,
    );
    for (const k of enKeys) {
      assert.ok(enFlat[k].trim().length > 0, `Empty en.json value for ${k}`);
      assert.ok(taFlat[k].trim().length > 0, `Empty ta.json value for ${k}`);
    }
  }
});

test('R2-WEB-01..05: IST query/print dates, 8-queue approval routing, safe ticketNumber param & FilingCountdownWidget backend alignment', () => {
  // R2-WEB-01: Plain YYYY-MM-DD query params + inverted range guard + IST +05:30 filing date
  const q = buildAuditLogsQueryParams({
    selectedAction: 'ALL',
    selectedEntity: 'ALL',
    selectedUserId: 'ALL',
    fromDate: '2026-11-18',
    toDate: '2026-11-18',
    page: 1,
    limit: 50,
  });
  assert.equal(q.fromDate, '2026-11-18');
  assert.equal(q.toDate, '2026-11-18');
  assert.equal(isInvertedDateRange('2026-11-19', '2026-11-18'), true);
  assert.equal(isInvertedDateRange('2026-11-18', '2026-11-18'), false);

  const registrarModalSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/components/reports/registrar-filing-modal.tsx'),
    'utf8',
  );
  assert.ok(
    registrarModalSrc.includes('T00:00:00.000+05:30'),
    'RegistrarFilingModal must parse filedDate in IST (+05:30), not UTC Z',
  );

  // R2-WEB-02: All 8 approval queues route to exact operational screens
  const zeroBase = {
    totalPendingCount: 1,
    cashHandoversCount: 0,
    disbursementAuthorizationsCount: 0,
    paymentReversalsCount: 0,
    safetyProofVerificationsCount: 0,
  };
  assert.equal(resolvePrimaryQueueHref({ ...zeroBase, auctionFinalizationsCount: 1 }), '/auctions');
  assert.equal(resolvePrimaryQueueHref({ ...zeroBase, auctionCorrectionsCount: 1 }), '/auctions');
  assert.equal(resolvePrimaryQueueHref({ ...zeroBase, defaulterRemovalsCount: 1 }), '/reports/defaulters');
  assert.equal(resolvePrimaryQueueHref({ ...zeroBase, finalMonthSettlementsCount: 1 }), '/disbursements');
  assert.equal(resolvePrimaryQueueHref({ ...zeroBase, cashHandoversCount: 1 }), '/collections/handover');
  assert.equal(resolvePrimaryQueueHref({ ...zeroBase, paymentReversalsCount: 1 }), '/reversals');

  // R2-WEB-03: FilingCountdownWidget fetches limit >= 50 before branch scoping & prefers backend filingDaysRemaining
  const countdownSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/components/dashboard/filing-countdown-widget.tsx'),
    'utf8',
  );
  assert.ok(countdownSrc.includes('limit: 50'), 'FilingCountdownWidget must fetch limit: 50 before branch filtering');
  assert.ok(countdownSrc.includes('filingDaysRemaining'), 'FilingCountdownWidget must prefer backend filingDaysRemaining');
  assert.ok(countdownSrc.includes('isFilingOverdue'), 'FilingCountdownWidget must prefer backend isFilingOverdue');

  // R2-WEB-04: Print dates strictly format in IST (Asia/Kolkata) and guard invalid dates
  // 2026-11-18T19:00:00.000Z is 19 Nov 2026, 12:30 am IST
  assert.ok(formatIstDisplayDate('2026-11-18T19:00:00.000Z').includes('19'));
  assert.equal(formatIstDisplayDate('not-a-date'), '—');
  assert.equal(formatIstDisplayDate(null), '—');
  assert.equal(formatIstDisplayTime('not-a-date'), '—');
  assert.match(formatIstDisplayTime('2026-11-18T19:00:00.000Z'), /12:30/i);

  // R2-WEB-05: Safe ?ticketNumber= query parsing rejects NaN / 0 / negatives / non-integers
  assert.equal(parseTicketFilterParam('abc'), 'ALL');
  assert.equal(parseTicketFilterParam('0'), 'ALL');
  assert.equal(parseTicketFilterParam('-5'), 'ALL');
  assert.equal(parseTicketFilterParam('3.5'), 'ALL');
  assert.equal(parseTicketFilterParam(''), 'ALL');
  assert.equal(parseTicketFilterParam(null), 'ALL');
  assert.equal(parseTicketFilterParam('7'), 7);
});

test('XR-M7-WEB-01..04: Round-3 Defaulters branch scoping, IST dates/Form XVII backend alignment, audit IP truthfulness & dashboard query RBAC', () => {
  // XR-M7-WEB-01: Non-global roles ignore stale activeBranchId and lock to user.branchId
  assert.equal(
    resolveDefaultersInitialBranchId(
      { roles: ['BRANCH_MANAGER'], branchId: 'branch-perundurai' },
      'branch-stale-other',
    ),
    'branch-perundurai',
  );
  assert.equal(
    resolveDefaultersInitialBranchId(
      { roles: ['COLLECTION_AGENT'], branchId: 'branch-perundurai' },
      'branch-stale-other',
    ),
    'branch-perundurai',
  );
  assert.equal(
    resolveDefaultersInitialBranchId(
      { roles: ['SUPER_ADMIN'], branchId: 'branch-perundurai' },
      'branch-erode',
    ),
    'branch-erode',
  );
  assert.equal(
    resolveDefaultersInitialBranchId({ roles: ['AUDITOR'], branchId: null }, null),
    '',
  );
  const defaultersPageSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/app/(dashboard)/reports/defaulters/page.tsx'),
    'utf8',
  );
  assert.ok(
    defaultersPageSrc.includes('resolveDefaultersInitialBranchId'),
    'Defaulters page must initialize and enforce branch scoping via resolveDefaultersInitialBranchId',
  );

  // XR-M7-WEB-02: Form XVII countdown & KPI counts prefer backend IST fields; report/dashboard dates use Asia/Kolkata
  const backendCountdown = resolveFormXviiFilingCountdown({
    auctionDate: '2026-11-01T00:00:00.000Z',
    filedAtRegistrar: false,
    filingDaysRemaining: 4,
    isFilingOverdue: false,
  });
  assert.deepEqual(backendCountdown, { daysRemaining: 4, isOverdue: false, isUrgent: true });

  const backendOverdue = resolveFormXviiFilingCountdown({
    auctionDate: '2026-11-01T00:00:00.000Z',
    filedAtRegistrar: false,
    filingDaysRemaining: -2,
    isFilingOverdue: true,
  });
  assert.deepEqual(backendOverdue, { daysRemaining: -2, isOverdue: true, isUrgent: false });

  const summaryCounts = resolveFormXviiKpiCounts(
    [],
    { totalFinalized: 10, filedCount: 6, pendingCount: 3, overdueCount: 1 },
  );
  assert.deepEqual(summaryCounts, {
    totalFinalized: 10,
    filedCount: 6,
    pendingCount: 3,
    overdueCount: 1,
  });

  const perAuctionCounts = resolveFormXviiKpiCounts([
    { auctionDate: '2026-11-01T00:00:00.000Z', filedAtRegistrar: true },
    {
      auctionDate: '2026-11-01T00:00:00.000Z',
      filedAtRegistrar: false,
      filingDaysRemaining: 7,
      isFilingOverdue: false,
    },
    {
      auctionDate: '2026-10-01T00:00:00.000Z',
      filedAtRegistrar: false,
      filingDaysRemaining: -3,
      isFilingOverdue: true,
    },
  ]);
  assert.deepEqual(perAuctionCounts, {
    totalFinalized: 3,
    filedCount: 1,
    pendingCount: 1,
    overdueCount: 1,
  });

  for (const relPath of [
    'src/components/reports/form-xvii-auction-card.tsx',
    'src/components/reports/form-xxi-table.tsx',
    'src/components/reports/defaulter-analysis-table.tsx',
    'src/app/(dashboard)/page.tsx',
  ]) {
    const src = fs.readFileSync(path.join(WEB_ROOT, relPath), 'utf8');
    assert.ok(
      src.includes("timeZone: 'Asia/Kolkata'"),
      `${relPath} must format display dates explicitly in IST (timeZone: 'Asia/Kolkata')`,
    );
  }

  // XR-M7-WEB-03: Zero fabricated '127.0.0.1' IP fallbacks in audit log table or CSV export
  const auditTableSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/components/reports/audit-log-table.tsx'),
    'utf8',
  );
  const auditPageSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/app/(dashboard)/reports/audit-logs/page.tsx'),
    'utf8',
  );
  assert.ok(!auditTableSrc.includes('127.0.0.1'), 'audit-log-table.tsx must not fabricate 127.0.0.1');
  assert.ok(!auditPageSrc.includes('127.0.0.1'), 'audit-logs/page.tsx must not fabricate 127.0.0.1');

  // XR-M7-WEB-04: Dashboard report queries strictly gated to authorized office/audit roles
  assert.equal(canQueryDashboardReports({ roles: ['PARTNER'] }), true);
  assert.equal(canQueryDashboardReports({ roles: ['SUPER_ADMIN'] }), false);
  assert.equal(canQueryDashboardReports({ roles: ['BRANCH_MANAGER'] }), true);
  assert.equal(canQueryDashboardReports({ roles: ['ACCOUNTANT'] }), true);
  assert.equal(canQueryDashboardReports({ roles: ['AUDITOR'] }), true);
  assert.equal(canQueryDashboardReports({ roles: ['COLLECTION_AGENT'] }), false);
  assert.equal(canQueryDashboardReports({ roles: ['CUSTOMER'] }), false);
  assert.equal(canQueryDashboardReports({ roles: [] }), false);
  assert.equal(canQueryDashboardReports(null), false);

  const dashboardPageSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/app/(dashboard)/page.tsx'),
    'utf8',
  );
  const enabledMatches = dashboardPageSrc.match(/enabled:\s*canViewDashboardReports/g) || [];
  assert.equal(
    enabledMatches.length,
    2,
    'Dashboard page must gate both /reports/dashboard and /reports/pending-approvals queries with enabled: canViewDashboardReports',
  );
  assert.ok(
    dashboardPageSrc.includes('enabled={canViewDashboardReports}'),
    'Dashboard page must gate FilingCountdownWidget with enabled={canViewDashboardReports}',
  );
});

test('M10-WEB-FORENSIC: Real-Time SSE Stream, Full 8-Queue Approvals, and IST Date Safety Invariants', () => {
  // 1. formatIstDateString handles invalid Date instances without throwing RangeError: Invalid time value
  const invalidDate = new Date('invalid-date-string');
  assert.ok(Number.isNaN(invalidDate.getTime()));
  assert.doesNotThrow(() => {
    const formatted = formatIstDateString(invalidDate);
    assert.match(formatted, /^\d{4}-\d{2}-\d{2}$/, 'Must return valid YYYY-MM-DD string even for invalid Date');
  });

  // 2. ApprovalsStore correctly sums and tracks all 8 backend queues
  const approvalsStoreSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/stores/approvals-store.ts'),
    'utf8',
  );
  for (const queue of [
    'cashHandoversCount',
    'disbursementAuthorizationsCount',
    'paymentReversalsCount',
    'safetyProofVerificationsCount',
    'auctionFinalizationsCount',
    'auctionCorrectionsCount',
    'defaulterRemovalsCount',
    'finalMonthSettlementsCount',
  ]) {
    assert.ok(
      approvalsStoreSrc.includes(queue),
      `Approvals store must track all 8 queues including ${queue}`,
    );
  }

  // 3. useApprovalsStream gates on canQueryDashboardReports, preventing COLLECTION_AGENT from 403 loops
  const approvalsStreamSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/hooks/use-approvals-stream.ts'),
    'utf8',
  );
  assert.ok(
    approvalsStreamSrc.includes('canQueryDashboardReports'),
    'useApprovalsStream must import and check canQueryDashboardReports',
  );
  assert.ok(
    approvalsStreamSrc.includes('queryClient.setQueryData'),
    'useApprovalsStream must synchronize React Query cache on APPROVALS_UPDATE SSE messages',
  );

  // 4. Form XXII Cash Book page gates queries on non-empty selectedDate
  const cashBookSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/app/(dashboard)/reports/cash-book/page.tsx'),
    'utf8',
  );
  assert.ok(
    cashBookSrc.includes('enabled: hasAccess && Boolean(selectedDate?.trim())'),
    'cash-book page must gate queries with Boolean(selectedDate?.trim()) to prevent 400 Bad Request on empty date',
  );

  // 5. Form XVII viewer guards denominator against zero or undefined durationMonths
  const formXviiViewerSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/components/reports/form-xvii-viewer.tsx'),
    'utf8',
  );
  assert.ok(
    formXviiViewerSrc.includes('Math.max(0, (chit.durationMonths || 20) - 2)'),
    'form-xvii-viewer.tsx must guard durationMonths denominator against negative values',
  );

  // 6. RegistrarFilingModal sanitizes filedDate before appending IST offset
  const registrarModalSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/components/reports/registrar-filing-modal.tsx'),
    'utf8',
  );
  assert.ok(
    registrarModalSrc.includes("filedDate.trim().split('T')[0]"),
    'registrar-filing-modal.tsx must split date string before appending +05:30 IST offset',
  );

  // 7. ReportDateNavigator shiftDate gracefully handles empty date
  const dateNavSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/components/reports/report-date-navigator.tsx'),
    'utf8',
  );
  assert.ok(
    dateNavSrc.includes('formatIstDateString()'),
    'report-date-navigator.tsx must fall back to formatIstDateString when selectedDate is empty',
  );
});
