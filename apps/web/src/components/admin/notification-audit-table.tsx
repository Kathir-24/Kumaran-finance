'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Bell,
  CheckCircle2,
  Info,
  MessageSquare,
  Search,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface NotificationLogItemDto {
  id: string;
  type: string;
  recipient: string;
  title: string;
  body: string;
  status: string;
  sentAt: string | Date;
}

interface NotificationAuditTableProps {
  logs: NotificationLogItemDto[];
  isLoading: boolean;
  limit: number;
  onLimitChange: (limit: number) => void;
  onRefresh: () => void;
}

export function NotificationAuditTable({
  logs,
  isLoading,
  limit,
  onLimitChange,
  onRefresh: _onRefresh,
}: NotificationAuditTableProps) {
  const t = useTranslations('jobs');

  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedChannel, setSelectedChannel] = React.useState<'ALL' | 'PUSH' | 'SMS'>('ALL');

  const formatSentAt = (sentAt: string | Date) => {
    try {
      const d = typeof sentAt === 'string' ? new Date(sentAt) : sentAt;
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return '—';
    }
  };

  const filteredLogs = React.useMemo(() => {
    return logs.filter((log) => {
      // Channel match
      if (selectedChannel !== 'ALL') {
        const typeMatch = (log.type || '').toUpperCase() === selectedChannel;
        if (!typeMatch) return false;
      }
      // Search query match
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const recipientMatch = (log.recipient || '').toLowerCase().includes(query);
        const titleMatch = (log.title || '').toLowerCase().includes(query);
        const bodyMatch = (log.body || '').toLowerCase().includes(query);
        return recipientMatch || titleMatch || bodyMatch;
      }
      return true;
    });
  }, [logs, selectedChannel, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Educational Banner: Cost Hierarchy */}
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 text-xs text-indigo-300 flex items-start gap-3">
        <Info className="h-5 w-5 shrink-0 text-indigo-400 mt-0.5" />
        <div>
          <strong className="font-semibold block text-slate-100">
            {t('audit.costBannerTitle')}
          </strong>
          <p className="text-slate-300/90 mt-0.5">{t('audit.costBannerDesc')}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-slate-800 bg-slate-900/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Bell className="h-5 w-5 text-emerald-400 shrink-0" />
                {t('audit.title')}
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-0.5">
                {t('audit.desc')}
              </CardDescription>
            </div>

            {/* Limit Selector */}
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <span className="text-xs text-slate-400">{t('audit.limitLabel')}:</span>
              {[25, 50, 100].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => onLimitChange(l)}
                  className={cn(
                    'rounded px-2 py-1 text-xs font-mono transition-colors',
                    limit === l
                      ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3">
            {/* Search Box */}
            <div className="relative flex-1 w-full sm:w-auto">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                type="text"
                placeholder={t('audit.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-950 border-slate-800 text-slate-200 text-xs h-9"
              />
            </div>

            {/* Channel Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              <Button
                type="button"
                variant={selectedChannel === 'ALL' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedChannel('ALL')}
                className={cn(
                  'h-8 text-xs shrink-0 whitespace-nowrap',
                  selectedChannel === 'ALL'
                    ? 'bg-slate-800 text-white'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                )}
              >
                {t('audit.filterAll')}
              </Button>
              <Button
                type="button"
                variant={selectedChannel === 'PUSH' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedChannel('PUSH')}
                className={cn(
                  'h-8 text-xs gap-1 shrink-0 whitespace-nowrap',
                  selectedChannel === 'PUSH'
                    ? 'bg-emerald-600 text-slate-950 font-semibold'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                )}
              >
                <Smartphone className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                {t('audit.filterPush')}
              </Button>
              <Button
                type="button"
                variant={selectedChannel === 'SMS' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedChannel('SMS')}
                className={cn(
                  'h-8 text-xs gap-1 shrink-0 whitespace-nowrap',
                  selectedChannel === 'SMS'
                    ? 'bg-amber-600 text-slate-950 font-semibold'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                {t('audit.filterSms')}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading && logs.length === 0 ? (
            <div className="h-44 rounded-lg bg-slate-950/40 animate-pulse" />
          ) : filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              <Bell className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              {t('audit.noLogs')}
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin rounded-lg border border-slate-800">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('audit.sentAt')}</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('audit.channel')}</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('audit.recipient')}</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('audit.titleCol')}</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('audit.bodyCol')}</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('audit.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredLogs.map((log) => {
                    const isPush = (log.type || '').toUpperCase() === 'PUSH';
                    const isSent = (log.status || '').toUpperCase() === 'SENT';

                    return (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 text-slate-300 font-mono whitespace-nowrap">
                          {formatSentAt(log.sentAt)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] font-mono px-1.5 py-0.5 border',
                              isPush
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                            )}
                          >
                            {isPush ? 'PUSH (FCM)' : 'SMS (DLT)'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-200 whitespace-nowrap">
                          {log.recipient}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-100 max-w-[180px] truncate">
                          {log.title}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 max-w-[280px] truncate">
                          {log.body}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-[11px] font-semibold',
                              isSent ? 'text-emerald-400' : 'text-rose-400'
                            )}
                          >
                            {isSent ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}
                            {isSent ? t('audit.sent') : t('audit.failed')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
