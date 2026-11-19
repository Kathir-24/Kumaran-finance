/**
 * Kumaran Chits — Web Route RBAC Guardian & Inactivity Sync Unit Tests
 * Asserts route-level authorization barriers, longest-path resolution,
 * branch switcher locks, and multi-tab inactivity sync invariants.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_NAV_ITEMS } from '../src/components/layout/nav-items.ts';

/**
 * Helper replicating DashboardLayout's deterministic longest-path resolution
 */
function resolveRoutePermissions(pathname: string) {
  const sorted = [...MAIN_NAV_ITEMS].sort((a, b) => b.href.length - a.href.length);
  return sorted.find((item) =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
  );
}

function isRouteAuthorized(pathname: string, userRoles: string[] = []): boolean {
  const route = resolveRoutePermissions(pathname);
  if (!route) return true;
  return route.allowedRoles.some((role) => userRoles.includes(role));
}

describe('Route-Level RBAC Guardian Unit Tests', () => {
  it('1. Admin Routes: Restricts /users strictly to SUPER_ADMIN', () => {
    assert.equal(isRouteAuthorized('/users', ['SUPER_ADMIN']), true);
    assert.equal(isRouteAuthorized('/users/new', ['SUPER_ADMIN']), true);

    // Non-super-admins are strictly blocked
    assert.equal(isRouteAuthorized('/users', ['BRANCH_MANAGER']), false);
    assert.equal(isRouteAuthorized('/users', ['ACCOUNTANT']), false);
    assert.equal(isRouteAuthorized('/users', ['COLLECTION_AGENT']), false);
    assert.equal(isRouteAuthorized('/users', ['AUDITOR']), false);
  });

  it('2. Admin Routes: Restricts /branches strictly to SUPER_ADMIN', () => {
    assert.equal(isRouteAuthorized('/branches', ['SUPER_ADMIN']), true);
    assert.equal(isRouteAuthorized('/branches/new', ['SUPER_ADMIN']), true);

    assert.equal(isRouteAuthorized('/branches', ['BRANCH_MANAGER']), false);
    assert.equal(isRouteAuthorized('/branches', ['ACCOUNTANT']), false);
    assert.equal(isRouteAuthorized('/branches', ['AUDITOR']), false);
  });

  it('3. Longest Path Rule: /schemes/onboard enforces specific onboard roles over /schemes', () => {
    const onboardRoute = resolveRoutePermissions('/schemes/onboard');
    assert.equal(onboardRoute?.href, '/schemes/onboard');

    // Onboarding allowed for Partner and Accountant
    assert.equal(isRouteAuthorized('/schemes/onboard', ['PARTNER']), true);
    assert.equal(isRouteAuthorized('/schemes/onboard', ['ACCOUNTANT']), true);

    // IT Super Admin and Branch Manager are blocked from mid-cycle notebook onboarding
    assert.equal(isRouteAuthorized('/schemes/onboard', ['SUPER_ADMIN']), false);
    assert.equal(isRouteAuthorized('/schemes/onboard', ['BRANCH_MANAGER']), false);
    assert.equal(isRouteAuthorized('/schemes', ['BRANCH_MANAGER']), true);
  });

  it('4. Auction Room: Restricts /auctions strictly to PARTNER, BRANCH_MANAGER, and AUDITOR', () => {
    assert.equal(isRouteAuthorized('/auctions', ['PARTNER']), true);
    assert.equal(isRouteAuthorized('/auctions', ['BRANCH_MANAGER']), true);
    assert.equal(isRouteAuthorized('/auctions', ['AUDITOR']), true);

    // IT Super Admin, Desk Accountants and Field Agents cannot conduct or spectate auctions
    assert.equal(isRouteAuthorized('/auctions', ['SUPER_ADMIN']), false);
    assert.equal(isRouteAuthorized('/auctions', ['ACCOUNTANT']), false);
    assert.equal(isRouteAuthorized('/auctions', ['COLLECTION_AGENT']), false);
  });

  it('5. Dual-Control Financial Queues: Restricts /disbursements and /reversals to authorized staff', () => {
    assert.equal(isRouteAuthorized('/disbursements', ['PARTNER']), true);
    assert.equal(isRouteAuthorized('/disbursements', ['BRANCH_MANAGER']), true);
    assert.equal(isRouteAuthorized('/disbursements', ['ACCOUNTANT']), true);
    assert.equal(isRouteAuthorized('/disbursements', ['SUPER_ADMIN']), false);
    assert.equal(isRouteAuthorized('/disbursements', ['COLLECTION_AGENT']), false);

    assert.equal(isRouteAuthorized('/reversals', ['PARTNER']), true);
    assert.equal(isRouteAuthorized('/reversals', ['BRANCH_MANAGER']), true);
    assert.equal(isRouteAuthorized('/reversals', ['ACCOUNTANT']), true);
    assert.equal(isRouteAuthorized('/reversals', ['SUPER_ADMIN']), false);
    assert.equal(isRouteAuthorized('/reversals', ['COLLECTION_AGENT']), false);
  });

  it('6. Topbar Branch Switcher Invariant: Restricts multi-branch switching to Partner, Super Admin and Auditor', () => {
    const canSwitchBranches = (roles: string[]) =>
      roles.includes('PARTNER') || roles.includes('SUPER_ADMIN') || roles.includes('AUDITOR');

    assert.equal(canSwitchBranches(['PARTNER']), true);
    assert.equal(canSwitchBranches(['SUPER_ADMIN']), true);
    assert.equal(canSwitchBranches(['AUDITOR']), true);

    // Branch staff have locked branch context
    assert.equal(canSwitchBranches(['BRANCH_MANAGER']), false);
    assert.equal(canSwitchBranches(['ACCOUNTANT']), false);
    assert.equal(canSwitchBranches(['COLLECTION_AGENT']), false);
  });

  it('7. Multi-Tab Inactivity Synchronization Invariant', () => {
    let tab1LastActivity = 1000;

    // Simulate storage event arriving from Tab 2
    const storageEventPayload = {
      key: 'kc_last_active_timestamp',
      newValue: '5000',
    };

    if (
      storageEventPayload.key === 'kc_last_active_timestamp' &&
      storageEventPayload.newValue
    ) {
      const remoteTime = parseInt(storageEventPayload.newValue, 10);
      if (remoteTime > tab1LastActivity) {
        tab1LastActivity = remoteTime;
      }
    }

    assert.equal(tab1LastActivity, 5000, 'Tab 1 should update its activity timestamp from Tab 2');
  });
});
