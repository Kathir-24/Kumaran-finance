'use client';

// ==============================================================================
// Kumaran Chits — Root Segment Error Boundary (Next.js 15)
// Catches client-side errors in non-dashboard route segments (auth, print, etc.)
// ==============================================================================

import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, Home, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportClientError, type IncidentReport } from '@/lib/error-reporter';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [incident, setIncident] = useState<IncidentReport | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const report = reportClientError(error);
    setIncident(report);
  }, [error]);

  const handleCopy = () => {
    if (incident && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(incident.copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 mb-4 border border-rose-500/20">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-bold text-slate-100">Operation Encountered an Error / பிழை நேரிட்டது</h2>
      <p className="mt-1 max-w-md text-xs text-slate-400">
        {error?.message || 'An unexpected client error occurred while loading this section.'}
      </p>

      {incident && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="font-mono text-[11px] text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md">
            Reference: {incident.incidentId}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied / நகலெடுக்கப்பட்டது' : 'Copy / நகலெடு'}
          </button>
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => reset()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Retry View / மீண்டும் முயற்சி
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
          Back to Dashboard / முகப்பு
        </Button>
      </div>
    </div>
  );
}
