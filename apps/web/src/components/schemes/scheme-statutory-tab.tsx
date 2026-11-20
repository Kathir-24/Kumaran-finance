'use client';

import * as React from 'react';
import {
  FileText,
  FileCheck2,
  ScrollText,
  Download,
  Loader2,
  ShieldCheck,
  Building2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  downloadFormIPdf,
  downloadFormIiPdf,
  downloadFormVPdf,
  downloadFormViiPdf,
} from '@/lib/pdf-download';
import { getErrorMessage } from '@/lib/api-client';

interface SchemeStatutoryTabProps {
  chitGroupId: string;
  groupCode: string;
  groupName: string;
  status: string;
  totalTickets: number;
  subscribedCount: number;
  sanctionOrderNumber?: string | null;
  sanctionDate?: string | null;
}

export function SchemeStatutoryTab({
  chitGroupId,
  groupCode,
  groupName: _groupName,
  status,
  totalTickets,
  subscribedCount,
  sanctionOrderNumber,
  sanctionDate: _sanctionDate,
}: SchemeStatutoryTabProps) {
  const [downloadingForm, setDownloadingForm] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const isFull = subscribedCount >= totalTickets;
  const isRegisteredOrActive = status === 'REGISTERED' || status === 'ACTIVE' || status === 'COMPLETED';

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

  const forms = [
    {
      type: 'FORM_I' as const,
      name: 'Form I — Previous Sanction Application',
      legalRef: 'Section 4(2) & Rule 3 (Gazette Pages 43–46)',
      description:
        'Official application to State Government / Registrar of Chits for previous sanction to commence or conduct the chit, including Annexure Statement of 12 Particulars with full partner, banking, and scheme particulars.',
      filename: `form-i-sanction-${groupCode}.pdf`,
      icon: FileText,
      badge: 'Prior Sanction',
      badgeColor: 'border-indigo-500/30 bg-indigo-950/40 text-indigo-300',
      readyStatus: 'Ready to file / print',
    },
    {
      type: 'FORM_II' as const,
      name: 'Form II — Chit Agreement Registration',
      legalRef: 'Section 7 & Rule 5 (Gazette Pages 49–50)',
      description:
        'Formal application for registration of the Chit Agreement in duplicate, with verified running chits count, Section 13 aggregate ceiling check, and certified copy reference of Form I-B sanction.',
      filename: `form-ii-registration-${groupCode}.pdf`,
      icon: FileCheck2,
      badge: sanctionOrderNumber ? 'Sanctioned' : 'Filing Pack',
      badgeColor: 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300',
      readyStatus: sanctionOrderNumber ? `Sanction Ref: ${sanctionOrderNumber}` : 'Ready for filing',
    },
    {
      type: 'FORM_V' as const,
      name: 'Form V — 100% Subscription Declaration',
      legalRef: 'Section 9(1) & Rule 10 (Gazette Page 55)',
      description:
        'Statutory declaration confirming that all tickets specified in the chit agreement are 100% fully subscribed, accompanied by the complete subscriber enrollment roster.',
      filename: `form-v-declaration-${groupCode}.pdf`,
      icon: ScrollText,
      badge: isFull ? '100% Subscribed' : `${subscribedCount}/${totalTickets} Tickets`,
      badgeColor: isFull
        ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
        : 'border-amber-500/30 bg-amber-950/40 text-amber-300',
      readyStatus: isFull
        ? 'Full enrollment verified (Ready for Commencement Certificate)'
        : `${totalTickets - subscribedCount} subscriber tickets pending allocation`,
    },
    {
      type: 'FORM_VII' as const,
      name: 'Form VII — Agreement Furnishing Certificate',
      legalRef: 'Section 10(2) & Rule 12 (Gazette Page 57)',
      description:
        'Foreman compliance certificate certifying that a true copy of the registered chit agreement was furnished to every subscriber, noting the certificate of commencement and first draw dates.',
      filename: `form-vii-certificate-${groupCode}.pdf`,
      icon: ShieldCheck,
      badge: isRegisteredOrActive ? 'Active Scheme' : 'Pre-Activation',
      badgeColor: isRegisteredOrActive
        ? 'border-cyan-500/30 bg-cyan-950/40 text-cyan-300'
        : 'border-slate-700 bg-slate-800 text-slate-300',
      readyStatus: isRegisteredOrActive
        ? 'Ready to print for statutory compliance record'
        : 'Generates automatically with scheme schedule dates',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Informational Header */}
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-indigo-500/20 p-2 text-indigo-400 shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Tamil Nadu Chit Funds Rules, 1984 — Statutory Regulatory Forms
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Pre-filled print-ready statutory PDF documents for filing with the Registrar of Chits.
                All blanks (firm name, partners, addresses, fees, aggregate chit amounts, subscriber rosters)
                are populated automatically from the database.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <Badge variant="outline" className="border-indigo-500/40 text-indigo-300 text-xs">
              4 Forms Ready
            </Badge>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/60 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Grid of 4 Forms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {forms.map((f) => {
          const Icon = f.icon;
          const isCurrentDownloading = downloadingForm === f.type;
          return (
            <Card
              key={f.type}
              className="border-slate-800 bg-slate-900/80 shadow-md hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {f.legalRef}
                  </span>
                  <Badge variant="outline" className={f.badgeColor}>
                    {f.badge}
                  </Badge>
                </div>
                <CardTitle className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span>{f.name}</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  {f.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-0 space-y-3">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span className="truncate">{f.readyStatus}</span>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(downloadingForm)}
                  onClick={() => handleDownload(f.type, f.filename)}
                  className="w-full justify-center gap-2 border-indigo-600/40 bg-indigo-950/20 hover:bg-indigo-900/30 text-indigo-300 text-xs font-semibold h-9"
                >
                  {isCurrentDownloading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                      <span>Generating PDF...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Download {f.name.split('—')[0].trim()} PDF</span>
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
