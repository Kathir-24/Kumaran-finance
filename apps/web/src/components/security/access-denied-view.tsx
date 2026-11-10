'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AccessDeniedViewProps {
  requiredRoles: string[];
  userRoles?: string[];
}

export function AccessDeniedView({
  requiredRoles,
  userRoles = [],
}: AccessDeniedViewProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 text-center">
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-rose-500/30 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight text-white font-sans">
            Access Restricted — போதுமான அனுமதியில்லை
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your current staff role does not have operational permissions to access this workstation.
            இப்பக்கத்தை அணுக உங்கள் பணியாளர் பதவிக்கு அனுமதி இல்லை.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-left text-xs space-y-1.5 font-mono">
          <div className="flex items-center justify-between text-slate-400">
            <span>Required Role(s):</span>
            <span className="font-semibold text-amber-300">{requiredRoles.join(', ')}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Your Active Role(s):</span>
            <span className="font-semibold text-rose-300">
              {userRoles.length > 0 ? userRoles.join(', ') : 'None'}
            </span>
          </div>
        </div>

        <div className="pt-2">
          <Button
            asChild
            size="sm"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md"
          >
            <Link href="/" className="flex items-center justify-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              <span>Return to Dashboard — முதன்மைப் பக்கம்</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
