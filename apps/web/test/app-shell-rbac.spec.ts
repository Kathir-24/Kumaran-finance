// ==============================================================================
// Kumaran Chits — App Shell Layout & RBAC Navigation Test Suite
// Verifies dynamic role filtering, approvals store state, branch switcher, and i18n key parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_NAV_ITEMS, filterNavItemsByRoles, type NavItem } from '../src/components/layout/nav-items.ts';
import { useApprovalsStore } from '../src/stores/approvals-store.ts';
import { useAuthStore } from '../src/stores/auth-store.ts';
import enMessages from '../messages/en.json' with { type: 'json' };
import taMessages from '../messages/ta.json' with { type: 'json' };

test('RBAC Navigation: SUPER_ADMIN has full access to all 14 modules', () => {
  const allowed = filterNavItemsByRoles(MAIN_NAV_ITEMS, ['SUPER_ADMIN']);
  assert.equal(allowed.length, 14, 'SUPER_ADMIN must see all 14 navigation modules');

  const hrefs = allowed.map((item) => item.href);
  assert.ok(hrefs.includes('/'));
  assert.ok(hrefs.includes('/schemes'));
  assert.ok(hrefs.includes('/schemes/onboard'));
  assert.ok(hrefs.includes('/customers'));
  assert.ok(hrefs.includes('/auctions'));
  assert.ok(hrefs.includes('/disbursements'));
  assert.ok(hrefs.includes('/collections'));
  assert.ok(hrefs.includes('/collections/handover'));
  assert.ok(hrefs.includes('/reversals'));
  assert.ok(hrefs.includes('/reports'));
  assert.ok(hrefs.includes('/instructions'));
  assert.ok(hrefs.includes('/branches'));
  assert.ok(hrefs.includes('/users'));
  assert.ok(hrefs.includes('/admin/jobs'));
});

test('RBAC Navigation: ACCOUNTANT has operational access, excluding admin & auctions', () => {
  const allowed = filterNavItemsByRoles(MAIN_NAV_ITEMS, ['ACCOUNTANT']);
  const hrefs = allowed.map((item) => item.href);

  // Must have operational access
  assert.ok(hrefs.includes('/'), 'Must access Dashboard');
  assert.ok(hrefs.includes('/schemes'), 'Must access Schemes');
  assert.ok(hrefs.includes('/schemes/onboard'), 'Must access Notebook Onboarding Grid');
  assert.ok(hrefs.includes('/customers'), 'Must access Customers');
  assert.ok(hrefs.includes('/disbursements'), 'Must access Disbursements Voucher preparation');
  assert.ok(hrefs.includes('/collections'), 'Must access Collections & Counter');
  assert.ok(hrefs.includes('/collections/handover'), 'Must access Evening Cash Handover');
  assert.ok(hrefs.includes('/reversals'), 'Must access Payment Reversals');
  assert.ok(hrefs.includes('/reports'), 'Must access Statutory Reports');
  assert.ok(hrefs.includes('/instructions'), 'Must access Instructions');

  // Must NOT have admin access
  assert.ok(!hrefs.includes('/auctions'), 'Accountant cannot access live Auction Console');
  assert.ok(!hrefs.includes('/branches'), 'Accountant cannot access Branches administration');
  assert.ok(!hrefs.includes('/users'), 'Accountant cannot access User administration');
});

test('RBAC Navigation: AUDITOR has read-only audit access, excluding write mutations', () => {
  const allowed = filterNavItemsByRoles(MAIN_NAV_ITEMS, ['AUDITOR']);
  const hrefs = allowed.map((item) => item.href);

  // Must access read-only registers
  assert.ok(hrefs.includes('/'), 'Auditor must access Dashboard');
  assert.ok(hrefs.includes('/schemes'), 'Auditor must access Schemes view');
  assert.ok(hrefs.includes('/customers'), 'Auditor must access Customers directory');
  assert.ok(hrefs.includes('/auctions'), 'Auditor must access Auction Minutes');
  assert.ok(hrefs.includes('/reports'), 'Auditor must access Statutory Ledgers & Audit logs');
  assert.ok(hrefs.includes('/instructions'), 'Auditor must access Instructions');

  // Must NOT access operational intake / mutation links
  assert.ok(!hrefs.includes('/schemes/onboard'), 'Auditor cannot access Notebook Onboarding Grid');
  assert.ok(!hrefs.includes('/disbursements'), 'Auditor cannot access Prize Disbursements payout');
  assert.ok(!hrefs.includes('/collections'), 'Auditor cannot access Collections Counter');
  assert.ok(!hrefs.includes('/collections/handover'), 'Auditor cannot access Cash Handover');
  assert.ok(!hrefs.includes('/reversals'), 'Auditor cannot access Payment Reversals');
  assert.ok(!hrefs.includes('/branches'), 'Auditor cannot access Branches administration');
  assert.ok(!hrefs.includes('/users'), 'Auditor cannot access User administration');
});

