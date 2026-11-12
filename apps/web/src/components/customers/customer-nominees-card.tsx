'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users2,
  UserPlus,
  Trash2,
  Phone,
  FileCheck2,
  HeartHandshake,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient, unwrapApiResponse, getErrorMessage } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore, type AuthState } from '@/stores/auth-store';

export interface CustomerNominee {
  id: string;
  customerId: string;
  fullName: string;
  relationship: string;
  phone: string;
  aadhaarLast4?: string | null;
  createdAt?: string;
}

export interface CustomerNomineesCardProps {
  customerId: string;
  nominees: CustomerNominee[];
}

export function CustomerNomineesCard({ customerId, nominees }: CustomerNomineesCardProps) {
  const t = useTranslations('customers');
  const queryClient = useQueryClient();
  const user = useAuthStore((s: AuthState) => s.user);

  const canManageNominees = user?.roles?.some((role: string) =>
    ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'].includes(role),
  );
  const canDeleteNominees = user?.roles?.some((role: string) =>
    ['SUPER_ADMIN', 'BRANCH_MANAGER'].includes(role),
  );

  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<CustomerNominee | null>(null);

  // Add form fields
  const [fullName, setFullName] = React.useState('');
  const [relationship, setRelationship] = React.useState('Spouse');
  const [phone, setPhone] = React.useState('');
  const [aadhaarLast4, setAadhaarLast4] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: async () => {
      return unwrapApiResponse(
        apiClient.POST('/api/v1/customers/{id}/nominees', {
          params: { path: { id: customerId } },
          body: {
            fullName: fullName.trim(),
            relationship: relationship.trim(),
            phone: phone.trim(),
            aadhaarLast4: aadhaarLast4.trim() || undefined,
          },
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(customerId) });
      setIsAddOpen(false);
      setFullName('');
      setPhone('');
      setAadhaarLast4('');
      setFormError(null);
    },
    onError: (err: unknown) => {
      setFormError(getErrorMessage(err, 'Failed to link nominee'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (nomineeId: string) => {
      return unwrapApiResponse(
        apiClient.DELETE('/api/v1/customers/{id}/nominees/{nomineeId}', {
          params: { path: { id: customerId, nomineeId } },
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(customerId) });
      setDeleteTarget(null);
    },
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !relationship.trim() || !phone.trim()) {
      setFormError('Please fill in all mandatory fields');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      setFormError('Mobile phone must be 10 digits starting with 6-9');
      return;
    }
    if (aadhaarLast4 && !/^\d{4}$/.test(aadhaarLast4.trim())) {
      setFormError('Masked Aadhaar must be strictly 4 digits');
      return;
    }
    setFormError(null);
    addMutation.mutate();
  };

  return (
    <div className="space-y-4">
      {/* Header with Add CTA */}
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users2 className="h-4 w-4 text-indigo-400" />
            <span>{t('nomineesCardTitle')}</span>
          </h3>
          <p className="text-xs text-slate-400">{t('nomineesCardSubtitle')}</p>
        </div>

        {canManageNominees && (
          <Button
            size="sm"
            onClick={() => setIsAddOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium h-8"
          >
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            <span>{t('addNominee')}</span>
          </Button>
        )}
      </div>

      {/* Nominees Grid */}
      {nominees.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center space-y-2">
          <HeartHandshake className="mx-auto h-8 w-8 text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-300">{t('noNominees')}</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">{t('noNomineesDesc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {nominees.map((nominee) => (
            <div
              key={nominee.id}
              className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{nominee.fullName}</span>
                    <Badge variant="outline" className="border-indigo-500/30 bg-indigo-950/40 text-indigo-300 text-[11px]">
                      {nominee.relationship}
                    </Badge>
                  </div>
                </div>

                {canDeleteNominees && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(nominee)}
                    className="h-7 w-7 p-0 text-slate-500 hover:text-red-400 hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-800/80 pt-2.5">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Phone className="h-3 w-3 text-emerald-400" />
                  <span className="font-mono">+91 {nominee.phone}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <FileCheck2 className="h-3 w-3 text-slate-500" />
                  <span className="font-mono">
                    {nominee.aadhaarLast4 ? `XXXX-${nominee.aadhaarLast4}` : '—'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Nominee Modal */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base text-white">{t('addNomineeTitle')}</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              {t('addNomineeDesc')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddSubmit} className="space-y-3.5 py-2">
            {formError && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-2.5 text-xs text-red-300 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">{t('nomineeNameLabel')}</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. M. Kavitha"
                className="h-8 border-slate-700 bg-slate-950 text-xs text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">{t('nomineeRelationLabel')}</label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full h-8 rounded-md border border-slate-700 bg-slate-950 px-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="Spouse">{t('relSpouse')}</option>
                <option value="Son">{t('relSon')}</option>
                <option value="Daughter">{t('relDaughter')}</option>
                <option value="Father">{t('relFather')}</option>
                <option value="Mother">{t('relMother')}</option>
                <option value="Brother">{t('relBrother')}</option>
                <option value="Sister">{t('relSister')}</option>
                <option value="Other">{t('relOther')}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">{t('nomineePhoneLabel')}</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9842199887"
                  maxLength={10}
                  className="h-8 font-mono border-slate-700 bg-slate-950 text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">{t('nomineeAadhaarLabel')}</label>
                <Input
                  value={aadhaarLast4}
                  onChange={(e) => setAadhaarLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="5678"
                  maxLength={4}
                  className="h-8 font-mono border-slate-700 bg-slate-950 text-xs text-white"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsAddOpen(false)}
                className="h-8 text-xs text-slate-400 hover:text-white"
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={addMutation.isPending}
                className="h-8 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
              >
                {addMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                <span>{addMutation.isPending ? t('savingNominee') : t('saveNominee')}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base text-white">{t('deleteNomineeTitle')}</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              {t('deleteNomineeConfirm', { name: deleteTarget?.fullName || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              className="h-8 text-xs text-slate-400"
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="h-8 text-xs bg-red-600 hover:bg-red-500"
            >
              {deleteMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <span>{deleteMutation.isPending ? t('deletingNominee') : t('delete')}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
