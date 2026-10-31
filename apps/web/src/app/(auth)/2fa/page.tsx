// ==============================================================================
// Kumaran Chits — 2FA Microsoft Authenticator Verification Page (/2fa)
// Wraps TotpForm in Suspense boundary for Next.js 15 query param safety.
// ==============================================================================

import * as React from 'react';
import type { Metadata } from 'next';
import { TotpForm } from '@/components/auth/totp-form';

export const metadata: Metadata = {
  title: 'Two-Factor Authentication — Kumaran Chits',
  description: 'Enter your 6-digit Microsoft Authenticator security code (Perundurai Head Office Workstation)',
};

function TotpLoadingSkeleton() {
  return (
    <div className="h-96 w-full animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50 p-6" />
  );
}

export default function TwoFactorPage() {
  return (
    <React.Suspense fallback={<TotpLoadingSkeleton />}>
      <TotpForm />
    </React.Suspense>
  );
}
