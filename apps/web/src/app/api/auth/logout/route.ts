// ==============================================================================
// Kumaran Chits — BFF Auth Logout Route Handler (/api/auth/logout)
// Invalidates BFF refresh caches, revokes token in NestJS & Redis, purges cookies.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { shouldUseSecureCookies } from '@/lib/auth-cookies';
import { buildBffForwardHeaders } from '@/lib/bff-forward-headers';
import { handleBffLogoutPost } from '@/lib/bff-auth-handlers';

export async function POST(request: NextRequest) {
  return handleBffLogoutPost(
    request,
    (payload, init) => NextResponse.json(payload, init),
    {
      isSecure: shouldUseSecureCookies(request),
      forwardHeaders: buildBffForwardHeaders(request.headers),
    },
  );
}
