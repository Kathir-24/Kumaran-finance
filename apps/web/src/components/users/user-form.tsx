'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  IdCard,
  KeyRound,
  Loader2,
  Phone,
  Shield,
  Sparkles,
  User,
} from 'lucide-react';
import { apiClient, unwrapApiResponse, KumaranApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

const ROLE_OPTIONS = [
  { role: 'SUPER_ADMIN' as const, labelKey: 'roleSuperAdmin' as const },
  { role: 'BRANCH_MANAGER' as const, labelKey: 'roleBranchManager' as const },
  { role: 'ACCOUNTANT' as const, labelKey: 'roleAccountant' as const },
  { role: 'COLLECTION_AGENT' as const, labelKey: 'roleCollectionAgent' as const },
  { role: 'AUDITOR' as const, labelKey: 'roleAuditor' as const },
];

export function UserForm() {
  const t = useTranslations('users');
  const router = useRouter();
  const queryClient = useQueryClient();

  // Form State
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [branchId, setBranchId] = React.useState('');
  const [selectedRoles, setSelectedRoles] = React.useState<string[]>(['COLLECTION_AGENT']);
  const [password, setPassword] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Fetch branches for branch assignment
  const { data: branches = [] } = useQuery<{ id: string; code: string; name: string }[]>({
    queryKey: queryKeys.branches.all,
    queryFn: async () => {
      return unwrapApiResponse(
        apiClient.GET('/api/v1/branches', {
          params: { query: { activeOnly: 'false' } },
        })
      );
    },
  });

  // Default branch to Head Office (PRD)
  React.useEffect(() => {
    if (!branchId && branches.length > 0) {
      const ho = branches.find((b) => b.code === 'PRD' || b.code === 'HO');
      setBranchId(ho ? ho.id : branches[0].id);
    }
  }, [branches, branchId]);

  const isPhoneValid = React.useMemo(() => {
    if (!phone) return true;
    return INDIAN_PHONE_REGEX.test(phone.trim());
  }, [phone]);

  const isFormValid =
    name.trim().length >= 3 &&
    INDIAN_PHONE_REGEX.test(phone.trim()) &&
    selectedRoles.length > 0;

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null);
      const cleanPhone = phone.trim();
      if (!INDIAN_PHONE_REGEX.test(cleanPhone)) {
        throw new Error(t('phoneInvalid'));
      }
      if (selectedRoles.length === 0) {
        throw new Error(t('rolesRequired'));
      }

      return unwrapApiResponse(
        apiClient.POST('/api/v1/users', {
          body: {
            name: name.trim(),
            phone: cleanPhone,
            roles: selectedRoles as any,
            branchId: branchId || undefined,
            password: password.trim() || undefined,
          },
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      router.push('/users');
    },
    onError: (err: any) => {
      if (err instanceof KumaranApiError && err.statusCode === 409) {
        setErrorMsg(t('conflictError', { phone }));
      } else {
        setErrorMsg(err.message || 'Failed to create staff account');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || createMutation.isPending) return;
    createMutation.mutate();
  };

  const selectedBranch = branches.find((b) => b.id === branchId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Intake Form (7 cols) */}
      <div className="lg:col-span-7 space-y-6">
        <Card className="border-slate-800 bg-slate-900/80 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base text-slate-100 flex items-center gap-2">
              <User className="h-5 w-5 text-emerald-400" />
              <span>{t('createTitle')}</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              {t('createSubtitle')}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <Alert variant="destructive" className="border-rose-500/40 bg-rose-950/20 text-rose-300">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-xs font-bold">Registration Error</AlertTitle>
                  <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
                </Alert>
              )}

              {/* Staff Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">{t('nameLabel')}</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  className="bg-slate-950 border-slate-700 text-slate-100 focus:border-emerald-500"
                  required
                />
              </div>

              {/* 10-Digit Phone Handle (ADR-18) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">{t('phoneLabel')}</label>
                <div className="relative">
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder={t('phonePlaceholder')}
                    className="font-mono bg-slate-950 border-slate-700 text-slate-100 focus:border-emerald-500"
                    required
                  />
                  {phone.length === 10 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isPhoneValid ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-rose-400" />
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">{t('phoneHelp')}</p>
              </div>

              {/* Operating Branch Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">{t('branchLabel')}</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} - {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assigned RBAC Roles (Multi-Role Checkboxes) */}
              <div className="space-y-2 pt-1">
                <div>
                  <label className="text-xs font-semibold text-slate-300">{t('rolesLabel')}</label>
                  <p className="text-[11px] text-slate-500">{t('rolesHelp')}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map(({ role, labelKey }) => {
                    const checked = selectedRoles.includes(role);
                    return (
                      <label
                        key={role}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'border-emerald-500/40 bg-emerald-950/20 text-slate-100'
                            : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRole(role)}
                          className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400 h-4 w-4"
                        />
                        <span className="font-medium">{t(labelKey)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Initial Temporary Password */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-slate-300">{t('passwordLabel')}</label>
                <Input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  className="font-mono text-xs bg-slate-950 border-slate-700 text-slate-100 focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-500">{t('passwordHelp')}</p>
              </div>

              {/* Form Action Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/users')}
                  className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs"
                >
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={!isFormValid || createMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-950"
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  )}
                  {createMutation.isPending ? t('creating') : t('submitCreate')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Live Staff ID Badge Preview (5 cols) */}
      <div className="lg:col-span-5 space-y-4">
        <Card className="border-slate-800/80 bg-slate-950/70 shadow-xl backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span>{t('previewTitle')}</span>
            </CardTitle>
            <CardDescription className="text-[11px] text-slate-400">
              {t('previewDesc')}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Digital ID Badge Card */}
            <div className="rounded-xl border border-slate-700/60 bg-gradient-to-br from-slate-900 to-slate-950 p-5 space-y-4 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <IdCard className="h-5 w-5 text-emerald-400" />
                  <div>
                    <div className="text-xs font-bold text-slate-100 tracking-wider">
                      KUMARAN FINANCE
                    </div>
                    <div className="text-[10px] text-slate-400">Staff Identity Record</div>
                  </div>
                </div>
                <span className="font-mono text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded">
                  {selectedBranch?.code || 'PRD'}
                </span>
              </div>

              <div>
                <div className="text-base font-bold text-slate-100">
                  {name.trim() || 'Staff Full Name'}
                </div>
                <div className="flex items-center gap-1.5 font-mono text-xs text-slate-300 mt-1">
                  <Phone className="h-3 w-3 text-emerald-400" />
                  <span>+91 {phone.trim() || 'XXXXXXXXXX'}</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Assigned RBAC Roles
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedRoles.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-mono font-medium border bg-slate-800 text-slate-200 border-slate-700"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-2.5 flex items-center justify-between text-[10px] text-slate-500">
                <span>Branch: {selectedBranch?.name || 'Head Office - Perundurai'}</span>
                <span className="text-emerald-400/90 font-mono">STATUS: ACTIVE</span>
              </div>
            </div>

            <div className="rounded-lg border border-indigo-500/20 bg-indigo-950/10 p-3 text-[11px] text-indigo-200/90 leading-relaxed">
              <p className="font-semibold text-indigo-300">ADR-18 Phone-Only Identity Note</p>
              <p className="mt-1 text-slate-400">
                Staff login handle is solely the 10-digit Indian phone. Email authentication is
                permanently eliminated across the platform.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
