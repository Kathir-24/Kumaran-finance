'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldAlert } from 'lucide-react';
import { apiClient, unwrapApiResponse, KumaranApiError, getErrorMessage } from '@/lib/api-client';
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

export interface ActivateSchemeDialogProps {
  chitGroupId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ActivateSchemeDialog({
  chitGroupId,
  isOpen,
  onClose,
  onSuccess,
}: ActivateSchemeDialogProps) {
  const t = useTranslations('schemes');
  const queryClient = useQueryClient();

  const [activationNotes, setActivationNotes] = React.useState('');
  const [activationError, setActivationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setActivationNotes('');
      setActivationError(null);
    }
  }, [isOpen]);

  const activateMutation = useMutation({
    mutationFn: async () => {
      return unwrapApiResponse(
        apiClient.POST('/api/v1/chits/{id}/activate', {
          params: { path: { id: chitGroupId } },
          body: { notes: activationNotes.trim() || undefined },
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.detail(chitGroupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.list() });
      onSuccess();
      onClose();
    },
    onError: (err: unknown) => {
      if (err instanceof KumaranApiError) {
        setActivationError(err.message);
      } else {
        setActivationError(getErrorMessage(err, 'Activation failed'));
      }
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-100">
            {t('activateConfirmTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 leading-relaxed">
            {t('activateConfirmDesc')}
          </DialogDescription>
        </DialogHeader>

        {activationError && (
          <Alert variant="destructive" className="py-2">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle className="text-xs font-bold">Activation Error</AlertTitle>
            <AlertDescription className="text-xs">{activationError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2 py-2">
          <label className="text-xs font-semibold text-slate-300">
            Checker Approval Notes (Optional)
          </label>
          <Input
            placeholder="e.g. Verified by Super Admin against physical register"
            value={activationNotes}
            onChange={(e) => setActivationNotes(e.target.value)}
            className="text-xs border-slate-700 bg-slate-950 text-slate-100"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={activateMutation.isPending}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={() => activateMutation.mutate()}
            disabled={activateMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          >
            {activateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('activating')}
              </>
            ) : (
              t('confirmActivationButton')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
