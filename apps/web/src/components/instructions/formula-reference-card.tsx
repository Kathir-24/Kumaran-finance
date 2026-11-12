'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  FileSpreadsheet,
  Scale,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function FormulaReferenceCard() {
  const t = useTranslations('instructions');

  const symbols = [
    {
      term: 'Chit Value (Gross Pool)',
      symbol: 'V',
      formula: 'V = I_{base} \\times N',
      explanation: 'Total pool amount for the chit group (e.g. ₹1,00,000, ₹2,00,000). Always whole Rupees.',
    },
    {
      term: 'Duration in Months',
      symbol: 'N',
      formula: 'N \\text{ months}',
      explanation: 'Total duration in months, typically 20 months.',
    },
    {
      term: 'Total Tickets / Members',
      symbol: 'M',
      formula: 'M = N \\text{ tickets}',
      explanation: 'Total subscribed tickets participating. Universal dividend is shared equally across all M tickets.',
    },
    {
      term: 'Base Monthly Installment',
      symbol: 'I_base',
      formula: 'I_{base} = \\frac{V}{N}',
      explanation: 'Gross monthly installment before dividend deduction (e.g. ₹5,000 for ₹1L/20M).',
    },
    {
      term: 'Foreman Commission Rate',
      symbol: 'r_f',
      formula: 'r_f = 4.00\\% = 0.04',
      explanation: 'Statutory commission retained by Kumaran Finance. Locked per scheme on creation.',
    },
    {
      term: 'Foreman Commission Amount',
      symbol: 'C_f',
      formula: 'C_f = V \\times 0.04',
      explanation: 'Company commission retained from auction discount pool (e.g. ₹4,000 for ₹1L).',
    },
    {
      term: 'Auction Bid Discount',
      symbol: 'D',
      formula: 'C_f \\le D \\le \\frac{V}{4}',
      explanation: 'Discount forgone by auction winner. Floor is 4% commission; Ceiling is strictly 1/4 (25%).',
    },
    {
      term: 'Total Member Dividend',
      symbol: 'Div_total',
      formula: 'Div_{total} = D - C_f',
      explanation: 'Net discount distributed to members after company commission deduction.',
    },
    {
      term: 'Dividend Per Ticket',
      symbol: 'Div_ticket',
      formula: 'Div_{ticket} = \\frac{Div_{total}}{M}',
      explanation: 'Equal dividend allocated to ALL members (including the auction winner & past winners).',
    },
    {
      term: 'Net Installment Due',
      symbol: 'I_net',
      formula: 'I_{net} = I_{base} - Div_{ticket}',
      explanation: 'Actual whole rupee amount payable by every subscriber in the group next month.',
    },
    {
      term: 'Winner Prize Money',
      symbol: 'P',
      formula: 'P = V - D',
      explanation: 'Prize payout amount disbursed to winning subscriber upon safety checklist sign-off.',
    },
  ];

  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
      <CardHeader className="pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-blue-400" />
          <CardTitle className="text-base font-semibold text-white">
            {t('formulasTitle')}
          </CardTitle>
        </div>
        <CardDescription className="text-xs text-slate-400 mt-1">
          {t('formulasSubtitle')}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 space-y-6">
        {/* Glossary Table */}
        <div className="overflow-x-auto scrollbar-thin rounded-lg border border-slate-800 bg-slate-950/60">
          <table className="w-full min-w-[680px] text-xs text-left text-slate-300">
            <thead className="text-[11px] uppercase bg-slate-900 border-b border-slate-800 text-slate-400">
              <tr>
                <th className="px-3 py-2.5 whitespace-nowrap">{t('colTerm')}</th>
                <th className="px-3 py-2.5 whitespace-nowrap">{t('colSymbol')}</th>
                <th className="px-3 py-2.5 whitespace-nowrap">{t('colFormula')}</th>
                <th className="px-3 py-2.5">{t('colMeaning')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {symbols.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-900/40">
                  <td className="px-3 py-2 font-medium text-white whitespace-nowrap">{item.term}</td>
                  <td className="px-3 py-2 font-mono text-emerald-400 font-bold whitespace-nowrap">{item.symbol}</td>
                  <td className="px-3 py-2 font-mono text-blue-300 whitespace-nowrap">{item.formula}</td>
                  <td className="px-3 py-2 text-slate-400 leading-relaxed min-w-[280px]">{item.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Walkthrough Example */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Scale className="h-4 w-4 text-emerald-400 shrink-0" />
              {t('walkthroughTitle')}
            </span>
            <Badge variant="paid" className="text-[10px] shrink-0">
              {t('walkthroughBadge')}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
            <div className="space-y-1.5 p-3 rounded-lg bg-slate-900/80 border border-slate-800">
              <h4 className="font-semibold text-emerald-400">{t('month1Title')}</h4>
              <p>• {t('month1Point1')}</p>
              <p>• {t('month1Point2')}</p>
              <p>• {t('month1Point3')}</p>
            </div>

            <div className="space-y-1.5 p-3 rounded-lg bg-slate-900/80 border border-slate-800">
              <h4 className="font-semibold text-blue-400">{t('month2Title')}</h4>
              <p>• {t('month2Point1')}</p>
              <p>• {t('month2Point2')}</p>
              <p>• {t('month2Point3')}</p>
              <p>• {t('month2Point4')}</p>
              <p>• {t('month2Point5')}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
