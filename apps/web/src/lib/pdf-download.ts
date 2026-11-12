// ==============================================================================
// Kumaran Chits — Shared Authenticated PDF Blob Download Helper
// Routes PDF downloads through typed @kumaran/api-client (BFF + HttpOnly cookies)
// with uniform KumaranApiError propagation and ObjectURL cleanup.
// ==============================================================================

import { apiClient, unwrapApiResponse } from './api-client.ts';

export interface PdfDownloadDeps {
  getClient?: () => typeof apiClient;
  triggerDownload?: (blob: Blob, filename: string) => void;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    if (anchor.parentNode) {
      anchor.parentNode.removeChild(anchor);
    }
    window.URL.revokeObjectURL(objectUrl);
  }
}

async function downloadPdfAndSave(
  requestPromise: Promise<{ data?: unknown; error?: unknown; response: Response }>,
  filename: string,
  deps: PdfDownloadDeps = {},
): Promise<void> {
  const blob = await unwrapApiResponse<Blob>(requestPromise);
  (deps.triggerDownload ?? triggerBlobDownload)(blob, filename);
}

export async function downloadReceiptPdf(
  paymentId: string,
  filename: string,
  deps: PdfDownloadDeps = {},
): Promise<void> {
  const client = deps.getClient ? deps.getClient() : apiClient;
  await downloadPdfAndSave(
    client.GET('/api/v1/pdf/receipt/{paymentId}', {
      params: { path: { paymentId } },
      parseAs: 'blob',
    }),
    filename,
    deps,
  );
}

export async function downloadVoucherPdf(
  auctionId: string,
  filename: string,
  deps: PdfDownloadDeps = {},
): Promise<void> {
  const client = deps.getClient ? deps.getClient() : apiClient;
  await downloadPdfAndSave(
    client.GET('/api/v1/pdf/voucher/{auctionId}', {
      params: { path: { auctionId } },
      parseAs: 'blob',
    }),
    filename,
    deps,
  );
}
