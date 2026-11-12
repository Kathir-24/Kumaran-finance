'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronDown,
  ChevronUp,
  Code2,
  AlertOctagon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  GUARDRAIL_DEFINITIONS,
  type GuardrailDefinition,
} from './guardrails-data';

export { GUARDRAIL_DEFINITIONS, type GuardrailDefinition };

interface RulesAccordionProps {
  activeRuleId?: string | null;
  searchQuery?: string;
}

export function RulesAccordion({ activeRuleId, searchQuery = '' }: RulesAccordionProps) {
  const t = useTranslations();
  const [expandedId, setExpandedId] = React.useState<string | null>(activeRuleId || 'rule-1');

  React.useEffect(() => {
    if (activeRuleId) {
      setExpandedId(activeRuleId);
      const element = document.getElementById(activeRuleId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeRuleId]);

  const filteredRules = React.useMemo(() => {
    if (!searchQuery.trim()) return GUARDRAIL_DEFINITIONS;
    const q = searchQuery.toLowerCase().trim();
    return GUARDRAIL_DEFINITIONS.filter((r) => {
      const title = t(r.titleKey).toLowerCase();
      const desc = t(r.descKey).toLowerCase();
      const cat = r.category.toLowerCase();
      return (
        title.includes(q) ||
        desc.includes(q) ||
        cat.includes(q) ||
        r.codeProof.toLowerCase().includes(q) ||
        r.ruleNumber.toString() === q
      );
    });
  }, [searchQuery, t]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (filteredRules.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400">
        <p className="text-sm">{t('instructions.noResults')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filteredRules.map((rule) => {
        const isExpanded = expandedId === rule.id;
        const title = t(rule.titleKey);
        const desc = t(rule.descKey);

        return (
          <Card
            key={rule.id}
            id={rule.id}
            className={`border transition-all duration-200 ${
              isExpanded
                ? 'border-emerald-500/40 bg-slate-900/90 shadow-md ring-1 ring-emerald-500/20'
                : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
            }`}
          >
            <div
              onClick={() => toggleExpand(rule.id)}
              className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-xs border ${
                    isExpanded
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-slate-700 bg-slate-800 text-slate-300'
                  }`}
                >
                  #{rule.ruleNumber}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">{title}</h3>
                    <Badge variant={rule.badgeVariant} className="text-[10px] py-0 px-1.5 shrink-0">
                      {rule.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{desc}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-400 shrink-0">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-emerald-400" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            </div>

            {isExpanded && (
              <CardContent className="pt-0 pb-4 px-4 border-t border-slate-800/80 mt-1 space-y-4 text-xs">
                {/* Description */}
                <p className="text-slate-300 leading-relaxed pt-3">{desc}</p>

                {/* Mathematical Formula if present */}
                {rule.formula && (
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/80 font-mono text-emerald-300 overflow-x-auto scrollbar-thin">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-1">
                      Mathematical Invariant:
                    </span>
                    <code className="text-xs whitespace-nowrap sm:whitespace-normal">{rule.formula}</code>
                  </div>
                )}

                {/* Bullet details */}
                <ul className="space-y-1.5 list-disc pl-4 text-slate-300">
                  {rule.details.map((detail, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {detail}
                    </li>
                  ))}
                </ul>

                {/* Code Enforcement Proof */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-slate-400 font-semibold text-[11px]">
                    <Code2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <span>{t('instructions.codeProofLabel')}</span>
                  </div>
                  <p className="font-mono text-[11px] text-slate-300 bg-slate-900/80 p-2 rounded border border-slate-800/80 overflow-x-auto break-all sm:break-normal">
                    {rule.codeProof}
                  </p>
                </div>

                {/* Violation Consequence */}
                <div className="rounded-lg border border-rose-500/20 bg-rose-950/10 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-rose-300 font-semibold text-[11px]">
                    <AlertOctagon className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    <span>{t('instructions.violationLabel')}</span>
                  </div>
                  <p className="text-[11px] text-rose-200/90 font-mono break-words">{rule.violationResponse}</p>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
