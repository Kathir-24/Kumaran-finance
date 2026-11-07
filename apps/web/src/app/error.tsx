'use client';

// ==============================================================================
// Kumaran Chits — Root Segment Error Boundary (Next.js 15)
// Catches client-side errors in non-dashboard route segments (auth, print, etc.)
// ==============================================================================

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Root Error Boundary Caught]', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 mb-4 border border-rose-500/20">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-bold text-slate-100">Operation Encountered an Error</h2>
      <p className="mt-1 max-w-md text-xs text-slate-400">
        {error?.message || 'An unexpected client error occurred while loading this section.'}
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => reset()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Retry View
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            window.location.href = '/';
          }}
          className="border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
        >
          <Home className="mr-1.5 h-3.5 w-3.5" />
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
