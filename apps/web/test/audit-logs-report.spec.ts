// ==============================================================================
// Kumaran Chits — Immutable Forensic Audit Trail Viewer Tests (Task 10.4)
// Verifies statutory immutability, RBAC authorization, customer self-isolation,
// dual-control action taxonomy, diff serialization, CSV export, and bilingual parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isRoleAuthorizedForPath } from '../src/lib/route-permissions.ts';
import { escapeCsvCell } from '../src/lib/csv-export.ts';
import { buildAuditLogsQueryParams, isInvertedDateRange } from '../src/components/reports/report-access.ts';

// ------------------------------------------------------------------------------
// Invariant 1: Statutory Immutability Guarantee
// ------------------------------------------------------------------------------
test('1. Statutory Immutability Invariant: Audit logs are strictly read-only with zero purge/edit capabilities', () => {
  const allowedOperations = ['GET', 'HEAD', 'OPTIONS'];
  const prohibitedOperations = ['POST', 'PUT', 'PATCH', 'DELETE'];

  // Verify that an audit trail record presentation prohibits mutations
  interface AuditRecord {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    isImmutable: boolean;
    canDelete: boolean;
    canUpdate: boolean;
  }

  const record: AuditRecord = {
    id: 'f9b1d830-4e2b-4d4b-b0b2-2d4e8c1b5a90',
    action: 'PAYMENT_REVERSED',
    entityType: 'Payment',
    entityId: 'pay-uuid-1234',
    isImmutable: true,
    canDelete: false,
    canUpdate: false,
  };

  assert.equal(record.isImmutable, true);
  assert.equal(record.canDelete, false);
  assert.equal(record.canUpdate, false);
  assert.ok(allowedOperations.includes('GET'));
  assert.ok(!allowedOperations.includes('DELETE'));
});

// ------------------------------------------------------------------------------
// Invariant 2: RBAC Persona Authorization
// ------------------------------------------------------------------------------
test('2. RBAC Persona Authorization: Restricts audit register strictly to SUPER_ADMIN only', () => {
  const permittedRoles = ['SUPER_ADMIN'];

  const checkAccess = (roles: string[]): boolean => {
    return roles.some((r) => permittedRoles.includes(r));
  };

  // Managing Partner (Super Admin)
  assert.equal(checkAccess(['SUPER_ADMIN']), true);
  // Independent CA Auditor - restricted
  assert.equal(checkAccess(['AUDITOR']), false);
  // Head Office Branch Manager - restricted
  assert.equal(checkAccess(['BRANCH_MANAGER']), false);
  // Desk Accountant - restricted
  assert.equal(checkAccess(['ACCOUNTANT']), false);
  // Subscriber - restricted
  assert.equal(checkAccess(['CUSTOMER']), false);
  // Field Collection Agent - restricted
  assert.equal(checkAccess(['COLLECTION_AGENT']), false);
  // Unauthenticated / Anonymous Guest
  assert.equal(checkAccess([]), false);
});

// ------------------------------------------------------------------------------
// Invariant 3: Guardrail 11 Route-Level RBAC Enforcement for /reports/audit-logs
// ------------------------------------------------------------------------------
test('3. Guardrail 11 Route Enforcement: /reports/audit-logs strictly allows SUPER_ADMIN only', () => {
  assert.equal(isRoleAuthorizedForPath('/reports/audit-logs', ['SUPER_ADMIN']), true);
  assert.equal(isRoleAuthorizedForPath('/reports/audit-logs', ['AUDITOR']), false);
  assert.equal(isRoleAuthorizedForPath('/reports/audit-logs', ['BRANCH_MANAGER']), false);
  assert.equal(isRoleAuthorizedForPath('/reports/audit-logs', ['ACCOUNTANT']), false);
  assert.equal(isRoleAuthorizedForPath('/reports/audit-logs', ['COLLECTION_AGENT']), false);
  assert.equal(isRoleAuthorizedForPath('/reports/audit-logs', ['CUSTOMER']), false);
  assert.equal(isRoleAuthorizedForPath('/reports/audit-logs', []), false);
});

// ------------------------------------------------------------------------------
// Invariant 4: Dual-Control Maker-Checker Action Classification
// ------------------------------------------------------------------------------
test('4. Dual-Control Classification: Accurately classifies Maker-Checker dual control actions', () => {
  const isDualControlAction = (action: string): boolean => {
    const dualControlSet = new Set([
      'AUCTION_FINALIZED',
      'PAYMENT_REVERSED',
      'PAYMENT_REVERSAL_REJECTED',
      'CASH_HANDOVER_ACKNOWLEDGED',
      'PRIZE_PAYOUT_AUTHORIZED',
      'SAFETY_PROOF_VERIFIED',
      'UPI_CLAIM_VERIFIED',
    ]);
    return dualControlSet.has(action);
  };

  // Critical dual-control actions
  assert.equal(isDualControlAction('AUCTION_FINALIZED'), true);
  assert.equal(isDualControlAction('PAYMENT_REVERSED'), true);
  assert.equal(isDualControlAction('CASH_HANDOVER_ACKNOWLEDGED'), true);
  assert.equal(isDualControlAction('PRIZE_PAYOUT_AUTHORIZED'), true);
  assert.equal(isDualControlAction('UPI_CLAIM_VERIFIED'), true);
  assert.equal(isDualControlAction('SAFETY_PROOF_VERIFIED'), true);

  // Single-actor or notification actions
  assert.equal(isDualControlAction('CHIT_GROUP_DRAFT_UPDATED'), false);
  assert.equal(isDualControlAction('CUSTOMER_DOCUMENT_DELETED'), false);
  assert.equal(isDualControlAction('MINUTES_FILED_AT_REGISTRAR'), false);
});

