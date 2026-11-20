'use client';

import * as React from 'react';
import {
  FileText,
  Download,
  Loader2,
  FileCheck2,
  ScrollText,
  ShieldAlert,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  downloadFormIPdf,
  downloadFormIiPdf,
  downloadFormVPdf,
  downloadFormViiPdf,
} from '@/lib/pdf-download';
import { getErrorMessage } from '@/lib/api-client';

interface StatutoryFormsDropdownProps {
  chitGroupId: string;
  groupCode: string;
  status?: string;
  totalTickets?: number;
  subscribedCount?: number;
  compact?: boolean;
}

export function StatutoryFormsDropdown({
  chitGroupId,
  groupCode,
  status: _status,
  totalTickets: _totalTickets,
  subscribedCount: _subscribedCount,
  compact = false,
}: StatutoryFormsDropdownProps) {
  const [downloadingForm, setDownloadingForm] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleDownload = async (
    formType: 'FORM_I' | 'FORM_II' | 'FORM_V' | 'FORM_VII',
    filename: string,
  ) => {
    setDownloadingForm(formType);
    setErrorMessage(null);
    try {
      if (formType === 'FORM_I') {
        await downloadFormIPdf(chitGroupId, filename);
      } else if (formType === 'FORM_II') {
        await downloadFormIiPdf(chitGroupId, filename);
      } else if (formType === 'FORM_V') {
        await downloadFormVPdf(chitGroupId, filename);
      } else if (formType === 'FORM_VII') {
        await downloadFormViiPdf(chitGroupId, filename);
      }
    } catch (err: unknown) {
      setErrorMessage(getErrorMessage(err, `Failed to download ${formType}`));
    } finally {
      setDownloadingForm(null);
    }
  };

  return (
    <div className="relative inline-block">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(downloadingForm)}
            className={cn(
              'border-indigo-600/40 bg-indigo-950/20 text-indigo-300 hover:bg-indigo-900/30 text-xs font-semibold',
              compact && 'px-2.5 h-9 shrink-0'
            )}
            title="Download Statutory Registrar Forms (Tamil Nadu Chit Funds Rules, 1984)"
          >
            {downloadingForm ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400 shrink-0" />
            ) : (
              <ScrollText className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            )}
            {compact ? (
              <span className="ml-1.5 hidden sm:inline whitespace-nowrap">Forms</span>
            ) : (
              <span className="ml-1.5 whitespace-nowrap">Statutory Registrar Forms</span>
            )}
            <ChevronDown className="ml-1 h-3 w-3 opacity-60 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-2 space-y-1">
          <DropdownMenuLabel className="text-xs font-bold text-slate-300 px-2 py-1">
            Tamil Nadu Chit Funds Rules, 1984
            <p className="text-[10px] font-normal text-slate-400">
              Official pre-filled Government Registrar filing documents
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-slate-800" />

          {/* Form I */}
          <DropdownMenuItem
            onClick={() =>
              handleDownload('FORM_I', `form-i-sanction-${groupCode}.pdf`)
            }
            className="flex flex-col items-start gap-0.5 p-2 rounded-lg hover:bg-slate-800/80 cursor-pointer text-slate-200"
          >
            <div className="flex items-center gap-2 w-full font-medium text-xs text-indigo-300">
              <FileText className="h-3.5 w-3.5" />
              <span>Form I — Previous Sanction Application</span>
              <Download className="ml-auto h-3 w-3 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-400 pl-5.5">
              Sec 4(2) & Rule 3 with Annexure (12 Particulars)
            </p>
          </DropdownMenuItem>

          {/* Form II */}
          <DropdownMenuItem
            onClick={() =>
              handleDownload('FORM_II', `form-ii-registration-${groupCode}.pdf`)
            }
            className="flex flex-col items-start gap-0.5 p-2 rounded-lg hover:bg-slate-800/80 cursor-pointer text-slate-200"
          >
            <div className="flex items-center gap-2 w-full font-medium text-xs text-emerald-300">
              <FileCheck2 className="h-3.5 w-3.5" />
              <span>Form II — Chit Agreement Registration</span>
              <Download className="ml-auto h-3 w-3 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-400 pl-5.5">
              Sec 7 & Rule 5 registration filing pack
            </p>
          </DropdownMenuItem>

          {/* Form V */}
          <DropdownMenuItem
            onClick={() =>
              handleDownload('FORM_V', `form-v-declaration-${groupCode}.pdf`)
            }
            className="flex flex-col items-start gap-0.5 p-2 rounded-lg hover:bg-slate-800/80 cursor-pointer text-slate-200"
          >
            <div className="flex items-center gap-2 w-full font-medium text-xs text-amber-300">
              <ScrollText className="h-3.5 w-3.5" />
              <span>Form V — 100% Subscription Declaration</span>
              <Download className="ml-auto h-3 w-3 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-400 pl-5.5">
              Sec 9(1) & Rule 10 with enrolled subscriber roster
            </p>
          </DropdownMenuItem>

          {/* Form VII */}
          <DropdownMenuItem
            onClick={() =>
              handleDownload('FORM_VII', `form-vii-certificate-${groupCode}.pdf`)
            }
            className="flex flex-col items-start gap-0.5 p-2 rounded-lg hover:bg-slate-800/80 cursor-pointer text-slate-200"
          >
            <div className="flex items-center gap-2 w-full font-medium text-xs text-cyan-300">
              <FileText className="h-3.5 w-3.5" />
              <span>Form VII — Agreement Furnishing Certificate</span>
              <Download className="ml-auto h-3 w-3 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-400 pl-5.5">
              Sec 10(2) & Rule 12 statutory compliance certificate
            </p>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {errorMessage && (
        <div className="absolute top-full right-0 mt-2 z-50 flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-950/90 px-3 py-1.5 text-xs text-rose-300 shadow-xl">
          <ShieldAlert className="h-3.5 w-3.5 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
