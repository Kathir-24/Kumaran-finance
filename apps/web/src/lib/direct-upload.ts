// ==============================================================================
// Kumaran Chits — Direct-to-Storage Presigned PUT Upload Orchestrator
// Compresses large camera photos in-browser first, obtains a 300s presigned PUT
// URL from NestJS, uploads directly to S3/R2 (or /bff local driver fallback)
// with a 120s cellular timeout, and returns verified metadata for DB confirmation.
// ==============================================================================

import {
  apiClient,
  getApiBaseUrl,
  unwrapApiResponse,
} from './api-client.ts';
import { compressImageIfNeeded } from './image-compressor.ts';

export const MAX_DIRECT_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const DIRECT_UPLOAD_TIMEOUT_MS = 120_000; // 120s rural cellular resilience
export const ALLOWED_DIRECT_UPLOAD_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type DirectUploadPurpose = 'KYC' | 'SAFETY_PROOF';

export interface PresignedUploadInstruction {
  uploadUrl: string;
  key: string;
  method: string;
  expiresInSeconds: number;
  headers: Record<string, string>;
}

export interface DirectUploadRequest {
  purpose: DirectUploadPurpose;
  entityId: string;
  docType: string;
  file: File;
}

export interface DirectUploadResult {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  compressed: boolean;
}

export interface DirectUploadDeps {
  compressFn?: (file: File) => Promise<File>;
  requestPresignFn?: (payload: {
    purpose: DirectUploadPurpose;
    docType: string;
    fileName: string;
    mimeType: string;
    customerId?: string;
    auctionId?: string;
  }) => Promise<PresignedUploadInstruction>;
  fetchFn?: typeof fetch;
  getBaseUrlFn?: () => string;
  timeoutMs?: number;
}

function resolveMimeType(file: File): string {
  const explicit = (file.type || '').toLowerCase().trim();
  if (explicit) return explicit;
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    default:
      return '';
  }
}

async function defaultRequestPresign(payload: {
  purpose: DirectUploadPurpose;
  docType: string;
  fileName: string;
  mimeType: string;
  customerId?: string;
  auctionId?: string;
}): Promise<PresignedUploadInstruction> {
  return unwrapApiResponse<PresignedUploadInstruction>(
    apiClient.POST('/api/v1/storage/presigned-upload-url', {
      body: payload,
    }),
  );
}

/**
 * Uploads a document directly to object storage (S3/R2) or falls back cleanly
 * to the authenticated BFF/API local-driver PUT target in non-S3 environments.
 */
export async function uploadDirectToStorage(
  request: DirectUploadRequest,
  deps: DirectUploadDeps = {},
): Promise<DirectUploadResult> {
  const { file, purpose, entityId, docType } = request;
  if (!file) {
    throw new Error('A valid file is required for upload');
  }

  const initialMime = resolveMimeType(file);
  if (
    !ALLOWED_DIRECT_UPLOAD_MIMES.includes(
      initialMime as (typeof ALLOWED_DIRECT_UPLOAD_MIMES)[number],
    )
  ) {
    throw new Error('Unsupported file format. Allowed: JPG, PNG, WEBP, or PDF.');
  }

  if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
    throw new Error('File exceeds 10MB limit. Please select a smaller scan.');
  }

  const compressFn = deps.compressFn ?? compressImageIfNeeded;
  const requestPresignFn = deps.requestPresignFn ?? defaultRequestPresign;
  const fetchFn = deps.fetchFn ?? fetch;
  const getBaseUrlFn = deps.getBaseUrlFn ?? getApiBaseUrl;
  const timeoutMs = deps.timeoutMs ?? DIRECT_UPLOAD_TIMEOUT_MS;

  // 1. Compress smartphone camera photos before presigning so MIME/ext (.jpg) match signature
  const preparedFile = await compressFn(file);
  if (preparedFile.size > MAX_DIRECT_UPLOAD_BYTES) {
    throw new Error('Prepared file still exceeds 10MB limit.');
  }

  const finalMimeType = resolveMimeType(preparedFile) || initialMime;

  // 2. Request time-limited presigned PUT URL (300s TTL) via BFF session cookies
  const presigned = await requestPresignFn({
    purpose,
    docType,
    fileName: preparedFile.name,
    mimeType: finalMimeType,
    ...(purpose === 'KYC' ? { customerId: entityId } : { auctionId: entityId }),
  });

  if (!presigned?.uploadUrl || !presigned?.key) {
    throw new Error('Storage server did not return a valid presigned upload URL.');
  }

  // 3. Transfer binary directly via PUT with 120s timeout
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const isLocalFallback = presigned.uploadUrl.startsWith('/');
  const targetUrl = isLocalFallback
    ? `${getBaseUrlFn().replace(/\/+$/, '')}${presigned.uploadUrl}`
    : presigned.uploadUrl;

  try {
    const putResponse = await fetchFn(targetUrl, {
      method: presigned.method || 'PUT',
      headers: presigned.headers ?? { 'Content-Type': finalMimeType },
      body: preparedFile,
      credentials: isLocalFallback ? 'same-origin' : 'omit',
      signal: controller.signal,
    });

    if (!putResponse.ok) {
      const errorJson = await putResponse.json().catch(() => ({}));
      const msg =
        errorJson?.error?.message ||
        errorJson?.message ||
        `Direct storage PUT failed (HTTP ${putResponse.status})`;
      throw new Error(msg);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(
        `Upload timed out after ${Math.round(timeoutMs / 1000)} seconds. Please check network signal and retry.`,
      );
    }
    if (err instanceof TypeError) {
      throw new Error(
        'Direct storage upload failed due to network interruption or bucket CORS policy.',
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }

  return {
    key: presigned.key,
    fileName: preparedFile.name,
    mimeType: finalMimeType,
    sizeBytes: preparedFile.size,
    compressed: preparedFile !== file,
  };
}
