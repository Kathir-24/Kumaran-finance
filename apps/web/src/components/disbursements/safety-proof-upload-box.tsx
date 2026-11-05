'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle, ExternalLink, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getApiBaseUrl, getStoredAccessToken } from '@/lib/api-client';

interface SafetyProofUploadBoxProps {
  auctionId: string;
  securityDocS3Key: string | null;
  isAlreadyVerified: boolean;
  onUploaded: (s3Key: string, fileName?: string) => void;
  onError: (msg: string) => void;
}

export function SafetyProofUploadBox({
  auctionId,
  securityDocS3Key,
  isAlreadyVerified,
  onUploaded,
  onError,
}: SafetyProofUploadBoxProps) {
  const t = useTranslations('disbursements');
  const [uploading, setUploading] = useState(false);
  const [inspectingUrl, setInspectingUrl] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      onError('File size exceeds 10MB limit. Please upload a smaller file.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = getStoredAccessToken();
      const res = await fetch(
        `${getApiBaseUrl()}/api/v1/disbursements/auction/${auctionId}/upload-safety-proof`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to upload safety proof file');
      }
      const json = await res.json();
      const result = json?.data ?? json;
      onUploaded(result.securityDocS3Key, result.fileName || file.name);
    } catch (err: any) {
      onError(err.message || 'Error uploading file to S3');
    } finally {
      setUploading(false);
    }
  };

  const handleInspectPresignedUrl = async () => {
    setInspectingUrl(true);
    try {
      const token = getStoredAccessToken();
      const res = await fetch(
        `${getApiBaseUrl()}/api/v1/disbursements/auction/${auctionId}/safety-proof-url`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to fetch presigned URL');
      }
      const json = await res.json();
      const data = json?.data ?? json;
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      onError(err.message || 'Failed to open document preview');
    } finally {
      setInspectingUrl(false);
    }
  };

  return (
    <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/60 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-300">
          {t('uploadScanLabel')}
        </span>
        {securityDocS3Key && (
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[11px] gap-1">
            <CheckCircle className="w-3 h-3" /> S3 Attached
          </Badge>
        )}
      </div>

      {!isAlreadyVerified && (
        <div>
          <input
            type="file"
            id="safety-proof-upload"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            onChange={handleFileUpload}
            disabled={uploading}
            className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
          />
          <p className="text-[11px] text-slate-500 mt-1">{t('uploadScanHelper')}</p>
        </div>
      )}

      {securityDocS3Key && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleInspectPresignedUrl}
          disabled={inspectingUrl}
          className="border-slate-700 hover:bg-slate-800 text-slate-200 text-xs gap-1.5 w-full mt-2"
        >
          {inspectingUrl ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ExternalLink className="w-3.5 h-3.5" />
          )}
          <span>{inspectingUrl ? t('scanViewing') : t('viewScan')}</span>
        </Button>
      )}
    </div>
  );
}
