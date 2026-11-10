'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Menu,
  Building2,
  ChevronDown,
  Bell,
  Check,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  User,
  KeyRound,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useApprovalsStore } from '@/stores/approvals-store';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { LocaleSwitcher } from '@/components/ui/locale-switcher';
import { TotpEnrollmentModal } from '@/components/auth/totp-enrollment-modal';
import { TotpDisableModal } from '@/components/auth/totp-disable-modal';
import { ChangePasswordModal } from '@/components/auth/change-password-modal';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';

interface TopbarProps {
  onMobileMenuToggle: () => void;
}

export interface BranchDto {
  id: string;
  code: string;
  name: string;
  nameTamil?: string;
  address?: string;
  phone?: string;
  isActive: boolean;
}

export function Topbar({ onMobileMenuToggle }: TopbarProps) {
  const tTopbar = useTranslations('topbar');
  const tNav = useTranslations('nav');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const setActiveBranchId = useAuthStore((s) => s.setActiveBranchId);
  const logout = useAuthStore((s) => s.logout);

  const totalPendingCount = useApprovalsStore((s) => s.totalPendingCount);
  const cashHandoversCount = useApprovalsStore((s) => s.cashHandoversCount);
  const disbursementAuthorizationsCount = useApprovalsStore(
    (s) => s.disbursementAuthorizationsCount
  );
  const paymentReversalsCount = useApprovalsStore((s) => s.paymentReversalsCount);
  const safetyProofVerificationsCount = useApprovalsStore(
    (s) => s.safetyProofVerificationsCount
  );
  const isConnected = useApprovalsStore((s) => s.isConnected);

  // 2FA & Password Management Modals state
  const [isEnrollModalOpen, setIsEnrollModalOpen] = React.useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = React.useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch branches from live backend
  const { data: branches = [] } = useQuery<BranchDto[]>({
    queryKey: ['branches', 'list'],
    queryFn: async () => {
      const response = await unwrapApiResponse<BranchDto[]>(
        apiClient.GET('/api/v1/branches', {
          params: { query: { activeOnly: 'true' } },
        })
      );
      return response || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Determine active branch display name
  const activeBranch = React.useMemo(() => {
    if (!activeBranchId) return null;
    return branches.find((b) => b.id === activeBranchId) || null;
  }, [branches, activeBranchId]);

  const handleSelectBranch = (branchId: string | null) => {
    setActiveBranchId(branchId);
    // Invalidate queries that depend on active branch
    queryClient.invalidateQueries({ queryKey: ['approvals'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const isSuperAdminOrAuditor =
    isMounted && (user?.roles?.includes('SUPER_ADMIN') || user?.roles?.includes('AUDITOR'));

  const initials = React.useMemo(() => {
    if (!isMounted || !user?.name) return 'KC';
    const parts = user.name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return user.name.slice(0, 2).toUpperCase();
  }, [isMounted, user?.name]);

  const displayBranch = isMounted ? activeBranch : null;

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 backdrop-blur-md transition-all">
        {/* Left: Mobile hamburger & Active Branch selector */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMobileMenuToggle}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Open mobile menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Branch Switcher Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-700 hover:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-400">
              <Building2 className="h-4 w-4 text-emerald-400" />
              <div className="flex flex-col text-left">
                <span className="font-semibold text-slate-100 max-w-[200px] sm:max-w-[280px] truncate">
                  {displayBranch ? displayBranch.name : tTopbar('allBranches')}
                </span>
                {displayBranch?.nameTamil && (
                  <span className="text-[10px] text-slate-400 max-w-[200px] sm:max-w-[280px] truncate">
                    {displayBranch.nameTamil}
                  </span>
                )}
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>{tTopbar('selectBranch')}</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Company-wide option (Super Admin / Auditor) */}
              {isSuperAdminOrAuditor && (
                <DropdownMenuItem
                  onClick={() => handleSelectBranch(null)}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-200">
                      {tTopbar('allBranches')}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Kumaran Finance (Consolidated)
                    </span>
                  </div>
                  {!activeBranchId && (
                    <Check className="h-4 w-4 text-emerald-400" />
                  )}
                </DropdownMenuItem>
              )}

              {/* Branch List */}
              {branches.map((b) => {
                const isSelected = activeBranchId === b.id;
                return (
                  <DropdownMenuItem
                    key={b.id}
                    onClick={() => handleSelectBranch(b.id)}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-200">
                        {b.name}
                      </span>
                      {b.nameTamil && (
                        <span className="text-[11px] text-slate-400">
                          {b.nameTamil}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 text-emerald-400" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: Actions, Pending Approvals, Locale, Profile */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Maker-Checker Pending Approvals Badge */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'relative flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all focus:outline-none',
                totalPendingCount > 0
                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
              )}
              aria-label={tTopbar('pendingApprovals')}
            >
              <Bell
                className={cn(
                  'h-4 w-4',
                  totalPendingCount > 0 ? 'text-amber-400' : 'text-slate-400'
                )}
              />
              <span className="hidden sm:inline">
                {totalPendingCount > 0
                  ? `${totalPendingCount} ${tTopbar('pendingApprovals')}`
                  : tTopbar('noPending')}
              </span>
              {totalPendingCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-400 text-slate-950 font-black text-[11px] px-1 sm:hidden">
                  {totalPendingCount}
                </span>
              )}
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    )}
                    title={isConnected ? 'Live SSE Stream Connected' : 'Polling Sync Mode'}
                  />
                  <span>{tTopbar('pendingApprovals')}</span>
                </span>
                <span className="text-emerald-400 text-[11px] font-mono">
                  Maker ≠ Checker
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {totalPendingCount === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  {tTopbar('noPending')}
                </div>
              ) : (
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/collections/handover"
                      className="flex items-center justify-between py-2"
                    >
                      <span>{tNav('handover')}</span>
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                        {cashHandoversCount}
                      </span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link
                      href="/disbursements"
                      className="flex items-center justify-between py-2"
                    >
                      <span>{tNav('disbursements')}</span>
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                        {disbursementAuthorizationsCount}
                      </span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link
                      href="/reversals"
                      className="flex items-center justify-between py-2"
                    >
                      <span>{tNav('reversals')}</span>
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                        {paymentReversalsCount}
                      </span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link
                      href="/disbursements"
                      className="flex items-center justify-between py-2"
                    >
                      <span>{tTopbar('safetyProofVerifications')}</span>
                      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-300">
                        {safetyProofVerificationsCount}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Bilingual Switcher (English ↔ தமிழ்) */}
          <LocaleSwitcher />

          {/* User Profile Avatar Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 p-1.5 transition-colors hover:border-slate-700 hover:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-400">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 font-bold text-xs text-emerald-400">
                {initials}
              </div>
              <ChevronDown className="h-3 w-3 text-slate-400 hidden sm:block mr-1" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-64">
              {/* Profile Card Header */}
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-white truncate">
                    {user?.name || 'Staff User'}
                  </span>
                  {user?.isTotpEnabled ? (
                    <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                      <ShieldCheck className="h-3 w-3" />
                      2FA
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/20">
                      <ShieldAlert className="h-3 w-3" />
                      No 2FA
                    </span>
                  )}
                </div>

                {user?.fullNameTamil && (
                  <p className="text-xs text-slate-400 truncate">
                    {user.fullNameTamil}
                  </p>
                )}

                <p className="text-[11px] font-mono text-slate-400 mt-1">
                  +91 {user?.phone || '—'}
                </p>

                {/* Role badges */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {user?.roles?.map((r) => (
                    <span
                      key={r}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300 uppercase tracking-wider"
                    >
                      {r.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>

              <DropdownMenuSeparator />

              {/* 2FA Security Configuration Actions */}
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => setIsChangePasswordOpen(true)}
                  className="gap-2 text-slate-300 focus:text-white"
                >
                  <KeyRound className="h-4 w-4 text-emerald-400" />
                  <span>{tTopbar('changePasswordAction')}</span>
                </DropdownMenuItem>

                {user?.isTotpEnabled ? (
                  <DropdownMenuItem
                    onClick={() => setIsDisableModalOpen(true)}
                    className="gap-2 text-rose-300 focus:text-rose-200"
                  >
                    <ShieldAlert className="h-4 w-4 text-rose-400" />
                    <span>{tTopbar('disableTotpAction')}</span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => setIsEnrollModalOpen(true)}
                    className="gap-2 text-emerald-300 focus:text-emerald-200"
                  >
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>{tTopbar('setupTotpAction')}</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              {/* Logout Button */}
              <DropdownMenuItem
                onClick={() => logout('manual')}
                className="gap-2 text-slate-300 hover:text-white"
              >
                <LogOut className="h-4 w-4 text-rose-400" />
                <span>{tAuth('logout')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* In-App TOTP & Password Modals */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
      <TotpEnrollmentModal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
      />
      <TotpDisableModal
        isOpen={isDisableModalOpen}
        onClose={() => setIsDisableModalOpen(false)}
      />
    </>
  );
}
