'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ShieldCheck, ChevronDown, ChevronUp, ExternalLink, HelpCircle } from 'lucide-react';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { cn } from '@/lib/utils';

export interface BusinessRuleBannerProps {
  ruleNumber: number;
  title: string;
  description: string;
  bulletPoints?: string[];
  referencePath?: string;
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * Reusable in-page banner embedded at the top of operational screens.
 * Contextualizes chit fund rules (e.g. 1/4 ceiling, 4% commission, single discrete payment)
 * directly in staff workflow with links to full instructions.
 */
export function BusinessRuleBanner({
  ruleNumber,
  title,
  description,
  bulletPoints = [],
  referencePath = '/instructions',
  defaultExpanded = true,
  className,
}: BusinessRuleBannerProps) {
  const t = useTranslations('rules');
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  return (
    <div
      className={cn(
        'rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 text-slate-100 shadow-sm backdrop-blur-sm transition-all',
        className
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0 mt-0.5 sm:mt-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-300 border border-indigo-500/30 uppercase tracking-wide">
                {t('bannerTitle')} #{ruleNumber}
              </span>
            </div>
            <h4 className="text-sm font-semibold text-slate-100 mt-0.5 break-words leading-snug">{title}</h4>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-indigo-500/10 shrink-0">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-xs text-indigo-300 hover:text-indigo-200 hover:bg-indigo-900/40 gap-1.5 h-8 px-2.5"
          >
            <Link href={referencePath}>
              <span>{t('readFullInstructions')}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8 text-slate-400 hover:text-slate-200 shrink-0"
            aria-label={isExpanded ? 'Collapse rule' : 'Expand rule'}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-indigo-500/20 text-xs text-slate-300 space-y-2">
          <p className="leading-relaxed">{description}</p>
          {bulletPoints.length > 0 && (
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              {bulletPoints.map((point, index) => (
                <li key={index} className="leading-relaxed">
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export interface RuleTooltipProps {
  content: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Inline question mark icon (?) that reveals on-hover rule explanations.
 */
export function RuleTooltip({ content, children, className }: RuleTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex items-center gap-1 cursor-help text-slate-400 hover:text-slate-200', className)}>
            {children}
            <HelpCircle className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 border-indigo-500/40 text-slate-200 p-2.5 shadow-xl max-w-xs text-xs">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
