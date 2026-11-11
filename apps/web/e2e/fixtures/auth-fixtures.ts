import type { Page, APIRequestContext } from '@playwright/test';
import type { PersonaConfig } from './auth-personas.ts';

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    name: string;
    phone: string;
    roles: string[];
    branchId?: string | null;
  };
}

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * Executes direct API login against NestJS backend to acquire real JWT tokens.
 * Fast, headless, and avoids repetitive UI login forms in non-auth E2E tests.
 */
export async function loginViaApi(
  request: APIRequestContext,
  persona: PersonaConfig,
): Promise<AuthSession> {
  const response = await request.post(`${API_BASE_URL}/api/v1/auth/web/login`, {
    data: {
      phone: persona.phone,
      password: persona.password,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const errorBody = await response.text();
    throw new Error(
      `[Playwright Auth] Failed to authenticate persona ${persona.name} via API (${response.status()}): ${errorBody}`,
    );
  }

  const json = await response.json();
  const payload = json.data || json;

  if (!payload.accessToken) {
    throw new Error(
      `[Playwright Auth] Login response for ${persona.name} did not contain accessToken: ${JSON.stringify(payload)}`,
    );
  }

  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
  };
}

export function buildSessionCookies(session: AuthSession, baseUrl: string) {
  const secure = baseUrl.startsWith('https://');
  const cookies: Array<{
    name: string;
    value: string;
    url: string;
    httpOnly: boolean;
    sameSite: 'Lax';
    secure: boolean;
  }> = [
    {
      name: 'kc_access_token',
      value: session.accessToken,
      url: baseUrl,
      httpOnly: true,
      sameSite: 'Lax',
      secure,
    },
    {
      name: 'kc_session_active',
      value: '1',
      url: baseUrl,
      httpOnly: false,
      sameSite: 'Lax',
      secure,
    },
  ];

  if (session.refreshToken) {
    cookies.push({
      name: 'kc_refresh_token',
      value: session.refreshToken,
      url: baseUrl,
      httpOnly: true,
      sameSite: 'Lax',
      secure,
    });
  }

  return cookies;
}

/**
 * Injects authenticated BFF HttpOnly session cookies into the browser context before navigation.
 * Aligns with Edge Middleware (`kc_access_token`, `kc_refresh_token`, `kc_session_active`)
 * while storing zero secret JWTs in `localStorage` (ADR-20).
 */
export async function injectSession(
  page: Page,
  session: AuthSession,
  targetPath: string = '/',
): Promise<void> {
  const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3001';
  await page.context().addCookies(buildSessionCookies(session, baseUrl));

  await page.addInitScript(
    ({ user }) => {
      if (user) {
        window.localStorage.setItem('kc_user_profile', JSON.stringify(user));
      }
      window.localStorage.removeItem('kc_access_token');
      window.localStorage.removeItem('kc_refresh_token');
    },
    { user: session.user },
  );

  await page.goto(targetPath, { waitUntil: 'domcontentloaded' });
  // Wait for the app shell / main content to be visible without blocking on SSE streams
  await page.locator('main, header, aside, [data-testid="login-form"]').first().waitFor({
    state: 'visible',
    timeout: 15_000,
  });
}

/**
 * Performs authentic UI-driven login via /login form with real user interactions.
 * Validates form rendering, input masking, submission, and URL redirects.
 */
export async function loginViaUi(
  page: Page,
  persona: PersonaConfig,
  options?: { expect2Fa?: boolean },
): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  // Locate phone and password inputs
  const phoneInput = page.locator('input#phone, input[name="phone"]');
  const passwordInput = page.locator('input#password, input[name="password"]');
  const submitButton = page.locator('button[type="submit"]');

  await phoneInput.waitFor({ state: 'visible', timeout: 10_000 });
  await phoneInput.fill(persona.phone);
  await passwordInput.fill(persona.password);
  await submitButton.click();

  if (options?.expect2Fa) {
    await page.waitForURL('**/2fa', { timeout: 15_000 });
  } else {
    // Wait for successful redirect to dashboard
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15_000,
    });
  }
}

/**
 * Performs authentic UI logout by invoking the user profile dropdown.
 */
export async function logoutViaUi(page: Page): Promise<void> {
  const profileTrigger = page.locator('[data-testid="user-menu-trigger"], button:has([class*="lucide-user"]), button:has-text("Kumaran")');
  if (await profileTrigger.isVisible()) {
    await profileTrigger.click();
    const logoutBtn = page.locator('button:has-text("Logout"), button:has-text("வெளியேறு")');
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    }
  } else {
    // Fallback: call BFF logout endpoint to revoke cookies/tokens cleanly and navigate to /login
    await page.evaluate(async () => {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
      window.localStorage.removeItem('kc_user_profile');
      window.localStorage.removeItem('kc_access_token');
      window.localStorage.removeItem('kc_refresh_token');
      window.location.href = '/login';
    });
  }

  await page.waitForURL('**/login**', { timeout: 10_000 });
}
