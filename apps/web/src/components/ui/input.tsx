import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  prefixSymbol?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, prefixSymbol, ...props }, ref) => {
    if (prefixSymbol) {
      return (
        <div className="relative flex items-center">
          <span className="absolute left-3 text-slate-400 select-none text-sm font-semibold">
            {prefixSymbol}
          </span>
          <input
            type={type}
            className={cn(
              'flex h-10 w-full rounded-lg border bg-slate-900/80 px-3 py-2 pl-8 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
              error ? 'border-rose-500 focus-visible:ring-rose-500' : 'border-slate-800',
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
      );
    }

    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-lg border bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-rose-500 focus-visible:ring-rose-500' : 'border-slate-800',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
