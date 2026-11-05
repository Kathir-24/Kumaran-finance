'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Building2,
  Check,
  Copy,
  KeyRound,
  MoreVertical,
  Phone,
  SearchX,
  Shield,
  ShieldCheck,
  Smartphone,
  UserCheck,
  UserX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  EditRolesDialog,
  ResetPasswordDialog,
  ToggleStatusDialog,
  type UserSummary,
} from './user-action-dialogs';
import { cn } from '@/lib/utils';

export interface UserItem {
  id: string;
  name: string;
  phone: string;
  roles: string[];
  isActive: boolean;
  isTotpEnabled: boolean;
  hasMpin: boolean;
  branchId?: string | null;
  branch?: { id: string; code: string; name: string; nameTamil?: string | null } | null;
  lastLoginAt?: string | Date | null;
  createdAt: string | Date;
}

interface UserTableProps {
  users: UserItem[];
  isLoading: boolean;
  searchQuery: string;
  onClearSearch: () => void;
  currentUserId?: string;
}

const ROLE_BADGE_STYLES: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-950/60 text-purple-300 border-purple-800/60',
  BRANCH_MANAGER: 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60',
  ACCOUNTANT: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
  COLLECTION_AGENT: 'bg-blue-950/60 text-blue-300 border-blue-800/60',
  AUDITOR: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60',
};

export function UserTable({
  users,
  isLoading,
  searchQuery,
  onClearSearch,
  currentUserId,
}: UserTableProps) {
  const t = useTranslations('users');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Dialog states
  const [activeUser, setActiveUser] = React.useState<UserSummary | null>(null);
  const [rolesOpen, setRolesOpen] = React.useState(false);
  const [resetPassOpen, setResetPassOpen] = React.useState(false);
  const [toggleStatusOpen, setToggleStatusOpen] = React.useState(false);

  const handleCopyPhone = (id: string, phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
        <div className="inline-flex h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        <p className="mt-4 text-xs font-medium text-slate-400">Loading staff users...</p>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
        <SearchX className="mx-auto h-12 w-12 text-slate-600" />
        <h3 className="mt-3 text-sm font-semibold text-slate-200">{t('noUsersFound')}</h3>
        <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">{t('noUsersDesc')}</p>
        {searchQuery && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearSearch}
            className="mt-4 border-slate-700 bg-slate-850 hover:bg-slate-800 text-xs"
          >
            Clear Search Filter
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/70 shadow-xl backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-950/60 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                <th className="py-3.5 px-4">{t('colStaff')}</th>
                <th className="py-3.5 px-4">{t('colPhone')}</th>
                <th className="py-3.5 px-4">{t('colBranch')}</th>
                <th className="py-3.5 px-4">{t('colRoles')}</th>
                <th className="py-3.5 px-4">{t('colSecurity')}</th>
                <th className="py-3.5 px-4">{t('colStatus')}</th>
                <th className="py-3.5 px-4 text-right">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
              {users.map((u) => {
                const isSelf = Boolean(currentUserId && u.id === currentUserId);
                return (
                  <tr key={u.id} className="transition-colors hover:bg-slate-800/40 group">
                    {/* Staff Member */}
                    <td className="py-3.5 px-4 min-w-[180px]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 border border-slate-700 font-mono text-xs font-bold text-slate-200">
                          {getInitials(u.name)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                            <span>{u.name}</span>
                            {isSelf && (
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] px-1 py-0">
                                {t('currentUserBadge')}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Contact Phone (ADR-18) */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${u.phone}`}
                          className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-300 hover:text-emerald-400 transition-colors"
                          title={t('quickCall')}
                        >
                          <Phone className="h-3 w-3 text-emerald-400" />
                          <span>+91 {u.phone}</span>
                        </a>
                        <button
                          type="button"
                          onClick={(e) => handleCopyPhone(u.id, u.phone, e)}
                          title={copiedId === u.id ? t('copiedPhone') : t('copyPhone')}
                          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                        >
                          {copiedId === u.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Primary Branch */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-slate-300">
                        <Building2 className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                        <span>{u.branch?.name || 'Head Office (PRD)'}</span>
                      </div>
                    </td>

                    {/* Assigned Roles (Dual Roles Support) */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-[240px]">
                        {u.roles.map((r) => (
                          <span
                            key={r}
                            className={cn(
                              'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium border font-mono',
                              ROLE_BADGE_STYLES[r] || 'bg-slate-800 text-slate-300 border-slate-700'
                            )}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Security Status (TOTP / MPIN) */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-[10px]">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 border',
                            u.isTotpEnabled
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-slate-800 text-slate-500 border-slate-700/60'
                          )}
                          title={u.isTotpEnabled ? t('totpActive') : t('totpInactive')}
                        >
                          <ShieldCheck className="h-3 w-3" />
                          2FA
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 border',
                            u.hasMpin
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              : 'bg-slate-800 text-slate-500 border-slate-700/60'
                          )}
                          title={u.hasMpin ? t('mpinSet') : t('mpinUnset')}
                        >
                          <Smartphone className="h-3 w-3" />
                          MPIN
                        </span>
                      </div>
                    </td>

                    {/* Login Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border',
                          u.isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        )}
                      >
                        <span
                          className={cn(
                            'mr-1.5 h-1.5 w-1.5 rounded-full',
                            u.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                          )}
                        />
                        {u.isActive ? t('active') : t('inactive')}
                      </span>
                    </td>

                    {/* Actions Menu */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-100">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border-slate-800 bg-slate-900 text-slate-200">
                          <DropdownMenuItem
                            onClick={() => {
                              setActiveUser(u);
                              setRolesOpen(true);
                            }}
                            className="text-xs flex items-center gap-2 cursor-pointer"
                          >
                            <Shield className="h-3.5 w-3.5 text-indigo-400" />
                            <span>{t('editRoles')}</span>
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => {
                              setActiveUser(u);
                              setResetPassOpen(true);
                            }}
                            className="text-xs flex items-center gap-2 cursor-pointer"
                          >
                            <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                            <span>{t('resetPassword')}</span>
                          </DropdownMenuItem>

                          <DropdownMenuSeparator className="bg-slate-800" />

                          <DropdownMenuItem
                            onClick={() => {
                              setActiveUser(u);
                              setToggleStatusOpen(true);
                            }}
                            disabled={isSelf && u.isActive}
                            className={cn(
                              'text-xs flex items-center gap-2 cursor-pointer',
                              u.isActive ? 'text-rose-400 hover:text-rose-300' : 'text-emerald-400 hover:text-emerald-300'
                            )}
                          >
                            {u.isActive ? (
                              <>
                                <UserX className="h-3.5 w-3.5 text-rose-400" />
                                <span>{t('deactivateStaff')}</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                                <span>{t('activateStaff')}</span>
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Dialogs */}
      <EditRolesDialog
        user={activeUser}
        open={rolesOpen}
        onOpenChange={setRolesOpen}
        currentUserId={currentUserId}
      />
      <ResetPasswordDialog
        user={activeUser}
        open={resetPassOpen}
        onOpenChange={setResetPassOpen}
      />
      <ToggleStatusDialog
        user={activeUser}
        open={toggleStatusOpen}
        onOpenChange={setToggleStatusOpen}
        currentUserId={currentUserId}
      />
    </>
  );
}
