'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Landmark,
  ShieldAlert,
  ShieldCheck,
  Vault,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';

export default function ReportsHubPage() {
  const t = useTranslations('reports');
  const tCommon = useTranslations('common');

  const user = useAuthStore((s) => s.user);
  const allowedRoles = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'];
  const hasAccess = user?.roles?.some((r) => allowedRoles.includes(r));

  if (!hasAccess) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-300">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-rose-400 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-white">{t('accessDeniedTitle')}</h2>
              <p className="text-sm text-rose-200/90 mt-1">{t('accessDeniedDesc')}</p>
            </div>
          </div>
          <div className="mt-4">
            <Button asChild variant="outline" size="sm" className="border-rose-500/30 text-rose-200">
              <Link href="/">{tCommon('back')}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const reportCards = [
    {
      title: t('formXxii'),
      description: t('cashBookSubtitle'),
      href: '/reports/cash-book',
      icon: Vault,
      badgeText: tCommon('active'),
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      tag: t('tagFormXxii'),
    },
    {
      title: t('formXvii'),
      description: t('formXviiCardDesc'),
      href: '/reports/minutes',
      icon: FileCheck,
      badgeText: tCommon('active'),
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      tag: t('tagRegistrar'),
    },
    {
      title: t('formXxi'),
      description: t('formXxiCardDesc'),
      href: '/reports/ledger',
      icon: BookOpen,
      badgeText: tCommon('active'),
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      tag: t('tagSubscriberPassbooks'),
    },
    {
      title: t('defaultersCardTitle'),
      description: t('defaultersCardDesc'),
      href: '/reports/defaulters',
      icon: AlertTriangle,
      badgeText: tCommon('active'),
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      tag: t('tagRiskRecovery'),
    },
    {
      title: t('auditLogs'),
      description: t('auditLogsCardDesc'),
      href: '/reports/audit-logs',
      icon: ShieldCheck,
      badgeText: tCommon('active'),
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      tag: t('tagAudit'),
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-sm">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">{t('title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('subtitle')}</p>
          </div>
        </div>

        <Badge variant="outline" className="text-xs font-mono border-slate-800 text-slate-300 self-start sm:self-auto">
          {t('tamilNaduRulesBadge')}
        </Badge>
      </div>

      {/* Description Banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400">
        <p>{t('hubDescription')}</p>
      </div>

      {/* 4 Register Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reportCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.href}
              className="border-slate-800 bg-slate-900/80 shadow-sm hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono font-medium text-slate-500 uppercase tracking-wider">
                      {card.tag}
                    </span>
                    <Badge variant="outline" className={card.badgeColor}>
                      {card.badgeText}
                    </Badge>
                  </div>
                  <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                    <Icon className="h-5 w-5 text-emerald-400 shrink-0" />
                    <span>{card.title}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {card.description}
                  </CardDescription>
                </CardHeader>
              </div>

              <CardContent className="pt-0">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full justify-between border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-800 hover:text-white text-xs h-9"
                >
                  <Link href={card.href}>
                    <span>{t('viewRegister')}</span>
                    <ArrowRight className="h-4 w-4 text-emerald-400" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
