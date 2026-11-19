'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { CustomerIntakeForm } from '@/components/customers/customer-intake-form';

export default function NewCustomerPage() {
  const t = useTranslations('customers');
  const user = useAuthStore((s) => s.user);

  // RBAC Authority Gate: Partner, Branch Manager, Collection Agent are permitted.
  // Desk Accountant and pure IT Super Admin are strictly barred from subscriber profile intake/creation (CustomerController.create).
  const canRegisterCustomer =
    user?.roles?.some((r) =>
      ['PARTNER', 'BRANCH_MANAGER', 'COLLECTION_AGENT'].includes(r)
    ) ?? true;

  if (!canRegisterCustomer) {
    return (
      <div className="space-y-6">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('backToDirectory')}</span>
        </Link>

        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-8 text-center text-rose-300 space-y-3">
          <ShieldAlert className="h-10 w-10 text-rose-400 mx-auto" />
          <h2 className="text-base font-bold text-slate-100">{t('intakeAccessDeniedTitle')}</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">{t('intakeAccessDeniedDesc')}</p>
          <Button variant="outline" className="mt-2 border-slate-700 bg-slate-900 text-slate-200" asChild>
            <Link href="/customers">{t('backToDirectory')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Breadcrumb Navigation */}
      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors font-medium mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('backToDirectory')}</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100 font-sans">
          {t('intakeTitle')}
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          {t('intakeSubtitle')}
        </p>
      </div>

      {/* Embedded In-Page Guardrail Banners: ADR-16 & ADR-13 */}
      <BusinessRuleBanner
        ruleNumber={7}
        title="ADR-16 Paper Intake & ADR-13 Unique Customer Limit"
        description="Physical notebook intake requires only basic identity and residential info. Aadhaar/PAN scans are optional (ADR-16). A subscriber can join multiple chit groups across the company, but cannot hold 2 or more tickets in the same group (ADR-13)."
        referencePath="/instructions?rule=7"
        defaultExpanded={false}
      />

      {/* Lightweight Customer Intake Form */}
      <CustomerIntakeForm />
    </div>
  );
}
