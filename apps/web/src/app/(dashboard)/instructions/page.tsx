'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  BookCheck,
  ShieldCheck,
  Calculator,
  Briefcase,
  Scale,
  Search,
  X,
  FileText,
  Clock,
  Landmark,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RulesAccordion } from '@/components/instructions/rules-accordion';
import { CalculatorSimulator } from '@/components/instructions/calculator-simulator';
import { FormulaReferenceCard } from '@/components/instructions/formula-reference-card';
import { SopGuideCard } from '@/components/instructions/sop-guide-card';

export default function InstructionsPage() {
  const t = useTranslations('instructions');
  const searchParams = useSearchParams();

  const ruleParam = searchParams.get('rule');
  const initialRuleId = ruleParam ? `rule-${ruleParam}` : null;

  const [activeTab, setActiveTab] = React.useState<string>(
    initialRuleId ? 'guardrails' : 'guardrails',
  );
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  React.useEffect(() => {
    if (ruleParam) {
      setActiveTab('guardrails');
    }
  }, [ruleParam]);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 mb-1">
            <BookCheck className="h-4 w-4 shrink-0" />
            <span>{t('staffGuideBadge')}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {t('pageTitle')}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            {t('pageSubtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="paid" className="gap-1.5 py-1">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>{t('guardrailsBadge')}</span>
          </Badge>
          <Badge variant="neutral" className="py-1">
            {t('actBadge')}
          </Badge>
        </div>
      </div>

      {/* 2. Interactive Search Bar */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <Input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-8 bg-slate-900/80 border-slate-800 text-xs text-white placeholder:text-slate-500 rounded-lg focus-visible:ring-emerald-400"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* 3. Segmented Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="overflow-x-auto scrollbar-none pb-1">
          <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-xl inline-flex w-max min-w-full justify-start h-auto gap-1">
            <TabsTrigger
              value="guardrails"
              className="text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 gap-1.5 py-2 px-3.5 shrink-0 whitespace-nowrap"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>{t('tabs.guardrails')}</span>
            </TabsTrigger>

            <TabsTrigger
              value="formulas"
              className="text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 gap-1.5 py-2 px-3.5 shrink-0 whitespace-nowrap"
            >
              <Calculator className="h-3.5 w-3.5 shrink-0" />
              <span>{t('tabs.formulas')}</span>
            </TabsTrigger>

            <TabsTrigger
              value="sops"
              className="text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 gap-1.5 py-2 px-3.5 shrink-0 whitespace-nowrap"
            >
              <Briefcase className="h-3.5 w-3.5 shrink-0" />
              <span>{t('tabs.sops')}</span>
            </TabsTrigger>

            <TabsTrigger
              value="statutory"
              className="text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 gap-1.5 py-2 px-3.5 shrink-0 whitespace-nowrap"
            >
              <Scale className="h-3.5 w-3.5 shrink-0" />
              <span>{t('tabs.statutory')}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: The 10 Invariant Guardrails */}
        <TabsContent value="guardrails" className="space-y-4">
          <div className="flex items-center justify-between pb-1">
            <div>
              <h2 className="text-sm font-semibold text-white">
                {t('tabs.guardrails')}
              </h2>
              <p className="text-xs text-slate-400">{t('guardrailsSubtitle')}</p>
            </div>
            <Badge variant="outline" className="border-slate-700 text-slate-400 text-[11px]">
              CONFIRMED-BY-DEVELOPER
            </Badge>
          </div>

          <RulesAccordion
            activeRuleId={initialRuleId}
            searchQuery={searchQuery}
          />
        </TabsContent>

        {/* Tab 2: Financial Formulas & Simulator */}
        <TabsContent value="formulas" className="space-y-6">
          <CalculatorSimulator />
          <FormulaReferenceCard />
        </TabsContent>

        {/* Tab 3: Staff Operating SOPs */}
        <TabsContent value="sops" className="space-y-4">
          <div className="pb-1">
            <h2 className="text-sm font-semibold text-white">
              {t('tabs.sops')}
            </h2>
            <p className="text-xs text-slate-400">
              {t('sopsSubtitle')}
            </p>
          </div>

          <SopGuideCard />
        </TabsContent>

        {/* Tab 4: Statutory Compliance */}
        <TabsContent value="statutory" className="space-y-4">
          <div className="pb-1">
            <h2 className="text-sm font-semibold text-white">
              {t('statutoryTitle')}
            </h2>
            <p className="text-xs text-slate-400">{t('statutorySubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-400" />
                  <CardTitle className="text-sm font-semibold text-white">
                    {t('formXviiTitle')}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs text-slate-300">
                <p className="leading-relaxed">{t('formXviiDesc')}</p>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1 font-mono text-[11px]">
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                    {t('limit21Days')}
                  </span>
                  <Badge variant="paid" className="text-[10px]">
                    Sec. 17
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <BookCheck className="h-4 w-4 text-emerald-400" />
                  <CardTitle className="text-sm font-semibold text-white">
                    {t('formXxiTitle')}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs text-slate-300">
                <p className="leading-relaxed">{t('formXxiDesc')}</p>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-slate-400">
                  <span className="font-mono text-[11px]">{t('continuousLedger')}</span>
                  <Badge variant="paid" className="text-[10px]">
                    Sec. 23
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-purple-400" />
                  <CardTitle className="text-sm font-semibold text-white">
                    {t('formXxiiTitle')}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs text-slate-300">
                <p className="leading-relaxed">{t('formXxiiDesc')}</p>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-slate-400">
                  <span className="font-mono text-[11px]">{t('dailyVaultSafe')}</span>
                  <Badge variant="paid" className="text-[10px]">
                    Sec. 24
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
