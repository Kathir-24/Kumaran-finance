'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Landmark,
  BookOpen,
  Users,
  Gavel,
  Receipt,
  BookCheck,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Building2,
  Clock,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupee } from '@kumaran/api-client';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function DashboardRootPage() {
  const t = useTranslations();
  const user = useAuthStore((s) => s.user);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);

  const currentDate = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const quickNav = [
    {
      href: '/schemes',
      titleKey: 'nav.schemes',
      icon: Landmark,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      desc: 'Active, planned & completed chit schemes',
    },
    {
      href: '/schemes/onboard',
      titleKey: 'nav.onboardGrid',
      icon: BookOpen,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      desc: '400-cell physical paper notebook transcription grid',
    },
    {
      href: '/customers',
      titleKey: 'nav.customers',
      icon: Users,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      desc: 'Subscriber directory, passbooks & nominee records',
    },
    {
      href: '/auctions',
      titleKey: 'nav.auctions',
      icon: Gavel,
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      desc: 'In-office auction room with 1/4 ceiling & token tie-break',
    },
    {
      href: '/collections',
      titleKey: 'nav.collections',
      icon: Receipt,
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      desc: 'Counter cash payments & discrete net due matching',
    },
    {
      href: '/instructions',
      titleKey: 'nav.instructions',
      icon: BookCheck,
      color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
      desc: 'The 10 Invariant Guardrails & daily staff operating manuals',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Welcome Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 mb-1">
            <Building2 className="h-3.5 w-3.5" />
            <span>{t('app.company')} • {t('app.branch')}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            வணக்கம், {user?.name || 'Staff User'}
          </h1>
          <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
            <Clock className="h-3 w-3 text-slate-500" />
            {currentDate}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="paid" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{t('common.zeroPaiseGuard')}</span>
          </Badge>
          <Badge variant="neutral">
            v{t('common.version')}
          </Badge>
        </div>
      </div>

      {/* Contextual Rule Banner */}
      <BusinessRuleBanner
        ruleNumber={1}
        title={t('rules.guardrail1Title')}
        description={t('rules.guardrail1Desc')}
        bulletPoints={[
          'Single company tenancy: Built solely for Kumaran Finance (Perundurai, Erode)',
          'Zero company_id columns exist in PostgreSQL database',
          'Enforces 4-partner maker-checker governance across web and mobile'
        ]}
        referencePath="/instructions"
      />

      {/* Quick Navigation Action Grid */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          செயல்பாட்டு தொகுதிகள் / Operational Modules
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickNav.map((item) => {
            const Icon = item.icon;
            const subKey = item.titleKey.replace('nav.', '');
            let title = subKey;
            try {
              title = t(`nav.${subKey}` as any);
            } catch {
              title = subKey;
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="group relative flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900 shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${item.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-600 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-slate-300" />
                  </div>

                  <h3 className="font-semibold text-base text-slate-100 group-hover:text-emerald-400 transition-colors">
                    {title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center text-[11px] font-medium text-emerald-400/90 group-hover:text-emerald-400">
                  <span>திறக்க கிளிக் செய்யவும் / Launch</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
