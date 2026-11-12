// ==============================================================================
// Kumaran Chits — Edge Authentication & RBAC Middleware (DEF-FE-03)
// Cryptographically verifies HttpOnly BFF JWT cookies via Web Crypto (jose HS256),
// enforces canonical role-based route gates, and ignores spoofable JS presence flags.
// ==============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_SESSION_ACTIVE,
  COOKIE_TOTP_PENDING,
  getClearedCookieOptions,
  shouldUseSecureCookies,
} from './lib/auth-cookies.ts';
import { evaluateEdgeAuth } from './lib/edge-auth.ts';

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  const decision = await evaluateEdgeAuth({
    pathname,
    redirectParam: searchParams.get('redirect'),
    errorParam: searchParams.get('error'),
    accessToken: request.cookies.get(COOKIE_ACCESS_TOKEN)?.value,
    refreshToken: request.cookies.get(COOKIE_REFRESH_TOKEN)?.value,
    totpPendingToken: request.cookies.get(COOKIE_TOTP_PENDING)?.value,
  });

  if (decision.action === 'next') {
    return NextResponse.next();
  }

  const response = NextResponse.redirect(new URL(decision.location, request.url));
  const isSecure = shouldUseSecureCookies(request);

  if (decision.clearStaleCookies) {
    response.cookies.set(COOKIE_ACCESS_TOKEN, '', getClearedCookieOptions(true, isSecure));
    response.cookies.set(COOKIE_REFRESH_TOKEN, '', getClearedCookieOptions(true, isSecure));
    response.cookies.set(COOKIE_SESSION_ACTIVE, '', getClearedCookieOptions(false, isSecure));
  }

  if (decision.clearPendingTotpCookie) {
    response.cookies.set(COOKIE_TOTP_PENDING, '', getClearedCookieOptions(true, isSecure));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
