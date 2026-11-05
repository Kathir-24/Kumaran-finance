'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Upload,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Clock,
  Loader2,
  AlertCircle,
  FileCheck2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient, unwrapApiResponse, getApiBaseUrl, getStoredAccessToken } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore, type AuthState } from '@/stores/auth-store';

export interface CustomerDocument {
  id: string;
  docType: 'AADHAAR_FRONT' | 'AADHAAR_BACK' | 'PAN' | 'PHOTO' | 'SIGNATURE' | string;
  fileName: string;
  verified: boolean;
  uploadedAt: string;
}

export interface CustomerDocumentsCardProps {
  customerId: string;
  documents: CustomerDocument[];
}

export function CustomerDocumentsCard({ customerId, documents }: CustomerDocumentsCardProps) {
  const t = useTranslations('customers');
  const queryClient = useQueryClient();
  const user = useAuthStore((s: AuthState) => s.user);

  const canUpload = user?.roles?.some((role: string) =>
    ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'COLLECTION_AGENT'].includes(role),
  );
  const canDelete = user?.roles?.some((role: string) =>
    ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'].includes(role),
  );

  const [isUploadOpen, setIsUploadOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<CustomerDocument | null>(null);
  const [viewingDocId, setViewingDocId] = React.useState<string | null>(null);

  // Upload Form State
  const [docType, setDocType] = React.useState('AADHAAR_FRONT');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const handleViewDocument = async (docId: string) => {
    setViewingDocId(docId);
    try {
      const res: any = await unwrapApiResponse(
        apiClient.GET('/api/v1/customers/{id}/documents/{docId}/url' as any, {
          params: { path: { id: customerId, docId } },
        }),
      );
      if (res?.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      console.error('Failed to retrieve presigned document URL', err);
    } finally {
      setViewingDocId(null);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError(t('fileRequired'));
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setUploadError('File exceeds 10MB limit');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('docType', docType);
      formData.append('file', selectedFile);

      const token = getStoredAccessToken();
      const response = await fetch(`${getApiBaseUrl()}/api/v1/customers/${customerId}/documents`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || 'Failed to upload document');
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(customerId) });
      setIsUploadOpen(false);
      setSelectedFile(null);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      return unwrapApiResponse(
        apiClient.DELETE('/api/v1/customers/{id}/documents/{docId}' as any, {
          params: { path: { id: customerId, docId } },
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(customerId) });
      setDeleteTarget(null);
    },
  });

  const getDocTypeLabel = (type: string) => {
    switch (type) {
      case 'AADHAAR_FRONT':
        return t('docAadhaarFront');
      case 'AADHAAR_BACK':
        return t('docAadhaarBack');
      case 'PAN':
        return t('docPan');
      case 'PHOTO':
        return t('docPhoto');
      case 'SIGNATURE':
        return t('docSignature');
      default:
        return type;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with Upload CTA */}
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-400" />
            <span>{t('documentsCardTitle')}</span>
          </h3>
          <p className="text-xs text-slate-400">{t('documentsCardSubtitle')}</p>
        </div>

        {canUpload && (
          <Button
            size="sm"
            onClick={() => setIsUploadOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium h-8"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            <span>{t('uploadDocument')}</span>
          </Button>
        )}
      </div>

      {/* Documents Grid */}
      {documents.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center space-y-2">
          <FileCheck2 className="mx-auto h-8 w-8 text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-300">{t('noDocuments')}</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">{t('noDocumentsDesc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{getDocTypeLabel(doc.docType)}</span>
                    {doc.verified ? (
                      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-950/40 text-emerald-300 text-[10px] py-0 px-1.5">
                        <ShieldCheck className="h-3 w-3 mr-1 inline" /> {t('verifiedBadge')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/30 bg-amber-950/40 text-amber-300 text-[10px] py-0 px-1.5">
                        <Clock className="h-3 w-3 mr-1 inline" /> {t('unverifiedBadge')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs font-mono text-slate-400 truncate max-w-[240px]" title={doc.fileName}>
                    {doc.fileName}
                  </p>
                </div>

                {canDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(doc)}
                    className="h-7 w-7 p-0 text-slate-500 hover:text-red-400 hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-xs">
                <span className="text-slate-400 text-[11px]">
                  {new Date(doc.uploadedAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={viewingDocId === doc.id}
                  onClick={() => handleViewDocument(doc.id)}
                  className="h-7 border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-[11px] text-slate-200"
                >
                  {viewingDocId === doc.id ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-1 h-3 w-3 text-indigo-400" />
                  )}
                  <span>{t('viewDocument')}</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Document Modal */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base text-white">{t('uploadDocumentTitle')}</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              {t('uploadDocumentDesc')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUploadSubmit} className="space-y-3.5 py-2">
            {uploadError && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-2.5 text-xs text-red-300 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">{t('docType')}</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full h-8 rounded-md border border-slate-700 bg-slate-950 px-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="AADHAAR_FRONT">{t('docAadhaarFront')}</option>
                <option value="AADHAAR_BACK">{t('docAadhaarBack')}</option>
                <option value="PAN">{t('docPan')}</option>
                <option value="PHOTO">{t('docPhoto')}</option>
                <option value="SIGNATURE">{t('docSignature')}</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">{t('selectFile')}</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-300 file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsUploadOpen(false)}
                className="h-8 text-xs text-slate-400"
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isUploading}
                className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
              >
                {isUploading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                <span>{isUploading ? t('uploading') : t('uploadDocument')}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base text-white">{t('deleteDocumentTitle')}</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              {t('deleteDocumentConfirm', { name: deleteTarget?.fileName || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              className="h-8 text-xs text-slate-400"
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="h-8 text-xs bg-red-600 hover:bg-red-500"
            >
              {deleteMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <span>{deleteMutation.isPending ? t('deletingDocument') : t('delete')}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
