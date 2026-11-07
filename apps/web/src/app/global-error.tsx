'use client';

// ==============================================================================
// Kumaran Chits — Root Global Error Boundary (Next.js 15)
// Catches fatal errors occurring in root layout or top-level providers.
// Guarantees graceful error recovery instead of a blank white screen.
// ==============================================================================

import { useEffect, useState } from 'react';
import { reportClientError, type IncidentReport } from '@/lib/error-reporter';

export default function GlobalError({
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
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 antialiased font-sans">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900/90 p-6 text-center shadow-2xl backdrop-blur-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 mb-4 border border-rose-500/20">
            <svg
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-white">System Error / கணினி பிழை</h1>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            {error?.message ||
              'A critical application error occurred. Please reload the application or contact Kumaran Finance IT Operations.'}
          </p>

          {incident && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="font-mono text-[11px] text-slate-400 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-md">
                Ref: {incident.incidentId}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium underline"
              >
                {copied ? 'Copied / நகலெடுக்கப்பட்டது' : 'Copy / நகலெடு'}
              </button>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
            >
              Retry Application / மீண்டும் முயற்சி
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
            >
              Back to Home / முகப்பு
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
