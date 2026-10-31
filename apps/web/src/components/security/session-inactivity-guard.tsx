'use client';

// ==============================================================================
// Kumaran Chits — 20-Minute Session Inactivity Guardian
// Enforces Section 7 of frontend-architecture.md with 18m warning & 20m auto-logout.
// ==============================================================================

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert, Clock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface SessionInactivityGuardProps {
  /** Total inactivity duration before auto-logout (default: 20 minutes = 1,200,000 ms) */
  timeoutMs?: number;
  /** Inactivity duration before warning dialog opens (default: 18 minutes = 1,080,000 ms) */
  warningMs?: number;
  /** Frequency of tick checks (default: 1,000 ms = 1 second) */
  checkIntervalMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
const DEFAULT_WARNING_MS = 18 * 60 * 1000; // 18 minutes
const DEFAULT_CHECK_INTERVAL_MS = 1000; // 1 second

export function SessionInactivityGuard({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  warningMs = DEFAULT_WARNING_MS,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
}: SessionInactivityGuardProps) {
  const t = useTranslations('auth');
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const recordActivity = useAuthStore((state) => state.recordActivity);

  const [isWarningOpen, setIsWarningOpen] = React.useState(false);
  const [secondsRemaining, setSecondsRemaining] = React.useState(120);

  const lastActivityRef = React.useRef<number>(Date.now());
  const lastThrottleRef = React.useRef<number>(0);

  // Automatically hydrate authentication session on initial client boot
  React.useEffect(() => {
    void useAuthStore.getState().hydrate();
  }, []);

  // Resets inactivity timer when user acts
  const handleResetTimer = React.useCallback(() => {
    lastActivityRef.current = Date.now();
    recordActivity();
    if (isWarningOpen) {
      setIsWarningOpen(false);
    }
  }, [isWarningOpen, recordActivity]);

  // Throttled activity listener for keyboard & mouse interactions
  const handleUserActivity = React.useCallback(() => {
    const now = Date.now();
    if (now - lastThrottleRef.current > 500) {
      lastThrottleRef.current = now;
      handleResetTimer();
    }
  }, [handleResetTimer]);

  // Mount activity listeners when user is authenticated
  React.useEffect(() => {
    if (!isAuthenticated) return;

    lastActivityRef.current = Date.now();
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;

    events.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const idleMs = now - lastActivityRef.current;

      if (idleMs >= timeoutMs) {
        setIsWarningOpen(false);
        void logout('timeout');
      } else if (idleMs >= warningMs) {
        setIsWarningOpen(true);
        const remaining = Math.max(0, Math.ceil((timeoutMs - idleMs) / 1000));
        setSecondsRemaining(remaining);
      } else {
        setIsWarningOpen(false);
      }
    }, checkIntervalMs);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, timeoutMs, warningMs, checkIntervalMs, handleUserActivity, logout]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Dialog open={isWarningOpen} onOpenChange={(open) => !open && handleResetTimer()}>
      <DialogContent
        className="max-w-md border-amber-500/40 bg-slate-900 p-6 shadow-2xl"
        data-testid="inactivity-warning-modal"
      >
        <DialogHeader className="space-y-3">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-100">
              {t('inactivityWarning')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-slate-300">
            {t('inactivityMessage')}
          </DialogDescription>
        </DialogHeader>

        {/* Live Countdown Badge */}
        <div className="my-2 flex items-center justify-center space-x-2 rounded-lg border border-amber-500/30 bg-amber-950/30 py-3 text-amber-300">
          <Clock className="h-5 w-5 animate-pulse text-amber-400" />
          <span className="font-mono text-lg font-bold">
            {Math.floor(secondsRemaining / 60)}:
            {(secondsRemaining % 60).toString().padStart(2, '0')}
          </span>
          <span className="text-xs uppercase tracking-wider text-amber-400/80">
            seconds remaining
          </span>
        </div>

        <DialogFooter className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="border-slate-700 hover:bg-slate-800"
            onClick={() => void logout('manual')}
          >
            {t('logout')}
          </Button>
          <Button
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-500"
            onClick={handleResetTimer}
          >
            {t('extendSession')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
