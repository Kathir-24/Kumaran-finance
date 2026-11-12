import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';

export class StorageKeyHelper {
  /**
   * Sanitizes a key to ensure it is safe from path traversal attacks.
   */
  static sanitizeKey(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new BadRequestException('Invalid storage key: key must be a non-empty string');
    }

    // Normalize forward slashes and trim
    const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');

    // Reject directory traversal attempts
    if (normalized.includes('..') || normalized.includes('//')) {
      throw new BadRequestException(
        'Path traversal detected: storage key cannot contain ".." or double slashes',
      );
    }

    return normalized;
  }

  /**
   * Generates a storage key for customer KYC documents.
   * Path: kyc/{customerId}/{docType}-{uuid}.{ext}
   */
  static kycDocument(customerId: string, docType: string, extension: string): string {
    const cleanExt = extension.replace(/^\./, '').toLowerCase() || 'jpg';
    const cleanDocType = docType.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    const shortUuid = randomUUID().split('-')[0];
    return `kyc/${customerId}/${cleanDocType}-${shortUuid}.${cleanExt}`;
  }

  /**
   * Normalizes and sanitizes a branch code for S3 storage path segments.
   * Defaults to 'PRD' when empty or stripped to empty.
   */
  private static sanitizeBranchCode(branchCode?: string): string {
    const cleaned = (branchCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');
    return cleaned || 'PRD';
  }

  /**
   * Generates a storage key for bilingual subscription receipts.
   * Path: receipts/{branchCode}/{year}/{receiptNumber}.pdf
   */
  static receiptPdf(branchCode: string, year: number | string, receiptNumber: string): string {
    const cleanBranch = StorageKeyHelper.sanitizeBranchCode(branchCode);
    const cleanReceipt = receiptNumber.replace(/[^a-zA-Z0-9-_]/g, '');
    return `receipts/${cleanBranch}/${year}/${cleanReceipt}.pdf`;
  }

  /**
   * Generates a storage key for prize payout vouchers.
   * Path: vouchers/{branchCode}/{year}/{voucherNumber}.pdf
   */
  static voucherPdf(branchCode: string, year: number | string, voucherNumber: string): string {
    const cleanBranch = StorageKeyHelper.sanitizeBranchCode(branchCode);
    const cleanVoucher = voucherNumber.replace(/[^a-zA-Z0-9-_]/g, '');
    return `vouchers/${cleanBranch}/${year}/${cleanVoucher}.pdf`;
  }

  /**
   * Generates a storage key for Company Safety Proof checklist scans (cheques, agreements).
   * Path: safety-proof/{auctionId}/{shortUuid}-{sanitizedFilename}
   */
  static safetyProofDoc(auctionId: string, originalFilename: string): string {
    const shortUuid = randomUUID().split('-')[0];
    const sanitizedName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `safety-proof/${auctionId}/${shortUuid}-${sanitizedName}`;
  }

  /**
   * Generates a storage key for Form XVII statutory auction minutes PDF.
   * Path: minutes/{chitGroupId}/month-{installmentMonth}.pdf
   */
  static auctionMinutesPdf(chitGroupId: string, installmentMonth: number): string {
    return `minutes/${chitGroupId}/month-${installmentMonth}.pdf`;
  }
}
