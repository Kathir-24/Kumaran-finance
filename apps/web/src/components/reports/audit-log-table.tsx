'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  UserCheck,
  FileJson,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from 'lucide-react';

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  ipAddress: string | null;
  performedBy: {
    id: string;
    name: string;
    roles: string[];
  } | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}

interface AuditLogTableProps {
  logs: AuditLogItem[];
  page: number;
  totalPages: number;
  totalRecords: number;
  onPageChange: (newPage: number) => void;
  onInspectDiff: (log: AuditLogItem) => void;
  isLoading?: boolean;
}

export function AuditLogTable({
  logs,
  page,
  totalPages,
  totalRecords,
  onPageChange,
  onInspectDiff,
  isLoading = false,
}: AuditLogTableProps) {
  const t = useTranslations('reports.auditTrail');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const isDualControlAction = (action: string): boolean => {
    return [
      'AUCTION_FINALIZED',
      'PAYMENT_REVERSED',
      'PAYMENT_REVERSAL_REJECTED',
      'CASH_HANDOVER_ACKNOWLEDGED',
      'PRIZE_PAYOUT_AUTHORIZED',
      'SAFETY_PROOF_VERIFIED',
      'UPI_CLAIM_VERIFIED',
    ].includes(action);
  };

  const getActionBadgeColor = (action: string): string => {
    if (action.includes('REVERSED') || action.includes('REJECTED') || action.includes('DELETED')) {
      return 'border-rose-500/30 bg-rose-500/10 text-rose-400';
    }
    if (action.includes('FINALIZED') || action.includes('AUTHORIZED') || action.includes('ACKNOWLEDGED')) {
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    }
    if (action.includes('REQUESTED') || action.includes('FILED') || action.includes('DRAWN')) {
      return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
    }
    if (action.includes('DISBURSED') || action.includes('SETTLED') || action.includes('SETTLEMENT')) {
      return 'border-blue-500/30 bg-blue-500/10 text-blue-400';
    }
    return 'border-slate-700 bg-slate-800 text-slate-300';
  };

  const formatTimestamp = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return iso;
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mb-3" />
        <p className="text-xs text-slate-400">Loading audit trail records...</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-400 mx-auto mb-3">
          <Inbox className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-slate-200">{t('noLogs')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[820px] text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <th className="py-3 px-4 font-semibold whitespace-nowrap">{t('colTimestamp')}</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">{t('colAction')}</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">{t('colEntity')}</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">{t('colActor')}</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">{t('colIpAddress')}</th>
                <th className="py-3 px-4 font-semibold text-right whitespace-nowrap">{t('colDiff')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {logs.map((log) => {
                const isDual = isDualControlAction(log.action);
                const hasDiff =
                  (log.oldValue && Object.keys(log.oldValue).length > 0) ||
                  (log.newValue && Object.keys(log.newValue).length > 0);

                return (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    {/* Timestamp */}
                    <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                      {formatTimestamp(log.timestamp)}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`font-mono text-[11px] ${getActionBadgeColor(log.action)}`}
                        >
                          {log.action}
                        </Badge>
                        {isDual && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] flex items-center gap-1"
                          >
                            <UserCheck className="h-3 w-3" />
                            <span>{t('dualControlBadge')}</span>
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Entity */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-200">{log.entityType}</span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          {log.entityId.slice(0, 8)}...
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyId(log.entityId)}
                          className="h-5 w-5 p-0 text-slate-400 hover:text-white"
                          title="Copy Full UUID"
                        >
                          {copiedId === log.entityId ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </td>

                    {/* Performed By */}
                    <td className="py-3 px-4">
                      {log.performedBy ? (
                        <div className="space-y-0.5">
                          <div className="font-medium text-slate-200">{log.performedBy.name}</div>
                          <div className="flex gap-1 flex-wrap">
                            {log.performedBy.roles.map((r) => (
                              <Badge
                                key={r}
                                variant="outline"
                                className="border-slate-700 bg-slate-800 text-[10px] text-slate-400 py-0"
                              >
                                {r.replace('_', ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic font-mono text-[11px]">
                          {t('systemActor')}
                        </span>
                      )}
                    </td>

                    {/* IP Address */}
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                      {log.ipAddress || '127.0.0.1 (Local)'}
                    </td>

                    {/* Diff Trigger */}
                    <td className="py-3 px-4 text-right">
                      {hasDiff ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onInspectDiff(log)}
                          className="h-7 text-xs border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700 hover:text-white px-2.5"
                        >
                          <FileJson className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                          {t('inspectDiff')}
                        </Button>
                      ) : (
                        <span className="text-slate-400 font-mono">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 text-xs text-slate-400 print:hidden">
        <div>
          {t('pagination', {
            page: String(page),
            pages: String(totalPages || 1),
            total: String(totalRecords),
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="h-8 border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <span className="px-2 font-mono text-slate-200">
            {page} / {totalPages || 1}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="h-8 border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
