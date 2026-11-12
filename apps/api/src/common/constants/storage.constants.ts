/**
 * Storage Guardrails (Component 1):
 * - Private S3 presigned URLs: 15-minute (900 seconds) TTL.
 * - KYC & Voucher upload size limit: 5 MB.
 * - Permitted MIME types: PDF, PNG, JPEG.
 */

export const PRESIGNED_URL_EXPIRES_IN_SECONDS = 900; // 15 minutes
export const PRESIGNED_UPLOAD_URL_EXPIRES_IN_SECONDS = 300; // 5 minutes

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Megabytes
export const MAX_DIRECT_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 Megabytes (Direct S3/KYC/Safety Proof ceiling)

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export const ALLOWED_DIRECT_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];
export type AllowedDirectUploadMimeType = (typeof ALLOWED_DIRECT_UPLOAD_MIME_TYPES)[number];
