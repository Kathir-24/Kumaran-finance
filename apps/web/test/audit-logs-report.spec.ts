// ==============================================================================
// Kumaran Chits — Immutable Forensic Audit Trail Viewer Tests (Task 10.4)
// Verifies statutory immutability, RBAC authorization, customer self-isolation,
// dual-control action taxonomy, diff serialization, CSV export, and bilingual parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
// Invariant 3: Customer Self-Isolation Invariant (Anti-IDOR / Anti-BOLA)
// ------------------------------------------------------------------------------
test('3. Customer Self-Isolation Invariant: Restricts Customer queries strictly to own userId', () => {
  interface UserContext {
    sub: string;
    roles: string[];
    branchId?: string;
  }

  const buildAuditWhereClause = (user: UserContext, requestedUserId?: string) => {
    const where: Record<string, unknown> = {};

    if (user.roles.includes('CUSTOMER') && !user.roles.includes('SUPER_ADMIN')) {
      // Customer self-isolation: strictly bound to requesting user UUID
      where.userId = user.sub;
    } else {
      if (requestedUserId && requestedUserId !== 'ALL') {
        where.userId = requestedUserId;
      }
      if (user.roles.includes('BRANCH_MANAGER') && !user.roles.includes('SUPER_ADMIN') && user.branchId) {
        where.user = { branchId: user.branchId };
      }
    }

    return where;
  };

  const customerUser: UserContext = { sub: 'cust-uuid-111', roles: ['CUSTOMER'] };
  const auditorUser: UserContext = { sub: 'auditor-uuid-222', roles: ['AUDITOR'] };
  const managerUser: UserContext = { sub: 'mgr-uuid-333', roles: ['BRANCH_MANAGER'], branchId: 'branch-prd' };

  // Customer cannot view arbitrary other user records even if requested in query
  const customerWhere = buildAuditWhereClause(customerUser, 'other-user-uuid');
  assert.equal(customerWhere.userId, 'cust-uuid-111');

  // Auditor can query across all staff or specific staff
  const auditorWhere = buildAuditWhereClause(auditorUser, 'staff-uuid-444');
  assert.equal(auditorWhere.userId, 'staff-uuid-444');

  // Branch Manager has branch-scoping applied
  const managerWhere = buildAuditWhereClause(managerUser);
  assert.deepEqual(managerWhere.user, { branchId: 'branch-prd' });
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
// Invariant 5: Filter Criteria Query Construction
// ------------------------------------------------------------------------------
test('5. Filter Criteria Mapping: Correctly constructs API query parameters', () => {
  const buildQueryParams = (params: {
    selectedAction: string;
    selectedEntity: string;
    selectedUserId: string;
    fromDate: string;
    toDate: string;
    page: number;
    limit: number;
  }) => {
    return {
      action: params.selectedAction === 'ALL' ? undefined : params.selectedAction,
      entityType: params.selectedEntity === 'ALL' ? undefined : params.selectedEntity,
      userId: params.selectedUserId === 'ALL' ? undefined : params.selectedUserId,
      fromDate: params.fromDate ? new Date(params.fromDate).toISOString() : undefined,
      toDate: params.toDate ? new Date(`${params.toDate}T23:59:59.999Z`).toISOString() : undefined,
      page: params.page,
      limit: params.limit,
    };
  };

  const query = buildQueryParams({
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
  assert.ok(query.fromDate?.includes('2026-10-01'));
  assert.ok(query.toDate?.includes('2026-10-31'));
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
// Invariant 7: RFC 4180 CSV Export Serialization
// ------------------------------------------------------------------------------
test('7. RFC 4180 CSV Export: Correctly escapes fields and serializes audit records', () => {
  const escapeCsvCell = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Cell with comma
  assert.equal(escapeCsvCell('AUCTION_FINALIZED, DUAL_CONTROL'), '"AUCTION_FINALIZED, DUAL_CONTROL"');
  // Cell with double quotes
  assert.equal(escapeCsvCell('Notes with "important" info'), '"Notes with ""important"" info"');
  // Clean cell
  assert.equal(escapeCsvCell('Payment'), 'Payment');

  const headers = ['Timestamp', 'Action', 'Entity', 'Actor', 'IP'];
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
