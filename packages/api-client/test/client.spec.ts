// ==============================================================================
// Kumaran Chits — Client SDK Test Suite
// Verifies whole-rupee math, Maker-Checker guards, and client interceptors.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRupee,
  formatRupeeAmount,
  parseWholeRupees,
  sanitizeWholeRupeeInput,
  isSelfApproval,
  canAuthorizeAction,
  createKumaranClient,
  KumaranApiError,
} from '../dist/index.js';

test('Guardrail 2: Whole Rupee Math formatting', () => {
  assert.equal(formatRupee(0), '₹0');
  assert.equal(formatRupee(100000), '₹1,00,000');
  assert.equal(formatRupee(5000000n), '₹50,00,000');
  assert.equal(formatRupee('25000'), '₹25,000');
  assert.equal(formatRupee(null), '₹0');
  assert.equal(formatRupee(undefined), '₹0');

  // Verify pure whole rupees without paise
  assert.equal(formatRupeeAmount(100000), '1,00,000');
  assert.equal(formatRupeeAmount(5000000n), '50,00,000');

  // Verify parseWholeRupees strips floats/paise
  assert.equal(parseWholeRupees(1500.99), 1500);
  // DEF-FE-10 (N1-N4): parseWholeRupees splits on decimal point & sanitizeWholeRupeeInput prevents 100x paise concatenation
  assert.equal(parseWholeRupees('₹25,000.50'), 25000);
  assert.equal(parseWholeRupees('25000.50'), 25000);
  assert.equal(parseWholeRupees('100000.00'), 100000);
  assert.equal(parseWholeRupees('1,00,000.99'), 100000);
  assert.equal(parseWholeRupees('.50'), 0);
  assert.equal(parseWholeRupees('0.99'), 0);
  assert.equal(parseWholeRupees('₹.99'), 0);
  assert.equal(parseWholeRupees('25,000.50.10'), 25000);
  assert.equal(parseWholeRupees('  INR 1,00,000.75 '), 100000);
  assert.equal(parseWholeRupees('0015000.25'), 15000);
  assert.equal(parseWholeRupees(''), 0);
  assert.equal(parseWholeRupees('   '), 0);
  assert.equal(parseWholeRupees('abc'), 0);
  assert.equal(parseWholeRupees('₹'), 0);
  assert.equal(parseWholeRupees(Number.NaN), 0);
  assert.equal(parseWholeRupees(Number.POSITIVE_INFINITY), 0);
  assert.equal(parseWholeRupees(Number.NEGATIVE_INFINITY), 0);
  assert.equal(Object.is(parseWholeRupees(-0), 0), true);
  assert.equal(Object.is(parseWholeRupees(-0.5), 0), true);
  assert.equal(parseWholeRupees(null as unknown as string), 0);
  assert.equal(parseWholeRupees(undefined as unknown as string), 0);
  assert.equal(sanitizeWholeRupeeInput('₹25,000.50'), '25000');
  assert.equal(sanitizeWholeRupeeInput('000.50'), '0');
  assert.equal(sanitizeWholeRupeeInput('.50'), '');
  assert.equal(sanitizeWholeRupeeInput('1000.'), '1000');
});

test('Guardrail 10: Maker-Checker separation of duties', () => {
  const currentUserId = 'user-checker-uuid-002';
  const makerUserId = 'user-maker-uuid-001';

  // Transaction where current user is NOT the maker
  const transaction1 = { makerUserId };
  assert.equal(isSelfApproval(currentUserId, transaction1), false);
  assert.equal(canAuthorizeAction(currentUserId, transaction1), true);

  // Transaction where current user IS the maker
  const transaction2 = { makerUserId: currentUserId };
  assert.equal(isSelfApproval(currentUserId, transaction2), true);
  assert.equal(canAuthorizeAction(currentUserId, transaction2), false);

  // Field agent collection where collector is current user
  const collection1 = { collectorUserId: currentUserId };
  assert.equal(isSelfApproval(currentUserId, collection1), true);
  assert.equal(canAuthorizeAction(currentUserId, collection1), false);
});

