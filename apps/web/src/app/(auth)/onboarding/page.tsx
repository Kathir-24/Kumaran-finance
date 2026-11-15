// ==============================================================================
// Kumaran Chits — Staff Onboarding Page Entrypoint (/onboarding)
// Wraps OnboardingForm in Suspense boundary for Next.js 15 App Router query param safety.
// ==============================================================================

import * as React from 'react';
import type { Metadata } from 'next';
import { OnboardingForm } from '@/components/auth/onboarding-form';

export const metadata: Metadata = {
  title: 'Staff Onboarding — Kumaran Chits',
  description: 'Initial password configuration for office staff (Perundurai Head Office Workstation)',
};

function OnboardingLoadingSkeleton() {
  return (
    <div className="h-96 w-full animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50 p-6" />
  );
}

export default function OnboardingPage() {
  return (
    <React.Suspense fallback={<OnboardingLoadingSkeleton />}>
      <OnboardingForm />
    </React.Suspense>
  );
}