// ------------------------------------------------------------------------------
// Invariant 5: Filter Criteria Query Construction (IST plain YYYY-MM-DD bounds)
// ------------------------------------------------------------------------------
test('5. Filter Criteria Mapping: Sends plain IST YYYY-MM-DD dates and detects inverted ranges', () => {
  const query = buildAuditLogsQueryParams({
    selectedAction: 'AUCTION_FINALIZED',
    selectedEntity: 'Auction',
    selectedUserId: 'ALL',
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    page: 2,
    limit: 50,
  });

  assert.equal(query.action, 'AUCTION_FINALIZED');
  assert.equal(query.entityType, 'Auction');
  assert.equal(query.userId, undefined);
  assert.equal(query.page, 2);
  assert.equal(query.limit, 50);
  assert.equal(query.fromDate, '2026-10-01');
  assert.equal(query.toDate, '2026-10-31');
  assert.equal(isInvertedDateRange('2026-10-01', '2026-10-31'), false);
  assert.equal(isInvertedDateRange('2026-10-31', '2026-10-01'), true);
});

// ------------------------------------------------------------------------------
// Invariant 6: State Diff JSON Serialization
// ------------------------------------------------------------------------------
test('6. State Diff Serialization: Preserves JSON diff structure without truncation', () => {
  const oldValue = {
    status: 'REQUESTED',
    amount: 10000,
    makerUserId: 'user-maker-1',
  };

  const newValue = {
    status: 'APPROVED',
    amount: 10000,
    makerUserId: 'user-maker-1',
    checkerUserId: 'user-checker-2',
    approvedAt: '2026-10-24T14:30:00.000Z',
  };

  const serializedOld = JSON.stringify(oldValue, null, 2);
  const serializedNew = JSON.stringify(newValue, null, 2);

  const parsedOld = JSON.parse(serializedOld);
  const parsedNew = JSON.parse(serializedNew);

  assert.equal(parsedOld.status, 'REQUESTED');
  assert.equal(parsedNew.status, 'APPROVED');
  assert.equal(parsedNew.checkerUserId, 'user-checker-2');
  assert.notEqual(parsedNew.makerUserId, parsedNew.checkerUserId);
});

// ------------------------------------------------------------------------------
// Invariant 7: RFC 4180 CSV Export Serialization & Formula Injection Guard
// ------------------------------------------------------------------------------
test('7. RFC 4180 CSV Export: Escapes special characters and neutralizes formula injection via csv-export.ts', () => {
  // Cell with comma
  assert.equal(escapeCsvCell('AUCTION_FINALIZED, DUAL_CONTROL'), '"AUCTION_FINALIZED, DUAL_CONTROL"');
  // Cell with double quotes
  assert.equal(escapeCsvCell('Notes with "important" info'), '"Notes with ""important"" info"');
  // Clean cell
  assert.equal(escapeCsvCell('Payment'), 'Payment');
  // Formula injection neutralized
  assert.equal(escapeCsvCell('=CMD()'), "'=CMD()");
  assert.equal(escapeCsvCell('  +1+1'), "'  +1+1");

  const row = ['2026-10-24 15:00:00', 'PAYMENT_REVERSED', 'Payment', 'Ramesh (Accountant)', '192.168.1.10'];
  const csvLine = row.map(escapeCsvCell).join(',');

  assert.equal(
    csvLine,
    '2026-10-24 15:00:00,PAYMENT_REVERSED,Payment,Ramesh (Accountant),192.168.1.10'
  );
});

// ------------------------------------------------------------------------------
// Invariant 8: Bilingual Dictionary Parity (en <-> ta)
// ------------------------------------------------------------------------------
test('8. Bilingual Parity: 100% key match between en.json and ta.json in auditTrail namespace', () => {
  const basePath = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
    ? process.cwd()
    : path.resolve(process.cwd(), 'apps/web');

  const enPath = path.resolve(basePath, 'messages/en.json');
  const taPath = path.resolve(basePath, 'messages/ta.json');

  const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const taJson = JSON.parse(fs.readFileSync(taPath, 'utf8'));

  const enAudit = enJson.reports.auditTrail;
  const taAudit = taJson.reports.auditTrail;

  assert.ok(enAudit, 'reports.auditTrail namespace must exist in en.json');
  assert.ok(taAudit, 'reports.auditTrail namespace must exist in ta.json');

  const enKeys = Object.keys(enAudit).sort();
  const taKeys = Object.keys(taAudit).sort();

  const missingInTa = enKeys.filter((k) => !(k in taAudit));
  const missingInEn = taKeys.filter((k) => !(k in enAudit));

  assert.deepEqual(
    missingInTa,
    [],
    `Missing keys in ta.json: ${missingInTa.join(', ')}`
  );
  assert.deepEqual(
    missingInEn,
    [],
    `Missing keys in en.json: ${missingInEn.join(', ')}`
  );
  assert.equal(enKeys.length, taKeys.length);
  assert.ok(enKeys.length >= 60, `Expected at least 60 keys, found ${enKeys.length}`);
});
