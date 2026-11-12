'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Calculator,
  ShieldAlert,
  BookOpen,
} from 'lucide-react';
import { formatRupee } from '@/lib/currency';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CalculatorSimulator() {
  const t = useTranslations('instructions');

  // Simulator state: default to standard ₹1 Lakh 20M scheme
  const [chitValue, setChitValue] = React.useState<number>(100000);
  const [duration, setDuration] = React.useState<number>(20);
  const [bidDiscount, setBidDiscount] = React.useState<number>(25000); // 1/4 ceiling default

  // Presets
  const presets = [
    { label: '₹1,00,000 (20M)', v: 100000, n: 20, d: 25000 },
    { label: '₹2,00,000 (20M)', v: 200000, n: 20, d: 50000 },
    { label: '₹5,00,000 (20M)', v: 500000, n: 20, d: 125000 },
    { label: '₹10,00,000 (20M)', v: 1000000, n: 20, d: 250000 },
  ];

  // Derived whole-rupee math invariants
  const safeV = Math.max(10000, chitValue);
  const safeN = Math.max(2, duration);

  const baseInstallment = Math.floor(safeV / safeN);
  const foremanCommission = Math.floor((safeV * 4) / 100); // 4.00%
  const maxDiscountCeiling = Math.floor(safeV / 4); // 1/4 ceiling

  // Clamp bid discount between floor and ceiling
  const isBelowFloor = bidDiscount < foremanCommission;
  const isAboveCeiling = bidDiscount > maxDiscountCeiling;

  const effectiveDiscount = Math.max(
    foremanCommission,
    Math.min(maxDiscountCeiling, bidDiscount),
  );

  const totalDividend = effectiveDiscount - foremanCommission;
  const dividendPerTicket = Math.floor(totalDividend / safeN);
  const netInstallment = baseInstallment - dividendPerTicket;
  const prizeMoney = safeV - effectiveDiscount;

  const applyPreset = (p: (typeof presets)[0]) => {
    setChitValue(p.v);
    setDuration(p.n);
    setBidDiscount(p.d);
  };

  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
      <CardHeader className="pb-3 border-b border-slate-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-emerald-400" />
              <CardTitle className="text-base font-semibold text-white">
                {t('simulatorTitle')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-400 mt-1">
              {t('simulatorSubtitle')}
            </CardDescription>
          </div>

          <Badge variant="paid" className="text-xs">
            {t('pureWholeRupeeBadge')}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-6">
        {/* Quick Presets */}
        <div>
          <span className="text-xs font-medium text-slate-400 block mb-2">
            {t('quickPresetsLabel')}
          </span>
          <div className="flex flex-wrap gap-2">
            {presets.map((p, idx) => (
              <Button
                key={idx}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(p)}
                className={`text-xs border-slate-700 ${
                  chitValue === p.v && duration === p.n
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              {t('labelChitValue')} (₹)
            </label>
            <Input
              type="number"
              min={10000}
              step={1000}
              value={chitValue}
              onChange={(e) => setChitValue(Number(e.target.value) || 0)}
              className="font-mono bg-slate-950 border-slate-700 text-white"
            />
            <span className="text-[11px] text-slate-500 font-mono">
              Base: {formatRupee(baseInstallment)}/mo
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              {t('labelDuration')} (Months)
            </label>
            <Input
              type="number"
              min={2}
              max={60}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 0)}
              className="font-mono bg-slate-950 border-slate-700 text-white"
            />
            <span className="text-[11px] text-slate-500 font-mono">
              Tickets: {safeN} members
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                {t('labelBidDiscount')} (D)
              </label>
              <span className="text-[11px] text-emerald-400 font-mono">
                Ceiling: {formatRupee(maxDiscountCeiling)}
              </span>
            </div>
            <Input
              type="number"
              min={foremanCommission}
              max={maxDiscountCeiling}
              step={500}
              value={bidDiscount}
              onChange={(e) => setBidDiscount(Number(e.target.value) || 0)}
              className={`font-mono bg-slate-950 text-white ${
                isAboveCeiling || isBelowFloor
                  ? 'border-rose-500 text-rose-300'
                  : 'border-slate-700'
              }`}
            />
            {isAboveCeiling && (
              <span className="text-[11px] text-rose-400 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" />
                {t('ceilingWarning', { amount: formatRupee(maxDiscountCeiling) })}
              </span>
            )}
            {isBelowFloor && (
              <span className="text-[11px] text-amber-400 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" />
                {t('floorWarning', { amount: formatRupee(foremanCommission) })}
              </span>
            )}
          </div>
        </div>

        {/* Live Calculation Cards Output */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {/* Foreman Commission */}
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/80">
            <span className="text-[11px] text-slate-400 block mb-1">
              {t('labelForemanCommission')}
            </span>
            <span className="text-base font-mono font-bold text-slate-200">
              {formatRupee(foremanCommission)}
            </span>
            <span className="text-[10px] text-slate-500 block mt-1">4.00% Frozen</span>
          </div>

          {/* Total Dividend */}
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/80">
            <span className="text-[11px] text-slate-400 block mb-1">
              {t('labelTotalDividend')}
            </span>
            <span className="text-base font-mono font-bold text-blue-300">
              {formatRupee(totalDividend)}
            </span>
            <span className="text-[10px] text-slate-500 block mt-1">D - 4% Comm</span>
          </div>

          {/* Dividend Per Ticket */}
          <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-950/10">
            <span className="text-[11px] text-emerald-400 block mb-1">
              {t('labelDividendPerTicket')}
            </span>
            <span className="text-base font-mono font-bold text-emerald-400">
              {formatRupee(dividendPerTicket)}
            </span>
            <span className="text-[10px] text-emerald-500/80 block mt-1">Equal for all M</span>
          </div>

          {/* Net Installment Due */}
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/80">
            <span className="text-[11px] text-slate-400 block mb-1">
              {t('labelNetInstallment')}
            </span>
            <span className="text-base font-mono font-bold text-white">
              {formatRupee(netInstallment)}
            </span>
            <span className="text-[10px] text-slate-500 block mt-1">Base - Div</span>
          </div>

          {/* Winner Prize Money */}
          <div className="p-3 rounded-lg border border-purple-500/30 bg-purple-950/10 col-span-2 lg:col-span-1">
            <span className="text-[11px] text-purple-300 block mb-1">
              {t('labelPrizeMoney')}
            </span>
            <span className="text-base font-mono font-bold text-purple-300">
              {formatRupee(prizeMoney)}
            </span>
            <span className="text-[10px] text-purple-400/80 block mt-1">V - Discount</span>
          </div>
        </div>

        {/* Passbook Row Sum Invariant Live Demonstration */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/90 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-emerald-400 shrink-0" />
              {t('passbookPreview')}
            </span>
            <Badge variant="paid" className="text-[10px]">
              {t('passbookInvariantBadge')}
            </Badge>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[580px] text-xs text-left text-slate-300">
              <thead className="text-[11px] uppercase bg-slate-900 border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-3 py-2 whitespace-nowrap">{t('passbookMonthCol')}</th>
                  <th className="px-3 py-2 whitespace-nowrap">{t('passbookWindowCol')}</th>
                  <th className="px-3 py-2 whitespace-nowrap">{t('passbookPaidCol')}</th>
                  <th className="px-3 py-2 whitespace-nowrap">{t('passbookDivCol')}</th>
                  <th className="px-3 py-2 whitespace-nowrap">{t('passbookGrossCol')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                <tr>
                  <td className="px-3 py-2 font-bold text-white whitespace-nowrap">{t('month2Label')}</td>
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{t('windowSample')}</td>
                  <td className="px-3 py-2 text-emerald-400 font-bold whitespace-nowrap">
                    {formatRupee(netInstallment)}
                  </td>
                  <td className="px-3 py-2 text-blue-300 whitespace-nowrap">
                    + {formatRupee(dividendPerTicket)}
                  </td>
                  <td className="px-3 py-2 text-white font-bold whitespace-nowrap">
                    = {formatRupee(baseInstallment)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
