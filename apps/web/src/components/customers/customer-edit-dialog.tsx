'use client';

// ==============================================================================
// Kumaran Chits — Customer Profile Edit Dialog (Task: Master Subscriber Update)
// Authorized Staff (Super Admin / Partners & Branch Manager) updates contact,
// bilingual names, address, PAN, and masked Aadhaar under optimistic locking.
// ==============================================================================

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserCheck,
  Building2,
  AlertCircle,
  Loader2,
  Save,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import type { CustomerProfileData } from './customer-profile-header';

export interface CustomerEditDialogProps {
  customer: CustomerProfileData;
  isOpen: boolean;
  onClose: () => void;
}

const REGEX_PHONE = /^[6-9]\d{9}$/;
const REGEX_PINCODE = /^\d{6}$/;
const REGEX_PAN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const REGEX_AADHAAR_LAST_4 = /^\d{4}$/;

export function CustomerEditDialog({
  customer,
  isOpen,
  onClose,
}: CustomerEditDialogProps) {
  const t = useTranslations('customers');
  const queryClient = useQueryClient();

  // Form states initialized from customer prop
  const [fullName, setFullName] = React.useState(customer.fullName || '');
  const [fullNameTamil, setFullNameTamil] = React.useState(customer.fullNameTamil || '');
  const [phone, setPhone] = React.useState(customer.phone || '');
  const [altPhone, setAltPhone] = React.useState(customer.altPhone || '');
  const [addressLine1, setAddressLine1] = React.useState(customer.addressLine1 || '');
  const [addressLine2, setAddressLine2] = React.useState(customer.addressLine2 || '');
  const [city, setCity] = React.useState(customer.city || 'Perundurai');
  const [pincode, setPincode] = React.useState(customer.pincode || '638052');
  const [panNumber, setPanNumber] = React.useState(customer.panNumber || '');
  const [aadhaarLast4, setAadhaarLast4] = React.useState(customer.aadhaarLast4 || '');

  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Sync state whenever dialog opens or customer record changes
  React.useEffect(() => {
    if (isOpen) {
      setFullName(customer.fullName || '');
      setFullNameTamil(customer.fullNameTamil || '');
      setPhone(customer.phone || '');
      setAltPhone(customer.altPhone || '');
      setAddressLine1(customer.addressLine1 || '');
      setAddressLine2(customer.addressLine2 || '');
      setCity(customer.city || 'Perundurai');
      setPincode(customer.pincode || '638052');
      setPanNumber(customer.panNumber || '');
      setAadhaarLast4(customer.aadhaarLast4 || '');
      setValidationError(null);
      setServerError(null);
    }
  }, [isOpen, customer]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      return unwrapApiResponse(
        apiClient.PATCH('/api/v1/customers/{id}', {
          params: { path: { id: customer.id } },
          body: {
            fullName: fullName.trim(),
            fullNameTamil: fullNameTamil.trim() || undefined,
            phone: phone.trim(),
            altPhone: altPhone.trim() || undefined,
            addressLine1: addressLine1.trim(),
            addressLine2: addressLine2.trim() || undefined,
            city: city.trim(),
            pincode: pincode.trim(),
            panNumber: panNumber ? panNumber.trim().toUpperCase() : undefined,
            aadhaarLast4: aadhaarLast4 ? aadhaarLast4.trim() : undefined,
            version: customer.version,
          },
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(customer.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = getErrorMessage(err);
      if (msg.includes('CONCURRENT_MODIFICATION')) {
        setServerError(t('concurrentConflict'));
      } else if (msg.includes('already in use')) {
        setServerError(t('phoneInUse'));
      } else {
        setServerError(msg);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setServerError(null);

    // 1. Full name validation
    if (!fullName || fullName.trim().length < 2) {
      setValidationError('Full Name in English is required (at least 2 characters).');
      return;
    }

    // 2. Primary phone validation (ADR-18)
    const cleanPhone = phone.trim();
    if (!REGEX_PHONE.test(cleanPhone)) {
      setValidationError('Primary Mobile must be a valid 10-digit Indian phone starting with 6-9.');
      return;
    }

    // 3. Alternate phone validation (if provided)
    if (altPhone.trim() && !REGEX_PHONE.test(altPhone.trim())) {
      setValidationError('Alternate Mobile must be a valid 10-digit Indian phone.');
      return;
    }

    // 4. Address validation
    if (!addressLine1 || addressLine1.trim().length < 3) {
      setValidationError('Street Address Line 1 is required.');
      return;
    }
    if (!city || city.trim().length < 2) {
      setValidationError('Town or City is required.');
      return;
    }
    if (!REGEX_PINCODE.test(pincode.trim())) {
      setValidationError('Postal PIN Code must be exactly 6 digits.');
      return;
    }

    // 5. PAN validation (if provided)
    const cleanPan = panNumber.trim().toUpperCase();
    if (cleanPan && !REGEX_PAN.test(cleanPan)) {
      setValidationError('Income Tax PAN must be a valid 10-character alphanumeric code (e.g. ABCDE1234F).');
      return;
    }

    // 6. Aadhaar last 4 validation (DPDP Act 2023)
    const cleanAadhaar = aadhaarLast4.trim();
    if (cleanAadhaar && !REGEX_AADHAAR_LAST_4.test(cleanAadhaar)) {
      setValidationError('Aadhaar must strictly be the last 4 digits (e.g. 4821). Full 12 digits are prohibited.');
      return;
    }

    updateMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-slate-800 bg-slate-900 text-slate-100 p-6">
        <DialogHeader className="space-y-1.5 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-emerald-400" />
            <DialogTitle className="text-lg font-bold text-white">
              {t('editProfileTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            {t('editProfileDesc')}
          </DialogDescription>
        </DialogHeader>

        {/* Immutable Ledger Notice */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Code:</span>
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-950/40 font-mono text-emerald-300">
              {customer.customerCode}
            </Badge>
          </div>
          {customer.branch && (
            <div className="flex items-center gap-1.5 text-slate-400">
              <Building2 className="h-3.5 w-3.5 text-slate-500" />
              <span>{customer.branch.name} ({customer.branch.code})</span>
            </div>
          )}
          <span className="text-[11px] text-slate-500 italic">
            {t('editProfileImmutableNotice', { code: customer.customerCode })}
          </span>
        </div>

        {/* Validation or Server Errors */}
        {(validationError || serverError) && (
          <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <span>{validationError || serverError}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-1 text-xs">
          {/* Section 1: Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-medium text-slate-300">
                {t('fullNameLabel')}
              </label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('fullNamePlaceholder')}
                className="border-slate-750 bg-slate-950 text-slate-100 text-xs h-9"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium text-slate-300">
                {t('fullNameTamilLabel')}
              </label>
              <Input
                value={fullNameTamil}
                onChange={(e) => setFullNameTamil(e.target.value)}
                placeholder={t('fullNameTamilPlaceholder')}
                className="border-slate-750 bg-slate-950 text-slate-100 text-xs h-9 font-tamil"
              />
            </div>
          </div>

          {/* Section 2: Contact Numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-medium text-slate-300">
                {t('phoneLabel')}
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder={t('phonePlaceholder')}
                className="border-slate-750 bg-slate-950 text-slate-100 font-mono text-xs h-9"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium text-slate-300">
                {t('altPhoneLabel')}
              </label>
              <Input
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder={t('altPhonePlaceholder')}
                className="border-slate-750 bg-slate-950 text-slate-100 font-mono text-xs h-9"
              />
            </div>
          </div>

          {/* Section 3: Residential Address */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-medium text-slate-300">
                  {t('address1Label')}
                </label>
                <Input
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder={t('address1Placeholder')}
                  className="border-slate-750 bg-slate-950 text-slate-100 text-xs h-9"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium text-slate-300">
                  {t('address2Label')}
                </label>
                <Input
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder={t('address2Placeholder')}
                  className="border-slate-750 bg-slate-950 text-slate-100 text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-medium text-slate-300">
                  {t('cityLabel')}
                </label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="border-slate-750 bg-slate-950 text-slate-100 text-xs h-9"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium text-slate-300">
                  {t('pincodeLabel')}
                </label>
                <Input
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="border-slate-750 bg-slate-950 text-slate-100 font-mono text-xs h-9"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 4: Statutory Identifiers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800">
            <div className="space-y-1">
              <label className="font-medium text-slate-300">
                {t('panLabel')}
              </label>
              <Input
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase().slice(0, 10))}
                placeholder={t('panPlaceholder')}
                className="border-slate-750 bg-slate-950 text-slate-100 font-mono text-xs h-9 uppercase"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium text-slate-300">
                {t('aadhaarLabel')}
              </label>
              <Input
                value={aadhaarLast4}
                onChange={(e) => setAadhaarLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder={t('aadhaarPlaceholder')}
                className="border-slate-750 bg-slate-950 text-slate-100 font-mono text-xs h-9"
              />
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={updateMutation.isPending}
              className="border-slate-700 bg-slate-800 text-slate-300 text-xs h-8"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              <span>{t('cancel')}</span>
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={updateMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs h-8"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  <span>{t('savingChanges')}</span>
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  <span>{t('saveChanges')}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
