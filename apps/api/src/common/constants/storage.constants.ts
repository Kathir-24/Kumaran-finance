/**
 * Storage Guardrails (Component 1):
 * - Private S3 presigned URLs: 15-minute (900 seconds) TTL.
 * - KYC & Voucher upload size limit: 5 MB.
 * - Permitted MIME types: PDF, PNG, JPEG.
 */

export const PRESIGNED_URL_EXPIRES_IN_SECONDS = 900; // 15 minutes

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Megabytes

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];
