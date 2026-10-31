// ==============================================================================
// Kumaran Chits — Staff Login Page Entrypoint (/login)
// Wraps LoginForm in Suspense boundary for Next.js 15 App Router query param safety.
// ==============================================================================

import * as React from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Office Staff Login — Kumaran Chits',
  description: 'Sign in to the Kumaran Finance Chit Operations Workstation (Perundurai Head Office)',
};

function LoginLoadingSkeleton() {
  return (
    <div className="h-96 w-full animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50 p-6" />
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<LoginLoadingSkeleton />}>
      <LoginForm />
    </React.Suspense>
  );
}
