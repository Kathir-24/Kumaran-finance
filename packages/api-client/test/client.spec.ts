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
  assert.equal(parseWholeRupees('₹25,000.50'), 2500050);
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