test('RBAC Navigation: BRANCH_MANAGER has operational access within branch, excluding global company admin', () => {
  const allowed = filterNavItemsByRoles(MAIN_NAV_ITEMS, ['BRANCH_MANAGER']);
  const hrefs = allowed.map((item) => item.href);

  assert.ok(hrefs.includes('/auctions'), 'Branch Manager can conduct auctions');
  assert.ok(hrefs.includes('/disbursements'), 'Branch Manager can verify disbursements');
  assert.ok(hrefs.includes('/collections'), 'Branch Manager can view collections');
  assert.ok(!hrefs.includes('/branches'), 'Branch Manager cannot create branches');
  assert.ok(!hrefs.includes('/users'), 'Branch Manager cannot manage staff users');
});

test('RBAC Navigation: COLLECTION_AGENT has strictly doorstep & mobile collections routes', () => {
  const allowed = filterNavItemsByRoles(MAIN_NAV_ITEMS, ['COLLECTION_AGENT']);
  const hrefs = allowed.map((item) => item.href);

  assert.ok(hrefs.includes('/'), 'Agent can access Dashboard');
  assert.ok(hrefs.includes('/customers'), 'Agent can access Customers');
  assert.ok(hrefs.includes('/collections'), 'Agent can access Collections');
  assert.ok(hrefs.includes('/collections/handover'), 'Agent can access Evening Handover');
  assert.ok(hrefs.includes('/instructions'), 'Agent can access Instructions');

  assert.ok(!hrefs.includes('/schemes'), 'Agent cannot access Schemes directory');
  assert.ok(!hrefs.includes('/auctions'), 'Agent cannot access Auctions');
  assert.ok(!hrefs.includes('/disbursements'), 'Agent cannot access Disbursements');
  assert.ok(!hrefs.includes('/reversals'), 'Agent cannot access Reversals');
  assert.ok(!hrefs.includes('/reports'), 'Agent cannot access Statutory Reports');
  assert.ok(!hrefs.includes('/branches'), 'Agent cannot access Branches');
  assert.ok(!hrefs.includes('/users'), 'Agent cannot access Users');
});

test('RBAC Navigation: Unauthenticated or empty role returns empty navigation list', () => {
  assert.deepEqual(filterNavItemsByRoles(MAIN_NAV_ITEMS, []), []);
});

test('ApprovalsStore: Correctly tracks and calculates pending approval counts', () => {
  const store = useApprovalsStore.getState();
  store.reset();

  assert.equal(useApprovalsStore.getState().totalPendingCount, 0);
  assert.equal(useApprovalsStore.getState().isConnected, false);

  // Set partial summary
  useApprovalsStore.getState().setSummary({
    cashHandoversCount: 2,
    disbursementAuthorizationsCount: 1,
    paymentReversalsCount: 3,
  });

  const state = useApprovalsStore.getState();
  assert.equal(state.cashHandoversCount, 2);
  assert.equal(state.disbursementAuthorizationsCount, 1);
  assert.equal(state.paymentReversalsCount, 3);
  assert.equal(state.totalPendingCount, 6, 'Total must equal sum of individual pending queues');
  assert.ok(state.lastUpdated !== null, 'Timestamp must be recorded');

  // Toggle connection indicator
  useApprovalsStore.getState().setConnected(true);
  assert.equal(useApprovalsStore.getState().isConnected, true);

  // Reset
  useApprovalsStore.getState().reset();
  assert.equal(useApprovalsStore.getState().totalPendingCount, 0);
  assert.equal(useApprovalsStore.getState().isConnected, false);
});

test('AuthStore: Branch context switcher mutates activeBranchId correctly', () => {
  useAuthStore.getState().setAuth(
    {
      id: 'test-user-id',
      phone: '9842100001',
      name: 'Partner User',
      roles: ['SUPER_ADMIN'],
      branchId: 'branch-perundurai',
    },
    { accessToken: 'mock-jwt' }
  );

  // Initial branch matches user assigned branch
  assert.equal(useAuthStore.getState().activeBranchId, 'branch-perundurai');

  // Switch to another branch
  useAuthStore.getState().setActiveBranchId('branch-erode');
  assert.equal(useAuthStore.getState().activeBranchId, 'branch-erode');

  // Switch to consolidated / all branches (null)
  useAuthStore.getState().setActiveBranchId(null);
  assert.equal(useAuthStore.getState().activeBranchId, null);
});

test('Bilingual i18n: Nav, Topbar, and Sidebar keys match 100% parity across English and Tamil', () => {
  // 1. Check all MAIN_NAV_ITEMS have matching labelKey in both en and ta
  for (const item of MAIN_NAV_ITEMS) {
    const key = item.labelKey.replace('nav.', '') as keyof typeof enMessages.nav;
    assert.ok(
      enMessages.nav[key],
      `English dictionary must contain nav key: ${key}`
    );
    assert.ok(
      taMessages.nav[key],
      `Tamil dictionary must contain nav key: ${key}`
    );
  }

  // 2. Check topbar keys parity
  const enTopbarKeys = Object.keys(enMessages.topbar);
  const taTopbarKeys = Object.keys(taMessages.topbar);
  assert.deepEqual(
    enTopbarKeys.sort(),
    taTopbarKeys.sort(),
    'Topbar keys must match exactly between en.json and ta.json'
  );

  // 3. Check sidebar keys parity
  const enSidebarKeys = Object.keys(enMessages.sidebar);
  const taSidebarKeys = Object.keys(taMessages.sidebar);
  assert.deepEqual(
    enSidebarKeys.sort(),
    taSidebarKeys.sort(),
    'Sidebar keys must match exactly between en.json and ta.json'
  );
});
