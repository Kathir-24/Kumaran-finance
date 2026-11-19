'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useAuthStore, hasAnyRole } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { SchemeForm } from '@/components/schemes/scheme-form';

export default function NewSchemePage() {
  const t = useTranslations('schemes');
  const user = useAuthStore((s) => s.user);

  const isAuthorized = hasAnyRole(user, ['PARTNER']);

  if (!isAuthorized) {
    return (
      <div className="space-y-6">
        <Link
          href="/schemes"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('backToDirectory')}</span>
        </Link>

        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-8 text-center text-rose-300 space-y-3">
          <ShieldAlert className="h-10 w-10 text-rose-400 mx-auto" />
          <h2 className="text-base font-bold text-slate-100">{t('accessDeniedTitle')}</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">{t('accessDeniedDesc')}</p>
          <Button variant="outline" className="mt-2" asChild>
            <Link href="/schemes">{t('backToDirectory')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Navigation */}
      <div>
        <Link
          href="/schemes"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors font-medium mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('backToDirectory')}</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100 font-sans">
          {t('createTitle')}
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          {t('createSubtitle')}
        </p>
      </div>

      {/* Embedded In-Page Guardrail Banners */}
      <BusinessRuleBanner
        ruleNumber={6}
        title="Fixed 1/4 Ceiling Discount & 4% Commission Freeze (ADR-04 & ADR-06)"
        description="Every fresh scheme enforces pure whole-rupee math (V / N). Foreman commission is permanently locked at 4.00% upon activation, and the maximum auction discount ceiling is strictly fixed at V / 4 (25%)."
        referencePath="/instructions?rule=6"
        defaultExpanded={false}
      />

      {/* Main Scheme Form */}
      <SchemeForm />
    </div>
  );
}
