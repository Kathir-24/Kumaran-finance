// ==============================================================================
// Kumaran Chits — BFF Auth Login Route Handler (/api/auth/login)
// Proxies staff credentials to NestJS backend, setting HttpOnly session or pending 2FA cookies.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { shouldUseSecureCookies } from '@/lib/auth-cookies';
import { buildBffForwardHeaders } from '@/lib/bff-forward-headers';
import { handleBffLoginPost } from '@/lib/bff-auth-handlers';

export async function POST(request: NextRequest) {
  return handleBffLoginPost(
    request,
    (payload, init) => NextResponse.json(payload, init),
    {
      isSecure: shouldUseSecureCookies(request),
      forwardHeaders: buildBffForwardHeaders(request.headers, {
        contentType: 'application/json',
      }),
    },
  );
}
