'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { apiClient, unwrapApiResponse, KumaranApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { IntakeSuccessDialog } from './intake-success-dialog';
import {
  SubscriberDetailsSection,
  AddressDetailsSection,
  NomineeDetailsSection,
  KycTaxDetailsSection,
} from './customer-intake-sections';

export function CustomerIntakeForm() {
  const t = useTranslations('customers');
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);

  // Form State — Section 1: Subscriber
  const [fullName, setFullName] = React.useState('');
  const [fullNameTamil, setFullNameTamil] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [altPhone, setAltPhone] = React.useState('');

  // Section 2: Address
  const [addressLine1, setAddressLine1] = React.useState('');
  const [addressLine2, setAddressLine2] = React.useState('');
  const [city, setCity] = React.useState('Perundurai');
  const [pincode, setPincode] = React.useState('638052');

  // Section 3: Nominee
  const [includeNominee, setIncludeNominee] = React.useState(false);
  const [nomineeName, setNomineeName] = React.useState('');
  const [nomineeRelation, setNomineeRelation] = React.useState('Spouse');
  const [nomineePhone, setNomineePhone] = React.useState('');
  const [nomineeAadhaarLast4, setNomineeAadhaarLast4] = React.useState('');

  // Section 4: Statutory (Optional)
  const [panNumber, setPanNumber] = React.useState('');
  const [aadhaarLast4, setAadhaarLast4] = React.useState('');

  // Status & Success Dialog State
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successData, setSuccessData] = React.useState<{
    id: string;
    code: string;
    name: string;
    phone: string;
  } | null>(null);

  // 1-Click Sample Data Filler for Zero-Friction Staff Testing
  const fillSampleSubscriber = () => {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    setFullName('S. Rathinasamy');
    setFullNameTamil('எஸ். ரத்தினசாமி');
    setPhone(`9842${randomSuffix.toString().slice(0, 6)}`);
    setAltPhone('9443123456');
    setAddressLine1('45/1, Erode Main Road');
    setAddressLine2('Near Panchayat Union Office');
    setCity('Perundurai');
    setPincode('638052');
    setIncludeNominee(true);
    setNomineeName('R. Saradha');
    setNomineeRelation('Spouse');
    setNomineePhone(`9843${randomSuffix.toString().slice(0, 6)}`);
    setNomineeAadhaarLast4('7812');
    setPanNumber('ABCDE1234F');
    setAadhaarLast4('4821');
    setErrorMsg(null);
  };

  // Reset form for next intake
  const resetForm = () => {
    setFullName('');
    setFullNameTamil('');
    setPhone('');
    setAltPhone('');
    setAddressLine1('');
    setAddressLine2('');
    setCity('Perundurai');
    setPincode('638052');
    setIncludeNominee(false);
    setNomineeName('');
    setNomineeRelation('Spouse');
    setNomineePhone('');
    setNomineeAadhaarLast4('');
    setPanNumber('');
    setAadhaarLast4('');
    setErrorMsg(null);
    setSuccessData(null);
  };

  // Mutation to create customer and link nominee
  const intakeMutation = useMutation({
    mutationFn: async () => {
      // 1. Validate primary fields
      if (!fullName.trim() || fullName.trim().length < 2) {
        throw new Error('Full Name must be at least 2 characters');
      }
      if (!/^\d{10}$/.test(phone.trim())) {
        throw new Error('Primary Mobile Phone must be exactly 10 digits');
      }
      if (!addressLine1.trim()) {
        throw new Error('Street Address Line 1 is required');
      }
      if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) {
        throw new Error('PIN Code must be exactly 6 digits');
      }
      if (panNumber.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.trim().toUpperCase())) {
        throw new Error('PAN must be in valid format (e.g. ABCDE1234F)');
      }
      if (aadhaarLast4.trim() && !/^\d{4}$/.test(aadhaarLast4.trim())) {
        throw new Error('Aadhaar must be strictly the last 4 digits (e.g. 4821)');
      }

      // 2. Validate nominee if included
      if (includeNominee) {
        if (!nomineeName.trim() || nomineeName.trim().length < 2) {
          throw new Error('Nominee Name must be at least 2 characters');
        }
        if (!/^\d{10}$/.test(nomineePhone.trim())) {
          throw new Error('Nominee Phone must be exactly 10 digits');
        }
        if (nomineeAadhaarLast4.trim() && !/^\d{4}$/.test(nomineeAadhaarLast4.trim())) {
          throw new Error('Nominee Aadhaar must be strictly the last 4 digits');
        }
      }

      // 3. Submit Customer payload
      const customerPayload: any = {
        fullName: fullName.trim(),
        fullNameTamil: fullNameTamil.trim() || undefined,
        phone: phone.trim(),
        altPhone: altPhone.trim() || undefined,
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || undefined,
        city: city.trim() || 'Perundurai',
        pincode: pincode.trim() || '638052',
        panNumber: panNumber.trim() ? panNumber.trim().toUpperCase() : undefined,
        aadhaarLast4: aadhaarLast4.trim() || undefined,
        branchId: activeBranchId || user?.branchId || undefined,
      };

      const customer = await unwrapApiResponse<any>(
        apiClient.POST('/api/v1/customers', { body: customerPayload })
      );

      // 4. Submit Nominee payload if entered
      if (includeNominee && nomineeName.trim() && customer?.id) {
        const nomineePayload: any = {
          fullName: nomineeName.trim(),
          relationship: nomineeRelation,
          phone: nomineePhone.trim(),
          aadhaarLast4: nomineeAadhaarLast4.trim() || undefined,
        };

        await unwrapApiResponse(
          apiClient.POST('/api/v1/customers/{id}/nominees', {
            params: { path: { id: customer.id } },
            body: nomineePayload,
          })
        );
      }

      return customer;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      setSuccessData({
        id: data.id,
        code: data.customerCode,
        name: data.fullName,
        phone: data.phone,
      });
    },
    onError: (err: any) => {
      if (err instanceof KumaranApiError && (err.statusCode === 409 || err.isConflict)) {
        setErrorMsg(t('phoneConflictAlert', { phone, code: 'EXISTING' }));
      } else {
        setErrorMsg(err.message || 'Failed to register subscriber');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    intakeMutation.mutate();
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Alert */}
        {errorMsg && (
          <Alert variant="destructive" className="border-rose-500/40 bg-rose-950/40 text-rose-300">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-xs font-bold">Registration Error</AlertTitle>
            <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
          </Alert>
        )}

        {/* Form Body Locked During In-Flight Submission */}
        <fieldset disabled={intakeMutation.isPending} className="space-y-6 disabled:opacity-75">
          {/* Section 1: Primary Subscriber Details */}
          <SubscriberDetailsSection
            fullName={fullName}
            setFullName={setFullName}
            fullNameTamil={fullNameTamil}
            setFullNameTamil={setFullNameTamil}
            phone={phone}
            setPhone={setPhone}
            altPhone={altPhone}
            setAltPhone={setAltPhone}
            onFillSample={fillSampleSubscriber}
          />

          {/* Section 2: Residential Address */}
          <AddressDetailsSection
            addressLine1={addressLine1}
            setAddressLine1={setAddressLine1}
            addressLine2={addressLine2}
            setAddressLine2={setAddressLine2}
            city={city}
            setCity={setCity}
            pincode={pincode}
            setPincode={setPincode}
          />

          {/* Section 3: Nominee Details (Optional Toggle) */}
          <NomineeDetailsSection
            includeNominee={includeNominee}
            setIncludeNominee={setIncludeNominee}
            nomineeName={nomineeName}
            setNomineeName={setNomineeName}
            nomineeRelation={nomineeRelation}
            setNomineeRelation={setNomineeRelation}
            nomineePhone={nomineePhone}
            setNomineePhone={setNomineePhone}
            nomineeAadhaarLast4={nomineeAadhaarLast4}
            setNomineeAadhaarLast4={setNomineeAadhaarLast4}
          />

          {/* Section 4: Statutory Tax & KYC (Optional per ADR-16) */}
          <KycTaxDetailsSection
            panNumber={panNumber}
            setPanNumber={setPanNumber}
            aadhaarLast4={aadhaarLast4}
            setAadhaarLast4={setAadhaarLast4}
          />
        </fieldset>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs"
            asChild
          >
            <Link href="/customers">Cancel</Link>
          </Button>

          <Button
            type="submit"
            disabled={intakeMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs min-w-[200px]"
          >
            {intakeMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>{t('submitting')}</span>
              </>
            ) : (
              <span>{t('submit')}</span>
            )}
          </Button>
        </div>
      </form>

      {/* Success Modal */}
      {successData && (
        <IntakeSuccessDialog
          isOpen={Boolean(successData)}
          customerId={successData.id}
          customerCode={successData.code}
          customerName={successData.name}
          phone={successData.phone}
          onClose={() => setSuccessData(null)}
          onRegisterAnother={resetForm}
        />
      )}
    </>
  );
}
