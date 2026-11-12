'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldAlert,
  FileCheck2,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SafetyProofUploadBox } from './safety-proof-upload-box';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface WinnerSafetyData {
  id: string;
  disbursementStatus: string;
  isSecurityRequired?: boolean;
  securityType?: string | null;
  blankChequeDetails?: string | null;
  agreementSigned?: boolean;
  nomineeSigned?: boolean;
  securityDocS3Key?: string | null;
  verifiedByUserId?: string | null;
  verifiedAt?: string | null;
  notes?: string | null;
}

interface SafetyProofChecklistProps {
  auctionId: string;
  winner: WinnerSafetyData;
  makerName?: string | null;
  onSuccess?: () => void;
}

export function SafetyProofChecklist({
  auctionId,
  winner,
  makerName,
  onSuccess,
}: SafetyProofChecklistProps) {
  const t = useTranslations('disbursements');
  const queryClient = useQueryClient();

  const isAlreadyVerified =
    winner.disbursementStatus !== 'PENDING_VERIFICATION';

  const [agreementSigned, setAgreementSigned] = useState(
    Boolean(winner.agreementSigned ?? isAlreadyVerified),
  );
  const [nomineeSigned, setNomineeSigned] = useState(
    Boolean(winner.nomineeSigned ?? isAlreadyVerified),
  );
  const [isSecurityRequired, setIsSecurityRequired] = useState(
    Boolean(winner.isSecurityRequired),
  );
  const [securityType, setSecurityType] = useState(
    winner.securityType || 'BLANK_CHEQUE',
  );
  const [blankChequeDetails, setBlankChequeDetails] = useState(
    winner.blankChequeDetails || '',
  );
  const [securityDocS3Key, setSecurityDocS3Key] = useState<string | null>(
    winner.securityDocS3Key || null,
  );
  const [notes, setNotes] = useState(winner.notes || '');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Verify Safety Proof Mutation (Maker Transition)
  const verifyMutation = useMutation({
    mutationFn: async () => {
      return unwrapApiResponse(
        apiClient.POST('/api/v1/disbursements/auction/{auctionId}/verify-safety-proof', {
          params: { path: { auctionId } },
          body: {
            isSecurityRequired,
            securityType: isSecurityRequired
              ? (securityType as 'BLANK_CHEQUE' | 'PROMISSORY_NOTE' | 'AGREEMENT_ONLY' | 'NONE')
              : undefined,
            blankChequeDetails: isSecurityRequired ? blankChequeDetails : undefined,
            agreementSigned,
            nomineeSigned,
            securityDocS3Key: securityDocS3Key || undefined,
            notes: notes.trim() || undefined,
          },
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.disbursements.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.disbursements.detail(auctionId),
      });
      setStatusMessage({
        type: 'success',
        text: t('verifySuccess'),
      });
      onSuccess?.();
    },
    onError: (err: any) => {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to verify safety proof',
      });
    },
  });

  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-lg">
      <CardHeader className="border-b border-slate-800/80 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-emerald-400" />
            <CardTitle className="text-base font-semibold text-slate-100">
              {t('safetyChecklist')}
            </CardTitle>
          </div>
          {isAlreadyVerified && (
            <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-400 gap-1 font-mono text-xs">
              <CheckCircle className="w-3 h-3" />
              {t('statusVerifiedMaker')}
            </Badge>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-1">{t('bannerDesc')}</p>
      </CardHeader>

      <CardContent className="pt-5 space-y-5">
        {statusMessage && (
          <div
            className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Checkbox 1: Winner Agreement */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/40 cursor-pointer hover:bg-slate-950/70 transition-colors">
          <input
            type="checkbox"
            checked={agreementSigned}
            disabled={isAlreadyVerified}
            onChange={(e) => setAgreementSigned(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
          />
          <div>
            <div className="text-sm font-medium text-slate-200">
              {t('agreementSignedLabel')}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {t('agreementSignedDesc')}
            </div>
          </div>
        </label>

        {/* Checkbox 2: Nominee Guarantee */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/40 cursor-pointer hover:bg-slate-950/70 transition-colors">
          <input
            type="checkbox"
            checked={nomineeSigned}
            disabled={isAlreadyVerified}
            onChange={(e) => setNomineeSigned(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
          />
          <div>
            <div className="text-sm font-medium text-slate-200">
              {t('nomineeSignedLabel')}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {t('nomineeSignedDesc')}
            </div>
          </div>
        </label>

        {/* Toggle 3: On-Demand Security Collateral */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/40 cursor-pointer hover:bg-slate-950/70 transition-colors">
          <input
            type="checkbox"
            checked={isSecurityRequired}
            disabled={isAlreadyVerified}
            onChange={(e) => setIsSecurityRequired(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
          />
          <div>
            <div className="text-sm font-medium text-slate-200">
              {t('isSecurityRequiredLabel')}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {t('isSecurityRequiredDesc')}
            </div>
          </div>
        </label>

        {/* Conditional Security Collateral Inputs */}
        {isSecurityRequired && (
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/60 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {t('securityTypeLabel')}
              </label>
              <select
                value={securityType}
                disabled={isAlreadyVerified}
                onChange={(e) => setSecurityType(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-800 bg-slate-900 px-3 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="BLANK_CHEQUE">Signed Blank Cheques (வங்கி காசோலை)</option>
                <option value="SIGNED_AGREEMENT">Special Signed Undertaking (ஒப்பந்த பத்திரம்)</option>
                <option value="PROMISSORY_NOTE">Promissory Note (கடன் உறுதிமொழி பத்திரம்)</option>
                <option value="OTHER">Other Security Instrument (பிற ஆவணம்)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {t('blankChequeDetailsLabel')}
              </label>
              <Input
                value={blankChequeDetails}
                disabled={isAlreadyVerified}
                onChange={(e) => setBlankChequeDetails(e.target.value)}
                placeholder={t('blankChequeDetailsPlaceholder')}
                className="text-xs"
              />
            </div>
          </div>
        )}

        {/* Private S3 File Upload Box */}
        <SafetyProofUploadBox
          auctionId={auctionId}
          securityDocS3Key={securityDocS3Key}
          isAlreadyVerified={isAlreadyVerified}
          onUploaded={(key, name) => {
            setSecurityDocS3Key(key);
            setStatusMessage({
              type: 'success',
              text: `Uploaded "${name}" to private S3 successfully.`,
            });
          }}
          onError={(msg) => {
            setStatusMessage({ type: 'error', text: msg });
          }}
        />

        {/* Remarks / Observations */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            {t('notesLabel')}
          </label>
          <Textarea
            value={notes}
            disabled={isAlreadyVerified}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('notesPlaceholder')}
            rows={2}
            className="text-xs"
          />
        </div>

        {/* Stamp or Action Button */}
        {isAlreadyVerified ? (
          <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 text-xs text-blue-300 flex items-center justify-between">
            <span>{t('verifiedByStamp', { name: makerName || 'Foreman Maker' })}</span>
            {winner.verifiedAt && (
              <span className="font-mono text-[11px] text-blue-400">
                {new Date(winner.verifiedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        ) : (
          <Button
            type="button"
            onClick={() => verifyMutation.mutate()}
            disabled={!agreementSigned || !nomineeSigned || verifyMutation.isPending}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2.5 shadow-md gap-2"
          >
            {verifyMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileCheck2 className="w-4 h-4" />
            )}
            <span>{verifyMutation.isPending ? t('submitting') : t('submitVerify')}</span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
