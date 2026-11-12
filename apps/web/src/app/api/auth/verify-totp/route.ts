// ==============================================================================
// Kumaran Chits — BFF Auth TOTP Verification Route Handler (/api/auth/verify-totp)
// Reads 5-min pending JWT strictly from HttpOnly cookie and sets HttpOnly session cookies.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { shouldUseSecureCookies } from '@/lib/auth-cookies';
import { buildBffForwardHeaders } from '@/lib/bff-forward-headers';
import { handleBffVerifyTotpPost } from '@/lib/bff-auth-handlers';

export async function POST(request: NextRequest) {
  return handleBffVerifyTotpPost(
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
