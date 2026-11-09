'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  Check,
  Copy,
  FileText,
  ShieldCheck,
  Clock,
  Ticket,
  Users2,
  UserX,
  Phone,
  MapPin,
} from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface CustomerRowData {
  id: string;
  customerCode: string;
  fullName: string;
  fullNameTamil?: string | null;
  phone: string;
  altPhone?: string | null;
  addressLine1?: string;
  city: string;
  pincode: string;
  isKycVerified: boolean;
  branch?: {
    id: string;
    code: string;
    name: string;
  } | null;
  _count?: {
    tickets: number;
    nominees: number;
    documents: number;
  };
  createdAt: string;
}

export interface CustomerTableProps {
  customers: CustomerRowData[];
  isLoading?: boolean;
  onClearFilters?: () => void;
}

export function CustomerTable({
  customers,
  isLoading = false,
  onClearFilters,
}: CustomerTableProps) {
  const t = useTranslations('customers');
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  const copyCustomerCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-x-auto shadow-sm">
        <Table className="min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">{t('colCode')}</TableHead>
              <TableHead>{t('colName')}</TableHead>
              <TableHead>{t('colContact')}</TableHead>
              <TableHead className="w-32">{t('colKyc')}</TableHead>
              <TableHead>{t('colHoldings')}</TableHead>
              <TableHead className="w-32">{t('colRegistered')}</TableHead>
              <TableHead className="text-right w-28">{t('colActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }).map((_, idx) => (
              <TableRow key={idx} className="animate-pulse">
                <TableCell>
                  <div className="h-5 w-24 rounded bg-slate-800" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-36 rounded bg-slate-800 mb-1" />
                  <div className="h-3.5 w-24 rounded bg-slate-850" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-28 rounded bg-slate-800 mb-1" />
                  <div className="h-3.5 w-20 rounded bg-slate-850" />
                </TableCell>
                <TableCell>
                  <div className="h-6 w-20 rounded-full bg-slate-800" />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1.5">
                    <div className="h-5 w-16 rounded bg-slate-800" />
                    <div className="h-5 w-16 rounded bg-slate-800" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="h-4 w-20 rounded bg-slate-800" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="h-8 w-20 rounded bg-slate-800 ml-auto" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
        <UserX className="mx-auto h-12 w-12 text-slate-500 mb-3" />
        <h3 className="text-base font-semibold text-slate-200">
          {t('noCustomersFound')}
        </h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          {t('noCustomersDesc')}
        </p>
        {onClearFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearFilters}
            className="mt-4 border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
          >
            {t('clearFilters')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-x-auto shadow-sm">
      <Table className="min-w-[800px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">{t('colCode')}</TableHead>
            <TableHead>{t('colName')}</TableHead>
            <TableHead>{t('colContact')}</TableHead>
            <TableHead className="w-32">{t('colKyc')}</TableHead>
            <TableHead>{t('colHoldings')}</TableHead>
            <TableHead className="w-32">{t('colRegistered')}</TableHead>
            <TableHead className="text-right w-28">{t('colActions')}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {customers.map((cust) => {
            const ticketCount = cust._count?.tickets || 0;
            const nomineeCount = cust._count?.nominees || 0;
            const docCount = cust._count?.documents || 0;

            return (
              <TableRow
                key={cust.id}
                className="hover:bg-slate-850/60 transition-colors group"
              >
                {/* Customer Code */}
                <TableCell className="font-mono text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-200">
                      {cust.customerCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyCustomerCode(cust.customerCode)}
                      className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 rounded opacity-0 group-hover:opacity-100"
                      title="Copy customer code"
                    >
                      {copiedCode === cust.customerCode ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </TableCell>

                {/* Bilingual Name */}
                <TableCell>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-100 text-xs">
                      {cust.fullName}
                    </p>
                    {cust.fullNameTamil && (
                      <p className="text-[11px] font-medium text-emerald-400/90 font-tamil">
                        {cust.fullNameTamil}
                      </p>
                    )}
                  </div>
                </TableCell>

                {/* Contact & Town */}
                <TableCell>
                  <div className="space-y-0.5 text-xs">
                    <div className="flex items-center gap-1 text-slate-300 font-mono">
                      <Phone className="h-3 w-3 text-slate-500" />
                      <span>+91 {cust.phone}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <MapPin className="h-3 w-3 text-slate-500" />
                      <span className="truncate max-w-[150px]">
                        {cust.city || 'Perundurai'}
                        {cust.pincode ? ` - ${cust.pincode}` : ''}
                      </span>
                    </div>
                  </div>
                </TableCell>

                {/* KYC Status Badge */}
                <TableCell>
                  {cust.isKycVerified ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[11px] font-medium flex items-center gap-1 py-0.5 w-fit"
                    >
                      <ShieldCheck className="h-3 w-3 text-emerald-400" />
                      <span>{t('kycVerified')}</span>
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11px] font-medium flex items-center gap-1 py-0.5 w-fit"
                    >
                      <Clock className="h-3 w-3 text-amber-400" />
                      <span>{t('kycPending')}</span>
                    </Badge>
                  )}
                </TableCell>

                {/* Holdings & Records Badges */}
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span
                      className={cn(
                        'flex items-center gap-1 rounded px-1.5 py-0.5 font-medium border',
                        ticketCount > 0
                          ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
                          : 'border-slate-800 bg-slate-950 text-slate-500'
                      )}
                      title={t('ticketsCount', { count: ticketCount })}
                    >
                      <Ticket className="h-3 w-3 text-indigo-400" />
                      <span>{ticketCount}</span>
                    </span>

                    <span
                      className="flex items-center gap-1 rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-slate-400 font-medium"
                      title={t('nomineesCount', { count: nomineeCount })}
                    >
                      <Users2 className="h-3 w-3 text-slate-500" />
                      <span>{nomineeCount}</span>
                    </span>

                    <span
                      className="flex items-center gap-1 rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-slate-400 font-medium"
                      title={t('documentsCount', { count: docCount })}
                    >
                      <FileText className="h-3 w-3 text-slate-500" />
                      <span>{docCount}</span>
                    </span>
                  </div>
                </TableCell>

                {/* Registered Date */}
                <TableCell className="text-xs text-slate-400">
                  {formatDate(cust.createdAt)}
                </TableCell>

                {/* Actions */}
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-slate-300 hover:text-emerald-400 hover:bg-slate-800"
                    asChild
                  >
                    <Link href={`/customers/${cust.id}`}>
                      <span>{t('viewProfile')}</span>
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
