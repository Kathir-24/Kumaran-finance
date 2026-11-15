// ==============================================================================
// Kumaran Chits — BFF First-Login Onboarding Route Handler Integration Tests
// Verifies F16: Initial temporary password login returns mustChangePassword: true
// with HttpOnly kc_onboarding_token, and complete-onboarding completes the flow.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_SESSION_ACTIVE,
  COOKIE_TOTP_PENDING,
  COOKIE_ONBOARDING_TOKEN,
} from '../src/lib/auth-cookies.ts';
import {
  handleBffLoginPost,
  handleBffCompleteOnboardingPost,
} from '../src/lib/bff-auth-handlers.ts';

interface RecordedCookieSet {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

function buildMockNextRequest(
  url: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
) {
  const reqHeaders = new Headers(options.headers);
  const cookieStore = new Map(Object.entries(options.cookies || {}));

  return {
    url,
    method: options.method || 'POST',
    headers: reqHeaders,
    nextUrl: new URL(url),
    cookies: {
      get(name: string) {
        const value = cookieStore.get(name);
        return value !== undefined ? { name, value } : undefined;
      },
      has(name: string) {
        return cookieStore.has(name);
      },
    },
    json: async () => options.body || {},
  } as any;
}

function createMockJsonResponseRecorder() {
  const cookieSets: RecordedCookieSet[] = [];

  const factory = (body: unknown, init?: ResponseInit) => {
    return {
      status: init?.status ?? 200,
      headers: new Headers(init?.headers),
      cookies: {
        set(nameOrOpts: any, value?: any, options?: any) {
          if (typeof nameOrOpts === 'object') {
            cookieSets.push({
              name: nameOrOpts.name,
              value: String(nameOrOpts.value ?? ''),
              options: nameOrOpts,
            });
          } else {
            cookieSets.push({
              name: String(nameOrOpts),
              value: String(value ?? ''),
              options: options || {},
            });
          }
        },
      },
      json: async () => body,
      cookieSets,
    } as any;
  };

  return { factory, cookieSets };
}

test('BFF Login: Returns mustChangePassword: true and encloses tempToken in HttpOnly cookie', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        mustChangePassword: true,
        tempToken: 'jwt-onboarding-token-12345',
        message: 'Initial temporary password detected.',
      }),
    } as any;
  };

  try {
    const { factory, cookieSets } = createMockJsonResponseRecorder();
    const req = buildMockNextRequest('http://localhost:3000/api/auth/login', {
      body: { phone: '9842100001', password: 'Temp#Secret123!' },
    });

    const res = await handleBffLoginPost(req, factory, { isSecure: false });
    const data = await res.json();

    assert.equal(data.success, true);
    assert.equal(data.mustChangePassword, true);

    const onboardingCookie = cookieSets.find((c) => c.name === COOKIE_ONBOARDING_TOKEN);
    assert.ok(onboardingCookie, 'HttpOnly kc_onboarding_token cookie must be set');
    assert.equal(onboardingCookie.value, 'jwt-onboarding-token-12345');
    assert.equal((onboardingCookie.options as any).httpOnly, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BFF Complete Onboarding: Reads token from cookie and establishes session cookies', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any) => {
    if (String(url).includes('/complete-onboarding')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          accessToken: 'access-jwt-active',
          refreshToken: 'refresh-jwt-active',
          user: { id: 'user-001', phone: '9842100001' },
          message: 'Password updated successfully.',
        }),
      } as any;
    }
    return { ok: false, status: 404, json: async () => ({}) } as any;
  };

  try {
    const { factory, cookieSets } = createMockJsonResponseRecorder();
    const req = buildMockNextRequest('http://localhost:3000/api/auth/complete-onboarding', {
      body: { newPassword: 'MyNewPermanentPassword#2026' },
      cookies: { [COOKIE_ONBOARDING_TOKEN]: 'jwt-onboarding-token-12345' },
    });

    const res = await handleBffCompleteOnboardingPost(req, factory, { isSecure: false });
    const data = await res.json();

    assert.equal(data.success, true);
    assert.ok(data.user);

    const accessCookie = cookieSets.find((c) => c.name === COOKIE_ACCESS_TOKEN);
    const refreshCookie = cookieSets.find((c) => c.name === COOKIE_REFRESH_TOKEN);
    const activeCookie = cookieSets.find((c) => c.name === COOKIE_SESSION_ACTIVE);
    const clearedOnboarding = cookieSets.find(
      (c) => c.name === COOKIE_ONBOARDING_TOKEN && (c.options as any).maxAge === 0,
    );

    assert.ok(accessCookie, 'Access cookie must be set');
    assert.ok(refreshCookie, 'Refresh cookie must be set');
    assert.ok(activeCookie, 'Session active marker must be set');
    assert.ok(clearedOnboarding, 'Onboarding token cookie must be cleared upon completion');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BFF Complete Onboarding: Rejects with 401 when onboarding cookie is missing', async () => {
  const { factory, cookieSets } = createMockJsonResponseRecorder();
  const req = buildMockNextRequest('http://localhost:3000/api/auth/complete-onboarding', {
    body: { newPassword: 'MyNewPermanentPassword#2026' },
    cookies: {}, // No cookie!
  });

  const res = await handleBffCompleteOnboardingPost(req, factory, { isSecure: false });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.sessionExpired, true);
});
