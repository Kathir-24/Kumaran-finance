// ==============================================================================
// Kumaran Chits — BFF Upstream Header Forwarding Unit Tests (DEF-FE-06)
// Verifies client IP, protocol, host, User-Agent, and X-Request-ID preservation
// across all BFF -> NestJS callers.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildBffForwardHeaders } from '../src/lib/bff-forward-headers.ts';

test('DEF-FE-06: preserves client IP, proto, host, request-id, and user-agent headers', () => {
  const incoming = new Headers({
    'x-forwarded-for': '106.51.10.22, 172.18.0.5',
    'x-real-ip': '106.51.10.22',
    'x-forwarded-proto': 'https',
    'x-forwarded-host': 'chits.kumaranfinance.in',
    'x-request-id': 'req-nginx-001',
    'user-agent': 'Mozilla/5.0 KumaranTest',
    'content-type': 'application/json',
    'x-branch-id': 'br-prd-01',
    cookie: 'kc_access_token=secret-should-not-leak',
  });

  const forwarded = buildBffForwardHeaders(incoming, { includeContentHeaders: true });

  assert.equal(forwarded.get('x-forwarded-for'), '106.51.10.22, 172.18.0.5');
  assert.equal(forwarded.get('x-real-ip'), '106.51.10.22');
  assert.equal(forwarded.get('x-forwarded-proto'), 'https');
  assert.equal(forwarded.get('x-forwarded-host'), 'chits.kumaranfinance.in');
  assert.equal(forwarded.get('x-request-id'), 'req-nginx-001');
  assert.equal(forwarded.get('user-agent'), 'Mozilla/5.0 KumaranTest');
  assert.equal(forwarded.get('content-type'), 'application/json');
  assert.equal(forwarded.get('x-branch-id'), 'br-prd-01');
  assert.equal(forwarded.get('cookie'), null, 'BFF must never forward raw session cookies upstream');
});

test('DEF-FE-06: falls back to X-Real-IP for X-Forwarded-For and Host for X-Forwarded-Host', () => {
  const incoming = new Headers({
    'x-real-ip': '103.21.45.9',
    host: 'portal.kumaranfinance.in:3001',
  });

  const forwarded = buildBffForwardHeaders(incoming, { contentType: 'application/json' });

  assert.equal(forwarded.get('x-real-ip'), '103.21.45.9');
  assert.equal(forwarded.get('x-forwarded-for'), '103.21.45.9');
  assert.equal(forwarded.get('x-forwarded-host'), 'portal.kumaranfinance.in:3001');
  assert.equal(forwarded.get('content-type'), 'application/json');
  assert.match(
    forwarded.get('x-request-id') || '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Expected UUID v4 fallback when inbound X-Request-ID is absent',
  );
});

test('DEF-FE-06: omits content headers by default when includeContentHeaders is false', () => {
  const incoming = new Headers({
    'x-forwarded-for': '106.51.10.22',
    'content-type': 'multipart/form-data',
    'x-branch-id': 'br-prd-01',
  });

  const forwarded = buildBffForwardHeaders(incoming);
  assert.equal(forwarded.get('x-forwarded-for'), '106.51.10.22');
  assert.equal(forwarded.get('content-type'), null);
  assert.equal(forwarded.get('x-branch-id'), null);
});

test('DEF-FE-06: all 4 BFF auth route handlers wire buildBffForwardHeaders', () => {
  const authRoutes = [
    'src/app/api/auth/login/route.ts',
    'src/app/api/auth/verify-totp/route.ts',
    'src/app/api/auth/logout/route.ts',
    'src/app/api/auth/session/route.ts',
  ];

  for (const relPath of authRoutes) {
    const absPath = path.resolve(process.cwd(), relPath);
    const source = fs.readFileSync(absPath, 'utf8');
    assert.ok(
      source.includes('buildBffForwardHeaders('),
      `Expected ${relPath} to forward client IP/trace headers via buildBffForwardHeaders`,
    );
  }
});
