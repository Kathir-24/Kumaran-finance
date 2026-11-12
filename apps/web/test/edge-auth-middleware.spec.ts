// ==============================================================================
// Kumaran Chits — Edge Authentication & RBAC Middleware Test Suite (DEF-FE-03)
// Verifies cryptographic jose HS256 JWT verification, zero trust in spoofable
// presence flags, fail-closed missing secret handling, and canonical RBAC gates.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SignJWT } from 'jose';
import { evaluateEdgeAuth } from '../src/lib/edge-auth.ts';
import {
  isRoleAuthorizedForPath,
  NAV_ROUTE_PERMISSIONS,
  resolveRoutePermission,
} from '../src/lib/route-permissions.ts';
import { MAIN_NAV_ITEMS } from '../src/components/layout/nav-items.ts';

const TEST_SECRET = 'kumaran-chits-edge-middleware-test-secret-minimum-64-characters-long';

async function signTestJwt(
  payload: Record<string, unknown>,
  options: { secret?: string; expiresIn?: string | number } = {},
): Promise<string> {
  const key = new TextEncoder().encode(options.secret ?? TEST_SECRET);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '15m')
    .sign(key);
}

test('DEF-FE-03: Forged kc_session_active cookie without valid JWT redirects to /login', async () => {
  const decision = await evaluateEdgeAuth({
    pathname: '/branches',
    accessToken: undefined,
    refreshToken: undefined,
    jwtSecret: TEST_SECRET,
  });

  assert.deepEqual(decision, {
    action: 'redirect',
    location: '/login?redirect=%2Fbranches',
    clearStaleCookies: false,
  });

  const middlewareSource = readFileSync(resolve(process.cwd(), 'src/middleware.ts'), 'utf8');
  assert.match(middlewareSource, /evaluateEdgeAuth/);
  assert.doesNotMatch(
    middlewareSource,
    /request\.cookies\.(?:has|get)\(COOKIE_SESSION_ACTIVE\)/,
    'Edge middleware must never grant access from non-HttpOnly COOKIE_SESSION_ACTIVE',
  );
});

test('DEF-FE-03: Tampered kc_access_token is rejected even if refresh cookie exists', async () => {
  const validRefresh = await signTestJwt({
    sub: 'user-1',
    roles: ['SUPER_ADMIN'],
    tokenType: 'refresh',
  });

  const validAccess = await signTestJwt({
    sub: 'user-1',
    roles: ['SUPER_ADMIN'],
    tokenType: 'access',
  });
  const parts = validAccess.split('.');
  const tamperedAccess = `${parts[0]}.${parts[1]}.tampered_sig`;

  const decision = await evaluateEdgeAuth({
    pathname: '/branches',
    accessToken: tamperedAccess,
    refreshToken: validRefresh,
    jwtSecret: TEST_SECRET,
  });

  assert.deepEqual(decision, {
    action: 'redirect',
    location: '/login?redirect=%2Fbranches',
    clearStaleCookies: true,
  });
});

test('DEF-FE-03: Rejects totp_pending and mpin_setup challenge tokens substituted as session cookies', async () => {
  const totpToken = await signTestJwt({
    sub: 'user-admin',
    roles: ['SUPER_ADMIN'],
    tokenType: 'totp_pending',
  });

  const decision = await evaluateEdgeAuth({
    pathname: '/users',
    accessToken: totpToken,
    jwtSecret: TEST_SECRET,
  });

  assert.deepEqual(decision, {
    action: 'redirect',
    location: '/login?redirect=%2Fusers',
    clearStaleCookies: true,
  });
});

test('DEF-FE-03: Missing JWT_SECRET fails closed on protected routes and keeps /login accessible', async () => {
  const env = process.env as Record<string, string | undefined>;
  const orig = env.JWT_SECRET;
  try {
    delete env.JWT_SECRET;
    const token = await signTestJwt({
      sub: 'user-admin',
      roles: ['SUPER_ADMIN'],
      tokenType: 'access',
    });

    const dashboardDecision = await evaluateEdgeAuth({
      pathname: '/branches',
      accessToken: token,
      jwtSecret: undefined,
    });
    assert.deepEqual(dashboardDecision, {
      action: 'redirect',
      location: '/login?redirect=%2Fbranches',
      clearStaleCookies: false,
    });

    const loginDecision = await evaluateEdgeAuth({
      pathname: '/login',
      accessToken: token,
      jwtSecret: undefined,
    });
    assert.deepEqual(loginDecision, { action: 'next' });
  } finally {
    if (orig !== undefined) env.JWT_SECRET = orig;
    else delete env.JWT_SECRET;
  }
});

