'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Shield, ShieldAlert } from 'lucide-react';
import { apiClient, unwrapApiResponse, getErrorMessage } from '@/lib/api-client';
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

export type UserRoleType =
  | 'SUPER_ADMIN'
  | 'PARTNER'
  | 'BRANCH_MANAGER'
  | 'ACCOUNTANT'
  | 'COLLECTION_AGENT'
  | 'AUDITOR';

export interface UserSummary {
  id: string;
  name: string;
  phone: string;
  roles: string[];
  isActive: boolean;
  branch?: { id: string; code: string; name: string } | null;
}

export const AVAILABLE_ROLES = [
  { role: 'SUPER_ADMIN' as const, key: 'roleSuperAdmin' as const },
  { role: 'PARTNER' as const, key: 'rolePartner' as const },
  { role: 'BRANCH_MANAGER' as const, key: 'roleBranchManager' as const },
  { role: 'ACCOUNTANT' as const, key: 'roleAccountant' as const },
  { role: 'COLLECTION_AGENT' as const, key: 'roleCollectionAgent' as const },
  { role: 'AUDITOR' as const, key: 'roleAuditor' as const },
];

export function EditRolesDialog({
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
  const [selectedRoles, setSelectedRoles] = React.useState<string[]>([]);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user) {
      setSelectedRoles(user.roles || []);
      setErrorMsg(null);
    }
  }, [user]);

  const isSelf = Boolean(user && currentUserId && user.id === currentUserId);

  const toggleRole = (role: string) => {
    if (isSelf && role === 'SUPER_ADMIN') return; // Cannot revoke own Super Admin
    setSelectedRoles((prev) => {
      if (prev.includes(role)) {
        return prev.filter((r) => r !== role);
      }
      if (role === 'SUPER_ADMIN') {
        return [...prev.filter((r) => r !== 'PARTNER'), role];
      }
      if (role === 'PARTNER') {
        return [...prev.filter((r) => r !== 'SUPER_ADMIN'), role];
      }
      return [...prev, role];
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (selectedRoles.length === 0) {
        throw new Error(t('rolesRequired'));
      }
      return unwrapApiResponse(
        apiClient.PATCH('/api/v1/users/{id}/roles', {
          params: { path: { id: user.id } },
          body: {
            roles: selectedRoles as UserRoleType[],
          },
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      setErrorMsg(getErrorMessage(err, 'Failed to update roles'));
    },
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-indigo-400" />
            <span>{t('editRolesTitle')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {t('editRolesDesc')} ({user.name} - +91 {user.phone})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {errorMsg && (
            <Alert variant="destructive" className="border-rose-500/40 bg-rose-950/20 text-rose-300">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
            </Alert>
          )}

          {isSelf && (
            <Alert className="border-amber-500/30 bg-amber-950/20 text-amber-300 py-2">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription className="text-xs">{t('selfRevokeAlert')}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            {AVAILABLE_ROLES.map(({ role, key }) => {
              const checked = selectedRoles.includes(role);
              const disabled = isSelf && role === 'SUPER_ADMIN';
              return (
                <label
                  key={role}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                    checked
                      ? 'border-emerald-500/40 bg-emerald-950/20 text-slate-100'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                  } ${disabled ? 'opacity-80 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleRole(role)}
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400 h-4 w-4"
                    />
                    <span className="font-medium">{t(key)}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">{role}</span>
                </label>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs border-slate-700 bg-slate-900">
            {t('cancel')}
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || selectedRoles.length === 0}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          >
            {mutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {mutation.isPending ? t('rolesSaving') : t('rolesSaveBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
