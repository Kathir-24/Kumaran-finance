'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, ShieldAlert, UserX } from 'lucide-react';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { UserSummary } from './edit-roles-dialog';

export function ToggleStatusDialog({
  user,
  open,
  onOpenChange,
  currentUserId,
}: {
  user: UserSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId?: string;
}) {
  const t = useTranslations('users');
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const isSelf = Boolean(user && currentUserId && user.id === currentUserId);
  const nextActive = user ? !user.isActive : false;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      return unwrapApiResponse(
        apiClient.PATCH('/api/v1/users/{id}/status', {
          params: { path: { id: user.id } },
          body: { isActive: nextActive },
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      onOpenChange(false);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to update user status');
    },
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserX className="h-5 w-5 text-rose-400" />
            <span>{t('toggleStatusTitle')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {nextActive
              ? t('activateDesc', { name: user.name })
              : t('deactivateDesc', { name: user.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {errorMsg && (
            <Alert variant="destructive" className="border-rose-500/40 bg-rose-950/20 text-rose-300">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
            </Alert>
          )}

          {isSelf && !nextActive && (
            <Alert className="border-rose-500/30 bg-rose-950/20 text-rose-300 py-2">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription className="text-xs">{t('selfDeactivateAlert')}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs border-slate-700 bg-slate-900">
            {t('cancel')}
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (isSelf && !nextActive)}
            className={`text-xs font-semibold ${
              nextActive ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
          >
            {mutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {mutation.isPending
              ? t('updating')
              : nextActive
              ? t('confirmActivate')
              : t('confirmDeactivate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
