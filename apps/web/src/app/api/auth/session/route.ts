// ==============================================================================
// Kumaran Chits — BFF Auth Session Hydration Route Handler (/api/auth/session)
// Verifies session cookies with NestJS, uses shared BFF refresh deduplication,
// and returns sanitized staff identity or non-secret pending 2FA status.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { shouldUseSecureCookies } from '@/lib/auth-cookies';
import { buildBffForwardHeaders } from '@/lib/bff-forward-headers';
import { handleBffSessionGet } from '@/lib/bff-auth-handlers';

export async function GET(request: NextRequest) {
  return handleBffSessionGet(
    request,
    (payload, init) => NextResponse.json(payload, init),
    {
      isSecure: shouldUseSecureCookies(request),
      forwardHeaders: buildBffForwardHeaders(request.headers),
    },
  );
}
