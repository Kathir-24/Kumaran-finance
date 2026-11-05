'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, FileJson } from 'lucide-react';

interface AuditDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}

export function AuditDiffModal({
  isOpen,
  onClose,
  action,
  entityType,
  entityId,
  timestamp,
  oldValue,
  newValue,
}: AuditDiffModalProps) {
  const t = useTranslations('reports.auditTrail');
  const [copiedOld, setCopiedOld] = useState(false);
  const [copiedNew, setCopiedNew] = useState(false);

  const formatJson = (val: Record<string, unknown> | null): string => {
    if (!val || Object.keys(val).length === 0) return 'null';
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  };

  const handleCopy = async (val: Record<string, unknown> | null, type: 'old' | 'new') => {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(val, null, 2));
      if (type === 'old') {
        setCopiedOld(true);
        setTimeout(() => setCopiedOld(false), 2000);
      } else {
        setCopiedNew(true);
        setTimeout(() => setCopiedNew(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  const hasOld = oldValue !== null && Object.keys(oldValue).length > 0;
  const hasNew = newValue !== null && Object.keys(newValue).length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-slate-900 border-slate-800 text-slate-100 max-h-[85vh] flex flex-col">
        <DialogHeader className="border-b border-slate-800 pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-emerald-400" />
              <DialogTitle className="text-base font-semibold text-white">
                {t('diffModalTitle')}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-slate-700 bg-slate-800 text-xs font-mono">
                {entityType}
              </Badge>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-mono">
                {action}
              </Badge>
            </div>
          </div>
          <DialogDescription className="text-xs text-slate-400 mt-1">
            {t('diffModalDesc')} • <span className="font-mono text-slate-300">{entityId}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {!hasOld && !hasNew ? (
            <div className="p-6 text-center text-xs text-slate-400 rounded-lg border border-slate-800 bg-slate-950">
              {t('noChanges')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pre-Mutation State (Before) */}
              <div className="flex flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    {t('oldState')}
                  </span>
                  {hasOld && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(oldValue, 'old')}
                      className="h-7 text-[11px] text-slate-400 hover:text-white hover:bg-slate-800 px-2"
                    >
                      {copiedOld ? (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                          {t('copied')}
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          {t('copyJson')}
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <pre className="flex-1 p-3 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre leading-relaxed min-h-[160px] max-h-[300px]">
                  {formatJson(oldValue)}
                </pre>
              </div>

              {/* Post-Mutation State (After) */}
              <div className="flex flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {t('newState')}
                  </span>
                  {hasNew && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(newValue, 'new')}
                      className="h-7 text-[11px] text-slate-400 hover:text-white hover:bg-slate-800 px-2"
                    >
                      {copiedNew ? (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                          {t('copied')}
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          {t('copyJson')}
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <pre className="flex-1 p-3 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre leading-relaxed min-h-[160px] max-h-[300px]">
                  {formatJson(newValue)}
                </pre>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-800 pt-3 flex items-center justify-between sm:justify-between">
          <div className="text-[11px] text-slate-400 font-mono">
            {timestamp ? new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-slate-800 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white text-xs h-8"
          >
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
