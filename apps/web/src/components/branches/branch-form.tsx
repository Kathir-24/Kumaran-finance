'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Building,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  Phone,
  Sparkles,
} from 'lucide-react';
import { apiClient, unwrapApiResponse, KumaranApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

export function BranchForm() {
  const t = useTranslations('branches');
  const router = useRouter();
  const queryClient = useQueryClient();

  // Form State
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [nameTamil, setNameTamil] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Field validation states
  const isPhoneValid = React.useMemo(() => {
    if (!phone) return true;
    return INDIAN_PHONE_REGEX.test(phone.trim());
  }, [phone]);

  const isFormValid =
    code.trim().length >= 2 &&
    name.trim().length >= 3 &&
    address.trim().length >= 5 &&
    INDIAN_PHONE_REGEX.test(phone.trim());

  // Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null);
      const cleanPhone = phone.trim();
      if (!INDIAN_PHONE_REGEX.test(cleanPhone)) {
        throw new Error(t('phoneInvalid'));
      }

      return unwrapApiResponse(
        apiClient.POST('/api/v1/branches', {
          body: {
            code: code.trim().toUpperCase(),
            name: name.trim(),
            nameTamil: nameTamil.trim() || undefined,
            address: address.trim(),
            phone: cleanPhone,
          },
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
      router.push('/branches');
    },
    onError: (err: any) => {
      if (err instanceof KumaranApiError && err.statusCode === 409) {
        setErrorMsg(t('conflictError', { code: code.trim().toUpperCase() }));
      } else {
        setErrorMsg(err.message || 'Failed to create branch');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || createMutation.isPending) return;
    createMutation.mutate();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Input Form (7 cols) */}
      <div className="lg:col-span-7 space-y-6">
        <Card className="border-slate-800 bg-slate-900/80 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base text-slate-100 flex items-center gap-2">
              <Building className="h-5 w-5 text-emerald-400" />
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

              {/* Branch Code */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">{t('codeLabel')}</label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder={t('codePlaceholder')}
                  maxLength={10}
                  className="font-mono uppercase bg-slate-950 border-slate-700 text-slate-100 focus:border-emerald-500"
                  required
                />
                <p className="text-[11px] text-slate-500">{t('codeHelp')}</p>
              </div>

              {/* English Name */}
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

              {/* Tamil Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">{t('nameTamilLabel')}</label>
                <Input
                  value={nameTamil}
                  onChange={(e) => setNameTamil(e.target.value)}
                  placeholder={t('nameTamilPlaceholder')}
                  className="bg-slate-950 border-slate-700 text-slate-100 focus:border-emerald-500"
                />
              </div>

              {/* Physical Street Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">{t('addressLabel')}</label>
                <Textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t('addressPlaceholder')}
                  rows={3}
                  className="bg-slate-950 border-slate-700 text-slate-100 focus:border-emerald-500 text-xs resize-none"
                  required
                />
              </div>

              {/* Contact Phone (ADR-18) */}
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
                {!isPhoneValid && phone.length > 0 && (
                  <p className="text-[11px] text-rose-400">{t('phoneInvalid')}</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/branches')}
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

      {/* Right Column: Live Official Preview Card (5 cols) */}
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
            {/* Mock Stationery Header */}
            <div className="rounded-xl border border-slate-700/60 bg-gradient-to-br from-slate-900 to-slate-950 p-4 space-y-3 shadow-inner">
              <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                <div>
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest font-mono">
                    KUMARAN CHITS
                  </div>
                  <div className="text-[10px] text-slate-400">குமரன் சிட்ஸ் ஃபைனான்ஸ்</div>
                </div>
                <span className="font-mono text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded">
                  {code.trim().toUpperCase() || 'CODE'}
                </span>
              </div>

              <div>
                <div className="text-sm font-bold text-slate-100">
                  {name.trim() || 'Branch Name (English)'}
                </div>
                {nameTamil.trim() && (
                  <div className="text-xs text-slate-400 font-sans mt-0.5">
                    {nameTamil.trim()}
                  </div>
                )}
              </div>

              <div className="text-[11px] text-slate-300 space-y-1 pt-1">
                <div className="flex items-start gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                  <span className="line-clamp-2">
                    {address.trim() || 'Physical street address, town, and PIN code'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300 pt-1">
                  <Phone className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  <span>+91 {phone.trim() || 'XXXXXXXXXX'}</span>
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-2 flex items-center justify-between text-[10px] text-slate-500">
                <span>Receipt Series: KC-REC-{(code.trim() || 'BR').toUpperCase()}-...</span>
                <span className="text-emerald-400/90 font-mono">STATUS: ACTIVE</span>
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3 text-[11px] text-amber-200/90 leading-relaxed">
              <p className="font-semibold text-amber-300">ADR-01 & ADR-02 Compliance Note</p>
              <p className="mt-1 text-slate-400">
                Branch creation operates within the single-company tenancy of Kumaran Finance. Zero
                multi-tenant schema overhead exists.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
