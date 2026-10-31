'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { apiClient, unwrapApiResponse, KumaranApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export interface EditSchemeDialogProps {
  scheme: {
    id: string;
    groupCode: string;
    groupName: string;
    groupNameTamil?: string | null;
    startDate: string | Date;
    endDate: string | Date;
    sanctionOrderNumber?: string | null;
    sanctionDate?: string | Date | null;
    status: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditSchemeDialog({
  scheme,
  isOpen,
  onClose,
  onSuccess,
}: EditSchemeDialogProps) {
  const t = useTranslations('schemes');
  const queryClient = useQueryClient();

  const [groupName, setGroupName] = React.useState(scheme.groupName);
  const [groupNameTamil, setGroupNameTamil] = React.useState(scheme.groupNameTamil || '');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [sanctionOrderNumber, setSanctionOrderNumber] = React.useState(scheme.sanctionOrderNumber || '');
  const [sanctionDate, setSanctionDate] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setGroupName(scheme.groupName);
      setGroupNameTamil(scheme.groupNameTamil || '');
      setSanctionOrderNumber(scheme.sanctionOrderNumber || '');
      setErrorMsg(null);

      try {
        setStartDate(new Date(scheme.startDate).toISOString().split('T')[0]);
      } catch {
        setStartDate('');
      }

      try {
        setEndDate(new Date(scheme.endDate).toISOString().split('T')[0]);
      } catch {
        setEndDate('');
      }

      if (scheme.sanctionDate) {
        try {
          setSanctionDate(new Date(scheme.sanctionDate).toISOString().split('T')[0]);
        } catch {
          setSanctionDate('');
        }
      } else {
        setSanctionDate('');
      }
    }
  }, [isOpen, scheme]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      return unwrapApiResponse(
        apiClient.PATCH('/api/v1/chits/{id}', {
          params: { path: { id: scheme.id } },
          body: {
            groupName: groupName.trim(),
            groupNameTamil: groupNameTamil.trim() || undefined,
            startDate: startDate ? new Date(startDate).toISOString() : undefined,
            endDate: endDate ? new Date(endDate).toISOString() : undefined,
            sanctionOrderNumber: sanctionOrderNumber.trim() || undefined,
            sanctionDate: sanctionDate ? new Date(sanctionDate).toISOString() : undefined,
          },
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.detail(scheme.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.list() });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      if (err instanceof KumaranApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(err.message || 'Failed to update draft scheme');
      }
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-100">
            {t('editModalTitle')} ({scheme.groupCode})
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {t('editModalDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-2">
          {errorMsg && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-xs font-bold">Error</AlertTitle>
              <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">{t('groupNameEn')}</label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="text-xs border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">{t('groupNameTa')}</label>
            <Input
              value={groupNameTamil}
              onChange={(e) => setGroupNameTamil(e.target.value)}
              className="text-xs font-tamil border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">{t('startDateLabel')}</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs border-slate-700 bg-slate-950 text-slate-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">{t('endDateLabel')}</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs border-slate-700 bg-slate-950 text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                {t('sanctionOrderLabel')}
              </label>
              <Input
                value={sanctionOrderNumber}
                onChange={(e) => setSanctionOrderNumber(e.target.value)}
                className="text-xs font-mono border-slate-700 bg-slate-950 text-slate-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                {t('sanctionDateLabel')}
              </label>
              <Input
                type="date"
                value={sanctionDate}
                onChange={(e) => setSanctionDate(e.target.value)}
                className="text-xs border-slate-700 bg-slate-950 text-slate-100"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={updateMutation.isPending}>
            {t('cancel')}
          </Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={!groupName.trim() || updateMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('saving')}
              </>
            ) : (
              t('saveChanges')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
