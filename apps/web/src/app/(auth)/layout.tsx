// ==============================================================================
// Kumaran Chits — Auth Shell Layout (High-Density Workstation Shell)
// Single-Company tenancy, Perundurai Head Office branding & bilingual locale switch.
// ==============================================================================

import * as React from 'react';
import { ShieldCheck, Building2 } from 'lucide-react';
import { LocaleSwitcher } from '@/components/ui/locale-switcher';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-950 text-slate-100">
      {/* Top Header Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center space-x-3">
            {/* Monogram Badge */}
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-950/60 font-mono text-base font-bold text-emerald-400 shadow-inner">
              KC
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold tracking-tight text-slate-100">Kumaran Chits</span>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Head Office
                </span>
              </div>
              <p className="flex items-center text-xs text-slate-400">
                <Building2 className="mr-1 h-3 w-3 text-slate-500" />
                Kumaran Finance — Perundurai, Erode
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      {/* Statutory Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-3 text-center text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1 px-4 sm:flex-row sm:px-6">
          <p className="flex items-center">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
            Regulated by Tamil Nadu Chit Funds Act & Central Chit Funds Act 1982
          </p>
          <p className="font-mono text-[11px] text-slate-400">
            Perundurai HO Workstation • v1.0.0
          </p>
        </div>
      </footer>
    </div>
  );
}
