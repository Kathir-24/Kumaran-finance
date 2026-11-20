// ==============================================================================
// Kumaran Chits — Shared Authenticated PDF Blob Download Helper
// Routes PDF downloads through typed @kumaran/api-client (BFF + HttpOnly cookies)
// with explicit credentials forwarding, filename sanitization, uniform
// KumaranApiError propagation, and guaranteed ObjectURL cleanup.
// ==============================================================================

import { apiClient, KumaranApiError, unwrapApiResponse } from './api-client.ts';

export interface PdfDownloadDeps {
  getClient?: () => typeof apiClient;
  triggerDownload?: (blob: Blob, filename: string) => void;
}

/**
 * Sanitizes a PDF download filename against path traversal, CRLF/control chars,
 * and illegal filesystem characters, guaranteeing a `.pdf` suffix.
 */
export function sanitizePdfFilename(filename: string, fallback = 'kumaran-document'): string {
  const cleaned = (filename ?? '')
    .replace(/[\r\n\t\0]/g, '')
    .replace(/(?:\.\.[\\/])+/g, '')
    .replace(/[\\/]+/g, '_')
    .replace(/\.\.+/g, '.')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/^[_.\s]+|[_.\s]+$/g, '')
    .trim();

  const safe = cleaned || fallback;
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const safeFilename = sanitizePdfFilename(filename);
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = objectUrl;
    anchor.download = safeFilename;
    if (anchor.style) {
      anchor.style.visibility = 'hidden';
    }
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
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new KumaranApiError(502, {
      code: 'INVALID_PDF_PAYLOAD',
      message: 'Server returned an empty or invalid PDF payload',
    });
  }
  const safeFilename = sanitizePdfFilename(filename);
  (deps.triggerDownload ?? triggerBlobDownload)(blob, safeFilename);
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
      credentials: 'include',
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
      credentials: 'include',
    }),
    filename,
    deps,
  );
}

export async function downloadMinutesPdf(
  auctionId: string,
  filename: string,
  deps: PdfDownloadDeps = {},
): Promise<void> {
  const client = deps.getClient ? deps.getClient() : apiClient;
  await downloadPdfAndSave(
    client.GET('/api/v1/pdf/minutes/{auctionId}', {
      params: { path: { auctionId } },
      parseAs: 'blob',
      credentials: 'include',
    }),
    filename,
    deps,
  );
}

export async function downloadPassbookPdf(
  ticketId: string,
  filename: string,
  deps: PdfDownloadDeps = {},
): Promise<void> {
  const client = deps.getClient ? deps.getClient() : apiClient;
  await downloadPdfAndSave(
    client.GET('/api/v1/pdf/passbook/{ticketId}', {
      params: { path: { ticketId } },
      parseAs: 'blob',
      credentials: 'include',
    }),
    filename,
    deps,
  );
}

type UntypedGetFn = (
  url: string,
  options: {
    params?: {
      path?: Record<string, string>;
      query?: Record<string, string | undefined>;
    };
    parseAs: 'blob';
    credentials: 'include';
  },
) => Promise<{ data?: unknown; error?: unknown; response: Response }>;

export async function downloadFormIPdf(
  chitGroupId: string,
  filename: string,
  deps: PdfDownloadDeps = {},
): Promise<void> {
  const client = deps.getClient ? deps.getClient() : apiClient;
  const untypedGet = client.GET as unknown as UntypedGetFn;
  await downloadPdfAndSave(
    untypedGet('/api/v1/pdf/statutory/form-i/{chitGroupId}', {
      params: { path: { chitGroupId } },
      parseAs: 'blob',
      credentials: 'include',
    }),
    filename,
    deps,
  );
}

export async function downloadFormIiPdf(
  chitGroupId: string,
  filename: string,
  deps: PdfDownloadDeps = {},
): Promise<void> {
  const client = deps.getClient ? deps.getClient() : apiClient;
  const untypedGet = client.GET as unknown as UntypedGetFn;
  await downloadPdfAndSave(
    untypedGet('/api/v1/pdf/statutory/form-ii/{chitGroupId}', {
      params: { path: { chitGroupId } },
      parseAs: 'blob',
      credentials: 'include',
    }),
    filename,
    deps,
  );
}

export async function downloadFormVPdf(
  chitGroupId: string,
  filename: string,
  deps: PdfDownloadDeps = {},
): Promise<void> {
  const client = deps.getClient ? deps.getClient() : apiClient;
  const untypedGet = client.GET as unknown as UntypedGetFn;
  await downloadPdfAndSave(
    untypedGet('/api/v1/pdf/statutory/form-v/{chitGroupId}', {
      params: { path: { chitGroupId } },
      parseAs: 'blob',
      credentials: 'include',
    }),
    filename,
    deps,
  );
}

export async function downloadFormViiPdf(
  chitGroupId: string,
  filename: string,
  deps: PdfDownloadDeps = {},
): Promise<void> {
  const client = deps.getClient ? deps.getClient() : apiClient;
  const untypedGet = client.GET as unknown as UntypedGetFn;
  await downloadPdfAndSave(
    untypedGet('/api/v1/pdf/statutory/form-vii/{chitGroupId}', {
      params: { path: { chitGroupId } },
      parseAs: 'blob',
      credentials: 'include',
    }),
    filename,
    deps,
  );
}

export async function downloadFormViiiPdf(
  chitGroupId: string,
  filename: string,
  deps: PdfDownloadDeps = {},
): Promise<void> {
  const client = deps.getClient ? deps.getClient() : apiClient;
  const untypedGet = client.GET as unknown as UntypedGetFn;
  await downloadPdfAndSave(
    untypedGet('/api/v1/pdf/statutory/form-viii/{chitGroupId}', {
      params: { path: { chitGroupId } },
      parseAs: 'blob',
      credentials: 'include',
    }),
    filename,
    deps,
  );
}

export async function downloadFormIxPdf(
  auctionId: string,
  filename: string,
  ticketId?: string,
  deps: PdfDownloadDeps = {},
): Promise<void> {
  const client = deps.getClient ? deps.getClient() : apiClient;
  const untypedGet = client.GET as unknown as UntypedGetFn;
  await downloadPdfAndSave(
    untypedGet('/api/v1/pdf/statutory/form-ix/{auctionId}', {
      params: {
        path: { auctionId },
        query: ticketId ? { ticketId } : undefined,
      },
      parseAs: 'blob',
      credentials: 'include',
    }),
    filename,
    deps,
  );
}
