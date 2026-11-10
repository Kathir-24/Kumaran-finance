// ==============================================================================
// Kumaran Chits — Next.js 15 Edge Authentication Middleware (src/middleware.ts)
// Enforces instant server-side HTTP 307 redirects for unauthenticated routes,
// eliminating Flash of Unauthenticated Content (FOUC) at zero millisecond latency.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_SESSION_ACTIVE,
} from './lib/auth-cookies';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip static assets, Next.js internal bundles, and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/print') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. Check for active session cookies
  const hasAccessToken = request.cookies.has(COOKIE_ACCESS_TOKEN);
  const hasRefreshToken = request.cookies.has(COOKIE_REFRESH_TOKEN);
  const hasSessionActive = request.cookies.has(COOKIE_SESSION_ACTIVE);
  const isAuthenticated = hasAccessToken || hasRefreshToken || hasSessionActive;

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/2fa');

  // Case A: Unauthenticated user trying to access protected dashboard routes
  if (!isAuthenticated && !isAuthPage) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Case B: Authenticated user trying to access login/2fa pages
  if (isAuthenticated && isAuthPage) {
    const redirectParam = request.nextUrl.searchParams.get('redirect');
    const destinationUrl = new URL(redirectParam || '/', request.url);
    return NextResponse.redirect(destinationUrl);
  }

  return NextResponse.next();
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
