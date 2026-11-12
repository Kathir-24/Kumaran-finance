import * as React from 'react';
import { Loader2 } from 'lucide-react';

interface RouteSuspenseFallbackProps {
  label?: string;
}

/**
 * Shared App Router `<Suspense>` fallback for client pages reading `useSearchParams()`.
 */
export function RouteSuspenseFallback({ label }: RouteSuspenseFallbackProps) {
  return (
    <div className="flex h-96 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        {label ? <span className="text-xs text-slate-400">{label}</span> : null}
      </div>
    </div>
  );
}
