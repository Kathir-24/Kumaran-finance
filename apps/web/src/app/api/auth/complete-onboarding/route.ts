// ==============================================================================
// Kumaran Chits — BFF Auth Complete Onboarding Route Handler (/api/auth/complete-onboarding)
// Reads 15-min restricted JWT from HttpOnly cookie and exchanges for active session.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { shouldUseSecureCookies } from '@/lib/auth-cookies';
import { buildBffForwardHeaders } from '@/lib/bff-forward-headers';
import { handleBffCompleteOnboardingPost } from '@/lib/bff-auth-handlers';

export async function POST(request: NextRequest) {
  return handleBffCompleteOnboardingPost(
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
