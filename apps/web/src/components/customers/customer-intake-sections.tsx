'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { User, MapPin, Users2, FileCheck2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export const RELATIONSHIPS = [
  { value: 'Spouse', labelKey: 'relSpouse' },
  { value: 'Son', labelKey: 'relSon' },
  { value: 'Daughter', labelKey: 'relDaughter' },
  { value: 'Father', labelKey: 'relFather' },
  { value: 'Mother', labelKey: 'relMother' },
  { value: 'Brother', labelKey: 'relBrother' },
  { value: 'Sister', labelKey: 'relSister' },
  { value: 'Other', labelKey: 'relOther' },
] as const;

export interface SubscriberSectionProps {
  fullName: string;
  setFullName: (v: string) => void;
  fullNameTamil: string;
  setFullNameTamil: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  altPhone: string;
  setAltPhone: (v: string) => void;
  onFillSample: () => void;
}

export function SubscriberDetailsSection(props: SubscriberSectionProps) {
  const t = useTranslations('customers');
  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-emerald-400" />
            <CardTitle className="text-sm font-bold text-slate-100">{t('sectionSubscriber')}</CardTitle>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={props.onFillSample}
            className="h-7 text-[11px] border-emerald-500/30 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50"
          >
            <Sparkles className="mr-1 h-3 w-3 text-emerald-400" />
            <span>{t('fillSample')}</span>
          </Button>
        </div>
        <CardDescription className="text-xs text-slate-400">
          Mandatory fields required for physical ledger recordkeeping
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">{t('fullNameLabel')}</label>
          <Input
            required
            value={props.fullName}
            onChange={(e) => props.setFullName(e.target.value)}
            placeholder={t('fullNamePlaceholder')}
            className="h-9 text-xs border-slate-700 bg-slate-950 text-slate-100"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">{t('fullNameTamilLabel')}</label>
          <Input
            value={props.fullNameTamil}
            onChange={(e) => props.setFullNameTamil(e.target.value)}
            placeholder={t('fullNameTamilPlaceholder')}
            className="h-9 text-xs border-slate-700 bg-slate-950 text-slate-100 font-tamil"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">{t('phoneLabel')}</label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">+91</span>
            <Input
              required
              maxLength={10}
              value={props.phone}
              onChange={(e) => props.setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder={t('phonePlaceholder')}
              className="pl-12 h-9 text-xs font-mono border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">{t('altPhoneLabel')}</label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">+91</span>
            <Input
              maxLength={10}
              value={props.altPhone}
              onChange={(e) => props.setAltPhone(e.target.value.replace(/\D/g, ''))}
              placeholder={t('altPhonePlaceholder')}
              className="pl-12 h-9 text-xs font-mono border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export interface AddressSectionProps {
  addressLine1: string;
  setAddressLine1: (v: string) => void;
  addressLine2: string;
  setAddressLine2: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  pincode: string;
  setPincode: (v: string) => void;
  branchId?: string;
  setBranchId?: (v: string) => void;
  branches?: { id: string; code?: string; name: string }[];
}

export function AddressDetailsSection(props: AddressSectionProps) {
  const t = useTranslations('customers');
  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-400" />
          <CardTitle className="text-sm font-bold text-slate-100">{t('sectionAddress')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">{t('address1Label')}</label>
          <Input
            required
            value={props.addressLine1}
            onChange={(e) => props.setAddressLine1(e.target.value)}
            placeholder={t('address1Placeholder')}
            className="h-9 text-xs border-slate-700 bg-slate-950 text-slate-100"
          />
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">{t('address2Label')}</label>
          <Input
            value={props.addressLine2}
            onChange={(e) => props.setAddressLine2(e.target.value)}
            placeholder={t('address2Placeholder')}
            className="h-9 text-xs border-slate-700 bg-slate-950 text-slate-100"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">{t('cityLabel')}</label>
          <Input
            value={props.city}
            onChange={(e) => props.setCity(e.target.value)}
            className="h-9 text-xs border-slate-700 bg-slate-950 text-slate-100"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">{t('pincodeLabel')}</label>
          <Input
            maxLength={6}
            value={props.pincode}
            onChange={(e) => props.setPincode(e.target.value.replace(/\D/g, ''))}
            className="h-9 text-xs font-mono border-slate-700 bg-slate-950 text-slate-100"
          />
        </div>
        {props.setBranchId && (
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">{t('branchLabel')}</label>
            <select
              value={props.branchId || ''}
              onChange={(e) => props.setBranchId?.(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">{t('homeBranch')} (PRD HO)</option>
              {props.branches?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code ? `${b.code} - ${b.name}` : b.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface NomineeSectionProps {
  includeNominee: boolean;
  setIncludeNominee: (v: boolean) => void;
  nomineeName: string;
  setNomineeName: (v: string) => void;
  nomineeRelation: string;
  setNomineeRelation: (v: string) => void;
  nomineePhone: string;
  setNomineePhone: (v: string) => void;
  nomineeAadhaarLast4: string;
  setNomineeAadhaarLast4: (v: string) => void;
}

export function NomineeDetailsSection(props: NomineeSectionProps) {
  const t = useTranslations('customers');
  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users2 className="h-4 w-4 text-purple-400" />
            <CardTitle className="text-sm font-bold text-slate-100">{t('sectionNominee')}</CardTitle>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-purple-300">
            <input
              type="checkbox"
              checked={props.includeNominee}
              onChange={(e) => props.setIncludeNominee(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-purple-500 focus:ring-0"
            />
            <span>{t('enableNominee')}</span>
          </label>
        </div>
      </CardHeader>
      {props.includeNominee && (
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">{t('nomineeNameLabel')}</label>
            <Input
              required={props.includeNominee}
              value={props.nomineeName}
              onChange={(e) => props.setNomineeName(e.target.value)}
              placeholder="Nominee full name"
              className="h-9 text-xs border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">{t('nomineeRelationLabel')}</label>
            <select
              value={props.nomineeRelation}
              onChange={(e) => props.setNomineeRelation(e.target.value)}
              className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 focus:outline-none"
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.labelKey)} ({r.value})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">{t('nomineePhoneLabel')}</label>
            <Input
              required={props.includeNominee}
              maxLength={10}
              value={props.nomineePhone}
              onChange={(e) => props.setNomineePhone(e.target.value.replace(/\D/g, ''))}
              placeholder="9842798765"
              className="h-9 text-xs font-mono border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">{t('nomineeAadhaarLabel')}</label>
            <Input
              maxLength={4}
              value={props.nomineeAadhaarLast4}
              onChange={(e) => props.setNomineeAadhaarLast4(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 7812"
              className="h-9 text-xs font-mono border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export interface KycSectionProps {
  panNumber: string;
  setPanNumber: (v: string) => void;
  aadhaarLast4: string;
  setAadhaarLast4: (v: string) => void;
}

export function KycTaxDetailsSection(props: KycSectionProps) {
  const t = useTranslations('customers');
  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-amber-400" />
          <CardTitle className="text-sm font-bold text-slate-100">{t('sectionKyc')}</CardTitle>
        </div>
        <CardDescription className="text-xs text-slate-400">
          {t('adr16Notice')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">{t('panLabel')}</label>
          <Input
            maxLength={10}
            value={props.panNumber}
            onChange={(e) => props.setPanNumber(e.target.value.toUpperCase())}
            placeholder={t('panPlaceholder')}
            className="h-9 text-xs font-mono uppercase border-slate-700 bg-slate-950 text-slate-100"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">{t('aadhaarLabel')}</label>
          <Input
            maxLength={4}
            value={props.aadhaarLast4}
            onChange={(e) => props.setAadhaarLast4(e.target.value.replace(/\D/g, ''))}
            placeholder={t('aadhaarPlaceholder')}
            className="h-9 text-xs font-mono border-slate-700 bg-slate-950 text-slate-100"
          />
        </div>
      </CardContent>
    </Card>
  );
}