test('Client Factory: Authorization header and Idempotency-Key injection', async () => {
  let capturedRequest: Request | null = null;

  // Custom mock fetch that captures the request
  const mockFetch = async (req: Request) => {
    capturedRequest = req;
    return new Response(JSON.stringify({ success: true, data: { status: 'ok' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const client = createKumaranClient({
    baseUrl: 'http://127.0.0.1:3000',
    getAccessToken: () => 'mock-jwt-access-token-12345',
    fetch: mockFetch,
  });

  // Test 1: GET request should include Bearer token but NO Idempotency-Key
  await client.GET('/health');
  assert.ok(capturedRequest);
  assert.equal((capturedRequest as Request).headers.get('Authorization'), 'Bearer mock-jwt-access-token-12345');
  assert.equal((capturedRequest as Request).headers.has('Idempotency-Key'), false);

  // Test 2: POST payment request should auto-inject UUID v4 Idempotency-Key
  await client.POST('/api/v1/payments' as any, {
    body: {
      chitGroupId: 'group-uuid-001',
      ticketId: 'ticket-uuid-001',
      amount: 5000,
      paymentMode: 'CASH',
    } as any,
  });

  assert.ok(capturedRequest);
  assert.equal((capturedRequest as Request).headers.get('Authorization'), 'Bearer mock-jwt-access-token-12345');
  const idempotencyKey = (capturedRequest as Request).headers.get('Idempotency-Key');
  assert.ok(idempotencyKey, 'Idempotency-Key should be present on payment POST');
  assert.match(
    idempotencyKey!,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'Idempotency-Key must be a valid UUID v4',
  );
});

test('KumaranApiError properties and helpers', () => {
  const err401 = new KumaranApiError(401, { code: 'UNAUTHORIZED', message: 'Token expired' });
  assert.equal(err401.isUnauthorized, true);
  assert.equal(err401.isForbidden, false);

  const err403 = new KumaranApiError(403, { code: 'FORBIDDEN', message: 'Maker cannot authorize' });
  assert.equal(err403.isForbidden, true);

  const err400 = new KumaranApiError(400, { code: 'BAD_REQUEST', message: 'Discount exceeds ceiling' });
  assert.equal(err400.isValidationError, true);

  const err500 = new KumaranApiError(500, { code: 'INTERNAL_SERVER_ERROR', message: 'Database timeout' });
  assert.equal(err500.isInternalServerError, true);
});


test('Client Factory: 401 retry on POST request with body succeeds using unconsumed cloned stream', async () => {
  let initialCallCount = 0;
  let refreshCallCount = 0;
  let retriedCallCount = 0;
  let retriedBodyReceived = '';

  const mockFetch = async (req: Request) => {
    const url = req.url;

    if (url.includes('/api/v1/auth/refresh-token')) {
      refreshCallCount++;
      return new Response(
        JSON.stringify({
          data: {
            accessToken: 'refreshed-jwt-access-token-99999',
            refreshToken: 'new-refresh-token-11111',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/api/v1/payments')) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader === 'Bearer initial-stale-token') {
        initialCallCount++;
        await req.text();
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }

      if (authHeader === 'Bearer refreshed-jwt-access-token-99999') {
        retriedCallCount++;
        retriedBodyReceived = await req.text();
        return new Response(JSON.stringify({ success: true, data: { paymentId: 'pay-uuid-ok' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  };

  let activeToken = 'initial-stale-token';
  const client = createKumaranClient({
    baseUrl: 'http://127.0.0.1:3000',
    getAccessToken: () => activeToken,
    getRefreshToken: () => 'valid-refresh-token',
    onTokenRefreshed: (tokens) => {
      activeToken = tokens.accessToken;
    },
    fetch: mockFetch,
  });

  const postPayload = { amount: 10000, paymentMode: 'CASH' };
  await client.POST('/api/v1/payments' as any, {
    body: postPayload as any,
  });

  assert.equal(initialCallCount, 1, 'Initial request should have fired');
  assert.equal(refreshCallCount, 1, 'Refresh token request should have fired on 401');
  assert.equal(retriedCallCount, 1, 'Retried request should have fired with refreshed token');
  assert.equal(activeToken, 'refreshed-jwt-access-token-99999');
  assert.ok(retriedBodyReceived.includes('10000'), 'Retried body should contain original payload');
});

test('Client Factory: empty string baseUrl preserves relative Next.js BFF path instead of falling back to localhost:3000', async () => {
  let capturedUrl = '';
  const mockFetch = async (req: Request) => {
    capturedUrl = req.url;
    return new Response(JSON.stringify({ success: true, data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const client = createKumaranClient({
    baseUrl: '',
    fetch: mockFetch,
  });

  try {
    await client.GET('/api/v1/chits' as any);
    assert.ok(!capturedUrl.includes('localhost:3000'), `Expected relative BFF URL, got: ${capturedUrl}`);
    assert.ok(capturedUrl.endsWith('/api/v1/chits'));
  } catch (err: any) {
    // In Node without browser document origin, Request('/api/v1/chits') fails with input === '/api/v1/chits',
    // proving baseUrl stayed empty instead of falling back to http://localhost:3000.
    assert.equal(err?.cause?.code, 'ERR_INVALID_URL');
    assert.equal(err?.cause?.input, '/api/v1/chits');
  }
});

test('Client Factory: /bff baseUrl builds /bff/api/v1/* path for Nginx BFF isolation', async () => {
  const client = createKumaranClient({
    baseUrl: '/bff',
    fetch: async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }),
  });

  try {
    await client.GET('/api/v1/chits' as any);
  } catch (err: any) {
    assert.equal(err?.cause?.code, 'ERR_INVALID_URL');
    assert.equal(err?.cause?.input, '/bff/api/v1/chits');
  }
});

test('Contract Schema Types (DEF-FE-04): generated DTO schemas resolve concrete primitive and nested types', () => {
  type Schema<T extends keyof import('../src/generated/api-types.js').components['schemas']> =
    import('../src/index.js').Schema<T>;

  type Payment = Schema<'PaymentRecordDto'>;
  type Customer = Schema<'CustomerResponseDto'>;
  type Auction = Schema<'AuctionResponseDto'>;
  type Reversal = Schema<'ReversalRecordDto'>;
  type VerifyUpiClaim = Schema<'VerifyUpiClaimResponseDto'>;
  type DefaultersReport = Schema<'DefaultersReportResponseDto'>;

  const samplePaidAt: Payment['paidAt'] = '2026-10-22T07:28:14.000Z';
  const sampleBranchId: Payment['branchId'] = null;
  const sampleTamilName: Customer['fullNameTamil'] = 'முருகன்';
  const sampleCustomerCreatedAt: Customer['createdAt'] = '2026-10-22T07:28:14.000Z';
  const sampleAuctionDiscount: Auction['bidDiscount'] = 50000;
  const sampleReversalApproved: Reversal['isApproved'] = false;
  const sampleVerifyReceiptId: VerifyUpiClaim['receipt']['id'] = 'rcpt-001';
  const samplePaginationTotal: DefaultersReport['pagination']['totalRecords'] = 42;
  const sampleDefaultersList: DefaultersReport['defaulters'] = [{ ticketId: 't-1' }];

  assert.equal(samplePaidAt.startsWith('2026'), true);
  assert.equal(sampleBranchId, null);
  assert.equal(typeof sampleTamilName, 'string');
  assert.equal(typeof sampleCustomerCreatedAt, 'string');
  assert.equal(sampleAuctionDiscount, 50000);
  assert.equal(sampleReversalApproved, false);
  assert.equal(sampleVerifyReceiptId, 'rcpt-001');
  assert.equal(samplePaginationTotal, 42);
  assert.equal(sampleDefaultersList.length, 1);
});
