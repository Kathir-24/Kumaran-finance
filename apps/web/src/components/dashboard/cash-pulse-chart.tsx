'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { formatRupee } from '@/lib/currency';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { toSafeBigInt, type WholeRupeeValue } from '@/components/reports/report-bigint';

interface CashPulseChartProps {
  collections?: {
    cash: WholeRupeeValue;
    upi: WholeRupeeValue;
    bankTransfer: WholeRupeeValue;
    cheque: WholeRupeeValue;
    total: WholeRupeeValue;
  };
  disbursementsTotal?: WholeRupeeValue;
  isLoading: boolean;
}

interface CashPulseDatum {
  mode: string;
  /** Scaled numeric height strictly for Recharts SVG plotting */
  amount: number;
  /** Exact 64-bit BigInt rupee value for Guardrail 2 lossless display */
  exactAmount: bigint;
  type: 'inflow' | 'outflow';
  color: string;
}

function toChartPlotNumber(value: bigint): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function CashPulseChart({
  collections,
  disbursementsTotal = 0,
  isLoading,
}: CashPulseChartProps) {
  const t = useTranslations('dashboard');
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Guardrail 2: Exact BigInt accumulation — zero IEEE-754 precision loss or NaN
  const cashBig = toSafeBigInt(collections?.cash);
  const upiBig = toSafeBigInt(collections?.upi);
  const bankBig = toSafeBigInt(collections?.bankTransfer);
  const chequeBig = toSafeBigInt(collections?.cheque);
  const disbBig = toSafeBigInt(disbursementsTotal);
  const totalInflowsBig = cashBig + upiBig + bankBig + chequeBig;
  const netFlowBig = totalInflowsBig - disbBig;

  const chartData: CashPulseDatum[] = [
    {
      mode: t('modeCash'),
      amount: toChartPlotNumber(cashBig),
      exactAmount: cashBig,
      type: 'inflow',
      color: '#10b981', // emerald-500
    },
    {
      mode: t('modeUpi'),
      amount: toChartPlotNumber(upiBig),
      exactAmount: upiBig,
      type: 'inflow',
      color: '#3b82f6', // blue-500
    },
    {
      mode: t('modeBank'),
      amount: toChartPlotNumber(bankBig),
      exactAmount: bankBig,
      type: 'inflow',
      color: '#8b5cf6', // purple-500
    },
    {
      mode: t('modeCheque'),
      amount: toChartPlotNumber(chequeBig),
      exactAmount: chequeBig,
      type: 'inflow',
      color: '#f59e0b', // amber-500
    },
    {
      mode: t('todayDisbursements'),
      amount: toChartPlotNumber(disbBig),
      exactAmount: disbBig,
      type: 'outflow',
      color: '#f43f5e', // rose-500
    },
  ];

  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-sm flex flex-col justify-between">
      <CardHeader className="pb-3 border-b border-slate-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <CardTitle className="text-base font-semibold text-white">
                {t('cashPulseTitle')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-400 mt-1">
              {t('cashPulseSubtitle')}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant={netFlowBig >= 0n ? 'paid' : 'destructive'}
              className="font-mono text-xs gap-1 py-1"
            >
              {netFlowBig >= 0n ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <ArrowDownLeft className="h-3.5 w-3.5 text-rose-400" />
              )}
              <span>Net: {formatRupee(netFlowBig)}</span>
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 pb-2">
        {!isMounted || isLoading ? (
          <div className="h-64 w-full flex items-center justify-center">
            <div className="space-y-3 w-full">
              <div className="h-4 bg-slate-800 rounded animate-pulse w-3/4" />
              <div className="h-44 bg-slate-800/40 rounded animate-pulse" />
            </div>
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                  vertical={false}
                  opacity={0.5}
                />
                <XAxis
                  dataKey="mode"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                  tickFormatter={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return '₹0';
                    const abs = Math.abs(n);
                    const sign = n < 0 ? '-' : '';
                    if (abs >= 10000000) return `${sign}₹${Math.trunc(abs / 10000000)}Cr`;
                    if (abs >= 100000) return `${sign}₹${Math.trunc(abs / 100000)}L`;
                    if (abs >= 1000) return `${sign}₹${Math.trunc(abs / 1000)}k`;
                    return `${sign}₹${Math.trunc(abs)}`;
                  }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(51, 65, 85, 0.3)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as CashPulseDatum;
                      return (
                        <div className="rounded-lg border border-slate-700 bg-slate-900/95 p-2.5 shadow-xl backdrop-blur-md text-xs">
                          <p className="font-medium text-slate-200 mb-1">{item.mode}</p>
                          <p className="font-mono text-sm font-bold text-white">
                            {formatRupee(item.exactAmount)}
                          </p>
                          <span
                            className={`inline-block mt-1 text-[10px] uppercase font-semibold ${
                              item.type === 'inflow' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {item.type}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
