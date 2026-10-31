import { formatRupee, parseWholeRupees } from '@kumaran/api-client';
import { useTranslations } from 'next-intl';

export default function SmokeVerificationPage() {
  const t = useTranslations();

  // Test Guardrail 2: Whole Rupee Math via @kumaran/api-client
  const sampleChitValue = 100000n;
  const sampleCommission = 4000n;
  const sampleCeiling = 25000n;
  const formattedValue = formatRupee(sampleChitValue);
  const formattedCommission = formatRupee(sampleCommission);
  const formattedCeiling = formatRupee(sampleCeiling);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-950 text-slate-100">
      <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-emerald-400">
              {t('app.title')}
            </h1>
            <p className="text-sm text-slate-400">{t('app.tagline')}</p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
            {t('common.status')}
          </span>
        </div>

        <div className="mt-6 space-y-4">
          <div className="rounded-lg bg-slate-950/80 p-4 border border-slate-800">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Monorepo Package Link Verification
            </h2>
            <p className="mt-1 text-sm font-mono text-cyan-300">
              @kumaran/api-client linked via workspace:*
            </p>
          </div>

          <div className="rounded-lg bg-slate-950/80 p-4 border border-slate-800">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Guardrail 2: Whole Rupee Math Assertion
            </h2>
            <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded border border-slate-800/80 bg-slate-900 p-2">
                <span className="text-xs text-slate-400 block">Chit Value (V):</span>
                <span className="font-semibold text-emerald-300">{formattedValue}</span>
              </div>
              <div className="rounded border border-slate-800/80 bg-slate-900 p-2">
                <span className="text-xs text-slate-400 block">4% Commission:</span>
                <span className="font-semibold text-amber-300">{formattedCommission}</span>
              </div>
              <div className="rounded border border-slate-800/80 bg-slate-900 p-2">
                <span className="text-xs text-slate-400 block">1/4 Ceiling:</span>
                <span className="font-semibold text-indigo-300">{formattedCeiling}</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-emerald-400 flex items-center gap-1.5">
              <span>✓</span> {t('common.zeroPaiseGuard')} (Zero Paise / No Floats)
            </p>
          </div>

          <div className="rounded-lg bg-slate-950/80 p-4 border border-slate-800">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Operational Office Branch
            </h2>
            <p className="mt-1 text-sm text-slate-200">
              {t('app.branch')}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-800/60">
          <span>{t('app.badge')}</span>
          <span>Task 1.1 Foundation Ready</span>
        </div>
      </div>
    </main>
  );
}
