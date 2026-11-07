'use client';

// ==============================================================================
// Kumaran Chits — Dashboard Layout Error Boundary & ChunkLoadError Recovery
// Catches client-side errors in dashboard views and automatically resolves
// post-deployment version skew (ChunkLoadError) via throttled hard reload.
// ==============================================================================

import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isChunkError, setIsChunkError] = useState(false);

  useEffect(() => {
    console.error('[Dashboard Error Boundary Caught]', error);

    // Detect post-deployment version mismatch where browser references purged JS chunks
    const message = error?.message || '';
    const name = error?.name || '';
    const isChunkMismatch =
      name === 'ChunkLoadError' ||
      message.includes('Loading chunk') ||
      message.includes('failed to load script') ||
      message.includes('Failed to fetch dynamically imported module');

    if (isChunkMismatch) {
      setIsChunkError(true);
      const lastReload = sessionStorage.getItem('kc_last_chunk_reload');
      const now = Date.now();

      // Throttle automatic reload to once per 10 seconds to eliminate infinite reload loops
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem('kc_last_chunk_reload', now.toString());
        console.warn('[Post-Deployment Version Skew] New version detected; reloading bundle...');
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 mb-4 border border-rose-500/20">
        <AlertTriangle className="h-7 w-7" />
      </div>

      <h2 className="text-lg font-bold text-slate-100">
        {isChunkError ? 'Application Updated / புதிய பதிப்பு கிடைக்கிறது' : 'Operation Encountered an Error'}
      </h2>

      <p className="mt-1 max-w-md text-xs text-slate-400 leading-relaxed">
        {isChunkError
          ? 'A new version of Kumaran Chits was deployed. Please refresh to load the latest system updates.'
          : error?.message || 'An unexpected client error occurred while loading this view.'}
      </p>

      <div className="mt-6 flex items-center gap-3">
        {isChunkError ? (
          <Button
            size="sm"
            onClick={() => window.location.reload()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Reload Latest Version / புதுப்பி
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => reset()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Retry View / மீண்டும் முயற்சி
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            window.location.href = '/';
          }}
          className="border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
        >
          <Home className="mr-1.5 h-3.5 w-3.5" />
          Back to Dashboard / முகப்பு
        </Button>
      </div>
    </div>
  );
}