test('DEF-FE-03: Expired access token recovers via valid HttpOnly refresh token', async () => {
  const expiredAccess = await signTestJwt(
    {
      sub: 'user-auditor',
      roles: ['AUDITOR'],
      tokenType: 'access',
    },
    { expiresIn: -60 },
  );
  const validRefresh = await signTestJwt({
    sub: 'user-auditor',
    roles: ['AUDITOR'],
    tokenType: 'refresh',
  });

  const allowedReports = await evaluateEdgeAuth({
    pathname: '/reports/audit-logs',
    accessToken: expiredAccess,
    refreshToken: validRefresh,
    jwtSecret: TEST_SECRET,
  });
  assert.deepEqual(allowedReports, { action: 'next' });

  const forbiddenBranches = await evaluateEdgeAuth({
    pathname: '/branches',
    accessToken: expiredAccess,
    refreshToken: validRefresh,
    jwtSecret: TEST_SECRET,
  });
  assert.deepEqual(forbiddenBranches, {
    action: 'redirect',
    location: '/?error=forbidden',
    clearStaleCookies: false,
  });
});

test('DEF-FE-03: Enforces canonical RBAC gates across all personas without leaking admin or write queues', async () => {
  const superAdminToken = await signTestJwt({
    sub: 'sa-1',
    roles: ['SUPER_ADMIN'],
    tokenType: 'access',
  });
  for (const path of ['/branches', '/users', '/admin', '/admin/jobs', '/print/receipt/1']) {
    const res = await evaluateEdgeAuth({
      pathname: path,
      accessToken: superAdminToken,
      jwtSecret: TEST_SECRET,
    });
    assert.deepEqual(res, { action: 'next' }, `SUPER_ADMIN must access ${path}`);
  }

  const auditorToken = await signTestJwt({
    sub: 'aud-1',
    roles: ['AUDITOR'],
    tokenType: 'access',
  });
  for (const allowedPath of ['/', '/schemes', '/auctions', '/reports', '/print/voucher/1']) {
    const res = await evaluateEdgeAuth({
      pathname: allowedPath,
      accessToken: auditorToken,
      jwtSecret: TEST_SECRET,
    });
    assert.deepEqual(res, { action: 'next' }, `AUDITOR must access ${allowedPath}`);
  }
  for (const deniedPath of [
    '/branches',
    '/branches/new',
    '/users',
    '/admin',
    '/admin/jobs',
    '/disbursements',
    '/reversals',
    '/schemes/onboard',
    '/collections',
  ]) {
    const res = await evaluateEdgeAuth({
      pathname: deniedPath,
      accessToken: auditorToken,
      jwtSecret: TEST_SECRET,
    });
    assert.deepEqual(
      res,
      { action: 'redirect', location: '/?error=forbidden', clearStaleCookies: false },
      `AUDITOR must be blocked at Edge from ${deniedPath}`,
    );
  }

  const agentToken = await signTestJwt({
    sub: 'agent-1',
    roles: ['COLLECTION_AGENT'],
    tokenType: 'access',
  });
  assert.deepEqual(
    await evaluateEdgeAuth({
      pathname: '/collections/handover',
      accessToken: agentToken,
      jwtSecret: TEST_SECRET,
    }),
    { action: 'next' },
  );
  assert.deepEqual(
    await evaluateEdgeAuth({
      pathname: '/schemes',
      accessToken: agentToken,
      jwtSecret: TEST_SECRET,
    }),
    { action: 'redirect', location: '/?error=forbidden', clearStaleCookies: false },
  );
});

test('DEF-FE-03: CUSTOMER role redirects cleanly to /login?error=forbidden without redirect loops', async () => {
  const customerToken = await signTestJwt({
    sub: 'cust-1',
    roles: ['CUSTOMER'],
    tokenType: 'access',
  });

  const homeDecision = await evaluateEdgeAuth({
    pathname: '/',
    accessToken: customerToken,
    jwtSecret: TEST_SECRET,
  });
  assert.deepEqual(homeDecision, {
    action: 'redirect',
    location: '/login?error=forbidden',
    clearStaleCookies: false,
  });

  const loginForbiddenDecision = await evaluateEdgeAuth({
    pathname: '/login',
    errorParam: 'forbidden',
    accessToken: customerToken,
    jwtSecret: TEST_SECRET,
  });
  assert.deepEqual(loginForbiddenDecision, { action: 'next' });
});

