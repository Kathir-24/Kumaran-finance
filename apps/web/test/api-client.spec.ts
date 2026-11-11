// ==============================================================================
// Kumaran Chits — Web API Client & Query Keys Test Suite
// Verifies BFF cookie bridge, zero client token persistence, unwrapper & queryKeys.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unwrapApiResponse,
  unwrapPaginatedList,
  KumaranApiError,
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  USER_PROFILE_KEY,
  getStoredAccessToken,
  getStoredRefreshToken,
  getStoredUserProfile,
  setStoredUserProfile,
  setStoredTokens,
  clearStoredTokens,
  getApiBaseUrl,
} from '../src/lib/api-client.ts';
import { queryKeys } from '../src/lib/query-keys.ts';

test('ApiClient: getApiBaseUrl falls back to localhost when env is unset in SSR', () => {
  const url = getApiBaseUrl();
  assert.ok(url.startsWith('http'), 'Base URL in Node SSR must start with http');
});

test('ApiClient: Token storage bridge handles SSR environment safely', () => {
  // In Node environment without window, getters safely return null
  assert.equal(getStoredAccessToken(), null);
  assert.equal(getStoredRefreshToken(), null);
  assert.equal(getStoredUserProfile(), null);
  // Setters and clearers execute safely without throwing errors
  assert.doesNotThrow(() => setStoredTokens({ accessToken: 'test-token' }));
  assert.doesNotThrow(() => setStoredUserProfile({ id: 'test-user' }));
  assert.doesNotThrow(() => clearStoredTokens());
});

test('ApiClient: Token storage bridge enforces zero secret tokens in client storage under BFF architecture', () => {
  const mockStorage = new Map<string, string>();
  let dispatchedEvent: string | null = null;

  // Mock minimal window & localStorage
  (globalThis as any).window = {
    dispatchEvent: (event: any) => {
      dispatchedEvent = event.type;
    },
  };
  (globalThis as any).localStorage = {
    getItem: (key: string) => mockStorage.get(key) || null,
    setItem: (key: string, val: string) => mockStorage.set(key, val),
    removeItem: (key: string) => mockStorage.delete(key),
  };
  (globalThis as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, opts?: any) {
      this.type = type;
      this.detail = opts?.detail;
    }
  };

  try {
    // In browser environment, getApiBaseUrl returns '/bff' for isolated Next.js BFF proxy calls
    assert.equal(
      getApiBaseUrl(),
      '/bff',
      'Browser base URL must target /bff for Nginx-isolated Next.js BFF proxying',
    );

    // 1. Set tokens & profile
    setStoredTokens({ accessToken: 'access-abc', refreshToken: 'refresh-xyz' });
    setStoredUserProfile({ id: 'user-001', name: 'Tester' });

    // Under BFF standard: tokens are NEVER stored in localStorage
    assert.equal(mockStorage.has(ACCESS_TOKEN_KEY), false, 'Access token must never be stored in localStorage');
    assert.equal(mockStorage.has(REFRESH_TOKEN_KEY), false, 'Refresh token must never be stored in localStorage');
    assert.deepEqual(getStoredUserProfile(), { id: 'user-001', name: 'Tester' });
    assert.equal(getStoredAccessToken(), null, 'Stored access token getter must return null');
    assert.equal(getStoredRefreshToken(), null, 'Stored refresh token getter must return null');
    assert.equal(dispatchedEvent, 'kumaran:auth_change');

    // 2. Clear tokens & profile
    clearStoredTokens();
    assert.equal(mockStorage.has(ACCESS_TOKEN_KEY), false);
    assert.equal(mockStorage.has(REFRESH_TOKEN_KEY), false);
    assert.equal(mockStorage.has(USER_PROFILE_KEY), false);
    assert.equal(getStoredAccessToken(), null);
    assert.equal(getStoredUserProfile(), null);
    assert.equal(dispatchedEvent, 'kumaran:unauthorized');
  } finally {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
    delete (globalThis as any).CustomEvent;
  }
});

