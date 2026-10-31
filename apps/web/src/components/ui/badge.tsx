import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2',
  {
    variants: {
      variant: {
        paid: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        unpaid: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        overdue: 'border-rose-500/30 bg-rose-500/10 text-rose-400 font-bold',
        destructive: 'border-rose-500/50 bg-rose-500/20 text-rose-300 font-bold',
        pending: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
        neutral: 'border-slate-700 bg-slate-800/60 text-slate-300',
        outline: 'border-slate-700 text-slate-300',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
