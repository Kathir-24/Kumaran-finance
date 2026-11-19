'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  Clock,
  Phone,
  MapPin,
  Building2,
  FileCheck2,
  CheckCircle2,
  XCircle,
  Loader2,
  Pencil,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CustomerEditDialog } from './customer-edit-dialog';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore, type AuthState } from '@/stores/auth-store';

export interface CustomerProfileData {
  id: string;
  customerCode: string;
  fullName: string;
  fullNameTamil?: string | null;
  phone: string;
  altPhone?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  pincode: string;
  panNumber?: string | null;
  aadhaarLast4?: string | null;
  isKycVerified: boolean;
  version?: number;
  branch?: {
    id: string;
    code: string;
    name: string;
    nameTamil?: string | null;
  } | null;
}

export interface CustomerProfileHeaderProps {
  customer: CustomerProfileData;
}

export function CustomerProfileHeader({ customer }: CustomerProfileHeaderProps) {
  const t = useTranslations('customers');
  const queryClient = useQueryClient();
  const user = useAuthStore((s: AuthState) => s.user);

  const canManageKyc = user?.roles?.some((role: string) =>
    ['PARTNER', 'BRANCH_MANAGER', 'ACCOUNTANT'].includes(role),
  );

  const canEditProfile = user?.roles?.some((role: string) =>
    ['PARTNER', 'BRANCH_MANAGER'].includes(role),
  );

  const [isEditOpen, setIsEditOpen] = React.useState(false);

  const kycMutation = useMutation({
    mutationFn: async (nextStatus: boolean) => {
      return unwrapApiResponse(
        apiClient.PATCH('/api/v1/customers/{id}/kyc-status', {
          params: { path: { id: customer.id } },
          body: { isKycVerified: nextStatus },
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(customer.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
  });

  const handleToggleKyc = () => {
    kycMutation.mutate(!customer.isKycVerified);
  };

  const formattedAddress = [
    customer.addressLine1,
    customer.addressLine2,
    customer.city,
    customer.pincode ? `PIN: ${customer.pincode}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg space-y-4">
      {/* Top Banner: Name, Code & KYC Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              {customer.fullName}
            </h1>
            {customer.fullNameTamil && (
              <span className="text-base text-slate-400 font-normal">
                ({customer.fullNameTamil})
              </span>
            )}
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-950/40 font-mono text-xs font-semibold text-emerald-400 px-2 py-0.5"
            >
              {customer.customerCode}
            </Badge>
          </div>

          <p className="text-xs text-slate-400 flex items-center gap-2">
            <span>{t('profile360Subtitle')}</span>
          </p>
        </div>

        {/* KYC Badge & Quick Toggle Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          {customer.isKycVerified ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-xs font-medium flex items-center gap-1.5 py-1 px-2.5"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>{t('kycVerified')}</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-medium flex items-center gap-1.5 py-1 px-2.5"
            >
              <Clock className="h-4 w-4 text-amber-400" />
              <span>{t('kycPending')}</span>
            </Badge>
          )}

          {canManageKyc && (
            <Button
              size="sm"
              variant={customer.isKycVerified ? 'outline' : 'default'}
              disabled={kycMutation.isPending}
              onClick={handleToggleKyc}
              className={
                customer.isKycVerified
                  ? 'border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-xs text-slate-300 h-8 px-2.5'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs h-8 px-2.5'
              }
            >
              {kycMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : customer.isKycVerified ? (
                <XCircle className="h-3.5 w-3.5 text-amber-400 mr-1.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-white mr-1.5" />
              )}
              <span>
                {customer.isKycVerified ? t('kycToggleRevoke') : t('kycToggleVerify')}
              </span>
            </Button>
          )}

          {canEditProfile && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditOpen(true)}
              className="border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-xs text-slate-200 hover:text-emerald-400 h-8 px-2.5"
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
              <span>{t('editProfile')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Grid: Contact, Residential Address & Statutory Identifiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* Contact Info */}
        <div className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-indigo-400" />
            <span>{t('contactAddress')}</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{t('primaryPhone')}:</span>
              <a
                href={`tel:+91${customer.phone}`}
                className="font-mono text-emerald-400 hover:underline font-medium"
              >
                +91 {customer.phone}
              </a>
            </div>
            {customer.altPhone && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('altPhone')}:</span>
                <span className="font-mono text-slate-300">+91 {customer.altPhone}</span>
              </div>
            )}
          </div>
        </div>

        {/* Residential Address & Branch */}
        <div className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-amber-400" />
            <span>{t('residenceAddress')}</span>
          </div>
          <p className="text-slate-300 leading-relaxed truncate" title={formattedAddress}>
            {formattedAddress || t('notProvided')}
          </p>
          {customer.branch && (
            <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-400 border-t border-slate-850">
              <Building2 className="h-3 w-3 text-slate-500" />
              <span>{t('homeBranch')}:</span>
              <span className="font-semibold text-slate-200">
                {customer.branch.name} ({customer.branch.code})
              </span>
            </div>
          )}
        </div>

        {/* Statutory Identifiers (DPDP Act Masked Aadhaar & PAN) */}
        <div className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileCheck2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>{t('panNumber')} & Aadhaar</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">PAN:</span>
              <span className="font-mono font-medium text-slate-200">
                {customer.panNumber || t('notProvided')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Aadhaar:</span>
              <span className="font-mono font-medium text-slate-200">
                {customer.aadhaarLast4
                  ? `XXXX-XXXX-${customer.aadhaarLast4}`
                  : t('notProvided')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {canEditProfile && (
        <CustomerEditDialog
          customer={customer}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      )}
    </div>
  );
}