test('ApiClient: unwrapApiResponse successfully unwraps standard NestJS data envelopes', async () => {
  const mockNestSuccess = Promise.resolve({
    data: {
      success: true,
      statusCode: 200,
      data: {
        id: 'chit-001',
        chitNumber: 'KC-100K-01',
        totalValue: 100000,
      },
    },
    response: new Response(null, { status: 200 }),
  });

  const result = await unwrapApiResponse<{ id: string; chitNumber: string; totalValue: number }>(
    mockNestSuccess,
  );

  assert.equal(result.id, 'chit-001');
  assert.equal(result.chitNumber, 'KC-100K-01');
  assert.equal(result.totalValue, 100000);
});

test('ApiClient: unwrapApiResponse transforms 401 error into KumaranApiError', async () => {
  const mock401 = Promise.resolve({
    error: { code: 'UNAUTHORIZED', message: 'JWT access token expired' },
    response: new Response(null, { status: 401, statusText: 'Unauthorized' }),
  });

  await assert.rejects(
    async () => unwrapApiResponse(mock401),
    (err: unknown) => {
      assert.ok(err instanceof KumaranApiError);
      assert.equal(err.statusCode, 401);
      assert.equal(err.code, 'UNAUTHORIZED');
      assert.equal(err.isUnauthorized, true);
      assert.equal(err.isForbidden, false);
      return true;
    },
  );
});

test('ApiClient: unwrapApiResponse transforms 403 Maker-Checker violation into KumaranApiError', async () => {
  const mock403 = Promise.resolve({
    error: { code: 'MAKER_CHECKER_VIOLATION', message: 'Maker cannot authorize their own disbursement' },
    response: new Response(null, { status: 403, statusText: 'Forbidden' }),
  });

  await assert.rejects(
    async () => unwrapApiResponse(mock403),
    (err: unknown) => {
      assert.ok(err instanceof KumaranApiError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'MAKER_CHECKER_VIOLATION');
      assert.equal(err.isForbidden, true);
      return true;
    },
  );
});

test('ApiClient: unwrapApiResponse transforms 409 Conflict into KumaranApiError', async () => {
  const mock409 = Promise.resolve({
    error: { code: 'CONCURRENCY_LOCK_FAILED', message: 'Another partner modified this auction record' },
    response: new Response(null, { status: 409, statusText: 'Conflict' }),
  });

  await assert.rejects(
    async () => unwrapApiResponse(mock409),
    (err: unknown) => {
      assert.ok(err instanceof KumaranApiError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.isConflict, true);
      return true;
    },
  );
});

test('QueryKeys: Registry guarantees deterministic keys matching cache invalidation graph', () => {
  assert.deepEqual(queryKeys.auth.me(), ['auth', 'me']);
  assert.deepEqual(queryKeys.dashboard.kpis('branch-uuid-1'), [
    'dashboard',
    'kpis',
    { branchId: 'branch-uuid-1' },
  ]);
  assert.deepEqual(queryKeys.tickets.passbook('ticket-uuid-99'), [
    'tickets',
    'ticket-uuid-99',
    'passbook',
  ]);
  assert.deepEqual(queryKeys.reports.cashBook('2026-10-31'), [
    'reports',
    'cash-book',
    '2026-10-31',
  ]);
  assert.deepEqual(queryKeys.approvals.pending(), ['approvals', 'pending']);
  assert.deepEqual(queryKeys.disbursements.list(), ['disbursements', 'list']);
});

test('ApiClient: unwrapPaginatedList unwraps paginated envelopes, plain arrays, and invalid inputs safely', () => {
  const claim = { claimId: 'claim-1', amount: 3750, utrNumber: 'UTR123456' };

  // ApiPaginatedResponseEnvelope inner payload (current /payments/pending-upi-claims & /tickets/defaulters)
  assert.deepEqual(
    unwrapPaginatedList({
      data: [claim],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    }),
    [claim],
  );

  // Direct array fallback
  assert.deepEqual(unwrapPaginatedList([claim]), [claim]);

  // Empty/malformed/nullish payloads
  assert.deepEqual(unwrapPaginatedList(null), []);
  assert.deepEqual(unwrapPaginatedList(undefined), []);
  assert.deepEqual(unwrapPaginatedList({ total: 0 }), []);
});