test('DEF-FE-03: Sanitizes open redirect targets on /login?redirect=...', async () => {
  const adminToken = await signTestJwt({
    sub: 'sa-1',
    roles: ['SUPER_ADMIN'],
    tokenType: 'access',
  });

  assert.deepEqual(
    await evaluateEdgeAuth({
      pathname: '/login',
      redirectParam: '//evil.example.com/phish',
      accessToken: adminToken,
      jwtSecret: TEST_SECRET,
    }),
    { action: 'redirect', location: '/', clearStaleCookies: false },
  );

  assert.deepEqual(
    await evaluateEdgeAuth({
      pathname: '/login',
      redirectParam: '/schemes/onboard',
      accessToken: adminToken,
      jwtSecret: TEST_SECRET,
    }),
    { action: 'redirect', location: '/schemes/onboard', clearStaleCookies: false },
  );
});

test('DEF-FE-03: Route permissions match MAIN_NAV_ITEMS cleanly and resolve longest prefix', () => {
  assert.equal(resolveRoutePermission('/schemes/onboard')?.href, '/schemes/onboard');
  assert.equal(resolveRoutePermission('/schemes/123')?.href, '/schemes');
  assert.equal(isRoleAuthorizedForPath('/schemes/onboard', ['BRANCH_MANAGER']), false);
  assert.equal(isRoleAuthorizedForPath('/schemes', ['BRANCH_MANAGER']), true);

  for (const navItem of MAIN_NAV_ITEMS) {
    const canonical =
      NAV_ROUTE_PERMISSIONS[navItem.href as keyof typeof NAV_ROUTE_PERMISSIONS];
    assert.ok(canonical, `Nav item ${navItem.href} must exist in NAV_ROUTE_PERMISSIONS`);
    assert.deepEqual([...navItem.allowedRoles], [...canonical]);
  }
});

test('DEF-FE-08: Edge Middleware guards /2fa using cryptographic HttpOnly kc_totp_pending_token verification', async () => {
  const validTotpPending = await signTestJwt({
    sub: 'staff-001',
    roles: ['SUPER_ADMIN'],
    tokenType: 'totp_pending',
  });
  const wrongAccessToken = await signTestJwt({
    sub: 'staff-001',
    roles: ['SUPER_ADMIN'],
    tokenType: 'access',
  });
  const expiredTotpPending = await signTestJwt(
    {
      sub: 'staff-001',
      roles: ['SUPER_ADMIN'],
      tokenType: 'totp_pending',
    },
    { expiresIn: '-10s' },
  );

  // 1. Valid totp_pending cookie -> allow /2fa
  assert.deepEqual(
    await evaluateEdgeAuth({
      pathname: '/2fa',
      totpPendingToken: validTotpPending,
      jwtSecret: TEST_SECRET,
    }),
    { action: 'next' },
  );

  // 2. Missing cookie -> fail closed redirect to /login?reason=missing_temp_token
  assert.deepEqual(
    await evaluateEdgeAuth({
      pathname: '/2fa',
      jwtSecret: TEST_SECRET,
    }),
    {
      action: 'redirect',
      location: '/login?reason=missing_temp_token',
      clearStaleCookies: false,
      clearPendingTotpCookie: false,
    },
  );

  // 3. Expired pending token -> redirect to /login?reason=temp_session_expired and clear cookie
  assert.deepEqual(
    await evaluateEdgeAuth({
      pathname: '/2fa',
      redirectParam: '/users',
      totpPendingToken: expiredTotpPending,
      jwtSecret: TEST_SECRET,
    }),
    {
      action: 'redirect',
      location: '/login?reason=temp_session_expired&redirect=%2Fusers',
      clearStaleCookies: false,
      clearPendingTotpCookie: true,
    },
  );

  // 4. Cross-token substitution: access token placed into pending cookie must fail closed
  assert.deepEqual(
    await evaluateEdgeAuth({
      pathname: '/2fa',
      totpPendingToken: wrongAccessToken,
      jwtSecret: TEST_SECRET,
    }),
    {
      action: 'redirect',
      location: '/login?reason=temp_session_expired',
      clearStaleCookies: false,
      clearPendingTotpCookie: true,
    },
  );

  // 5. Already authenticated user on /2fa still redirects cleanly to dashboard
  assert.deepEqual(
    await evaluateEdgeAuth({
      pathname: '/2fa',
      accessToken: wrongAccessToken,
      jwtSecret: TEST_SECRET,
    }),
    {
      action: 'redirect',
      location: '/',
      clearStaleCookies: false,
    },
  );

  // 6. middleware.ts clears COOKIE_TOTP_PENDING when decision.clearPendingTotpCookie is set
  const middlewareSource = readFileSync(
    resolve(process.cwd(), 'src/middleware.ts'),
    'utf8',
  );
  assert.match(middlewareSource, /COOKIE_TOTP_PENDING/);
  assert.match(middlewareSource, /decision\.clearPendingTotpCookie/);
});
