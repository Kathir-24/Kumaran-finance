'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Users, ShieldCheck, Clock, Ticket } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface CustomerSummaryCardsProps {
  total: number;
  verifiedCount: number;
  pendingCount: number;
  activeTicketsCount: number;
  isLoading?: boolean;
}

export function CustomerSummaryCards({
  total,
  verifiedCount,
  pendingCount,
  activeTicketsCount,
  isLoading = false,
}: CustomerSummaryCardsProps) {
  const t = useTranslations('customers');

  const verifiedPct = total > 0 ? Math.round((verifiedCount / total) * 100) : 0;

  const cards = [
    {
      title: t('totalSubscribers'),
      value: total,
      subtext: `${total} registered`,
      icon: Users,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10 border-blue-500/20',
      valColor: 'text-slate-100',
    },
    {
      title: t('verifiedSubscribers'),
      value: verifiedCount,
      subtext: `${verifiedPct}% KYC approved`,
      icon: ShieldCheck,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10 border-emerald-500/20',
      valColor: 'text-emerald-400',
    },
    {
      title: t('pendingKycCount'),
      value: pendingCount,
      subtext: t('adr16Notice'),
      icon: Clock,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10 border-amber-500/20',
      valColor: 'text-amber-400',
    },
    {
      title: t('activeTicketsCount'),
      value: activeTicketsCount,
      subtext: t('adr13Notice'),
      icon: Ticket,
      iconColor: 'text-indigo-400',
      iconBg: 'bg-indigo-500/10 border-indigo-500/20',
      valColor: 'text-indigo-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card
            key={idx}
            className="border-slate-800 bg-slate-900/60 shadow-sm transition-all hover:border-slate-700/80"
          >
            <CardContent className="p-3.5 sm:p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-slate-400 leading-snug">
                  {card.title}
                </span>
                <div
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border p-1',
                    card.iconBg
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5', card.iconColor)} />
                </div>
              </div>

              <div className="space-y-0.5">
                {isLoading ? (
                  <div className="h-7 w-20 animate-pulse rounded bg-slate-800" />
                ) : (
                  <p className={cn('text-2xl font-bold tracking-tight', card.valColor)}>
                    {card.value.toLocaleString()}
                  </p>
                )}
                <p className="text-[11px] text-slate-400 leading-snug">
                  {card.subtext}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
