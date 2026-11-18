// ==============================================================================
// Kumaran Chits — Pure Voucher Print Data Mapper & Canonical Number Formatter
// Unwraps GET /api/v1/disbursements/auction/:auctionId/voucher (`VoucherDataInput`)
// with exact 64-bit BigInt math and canonical Module 6 KC-VOU formatting.
// ==============================================================================

import { formatIstDateString, toSafeBigInt, type WholeRupeeValue } from '../reports/report-bigint.ts';

export interface VoucherData {
  voucherNumber: string;
  disbursedAt: string | Date;
  chitGroupCode: string;
  chitValue: WholeRupeeValue;
  installmentMonth: number;
  ticketNumber: number;
  winnerCode: string;
  winnerName: string;
  winnerNameTamil?: string | null;
  winnerPhone: string;
  bidDiscount: WholeRupeeValue;
  grossPrizeMoney?: WholeRupeeValue;
  arrearsDeducted?: WholeRupeeValue;
  netPrizeMoney: WholeRupeeValue;
  disbursementMode: string;
  paymentReference?: string | null;
  agreementSigned?: boolean;
  nomineeSigned?: boolean;
  isSecurityRequired?: boolean;
  blankChequeDetails?: string | null;
  verifiedByUserName: string;
  authorizedByUserName: string;
  branchName?: string | null;
  branchAddress?: string | null;
  branchPhone?: string | null;
}

export interface PrintVoucherBackendData {
  voucherNumber?: string;
  disbursedAt?: string | Date;
  chitGroupCode?: string;
  chitValue?: WholeRupeeValue;
  durationMonths?: number;
  installmentMonth?: number;
  ticketNumber?: number;
  subscriberName?: string;
  subscriberTamilName?: string | null;
  customerCode?: string;
  subscriberAddress?: string | null;
  subscriberMobile?: string;
  winnerCode?: string;
  winnerName?: string;
  winnerNameTamil?: string | null;
  winnerPhone?: string;
  bidDiscount?: WholeRupeeValue;
  grossPrizeMoney?: WholeRupeeValue;
  arrearsDeducted?: WholeRupeeValue;
  prizeMoney?: WholeRupeeValue;
  netPrizeMoney?: WholeRupeeValue;
  disbursementMode?: string;
  paymentReference?: string | null;
  agreementSigned?: boolean;
  nomineeSigned?: boolean;
  isSecurityRequired?: boolean;
  blankChequeDetails?: string | null;
  makerName?: string;
  checkerName?: string;
  verifiedByUserName?: string;
  authorizedByUserName?: string;
  branchCode?: string | null;
  branchName?: string | null;
  branchTamilName?: string | null;
  branchAddress?: string | null;
  branchPhone?: string | null;
}

export interface PrintVoucherApiResponse extends PrintVoucherBackendData {
  isBilingual?: boolean;
  issuedAt?: string | Date;
  formattedText?: string;
  data?: PrintVoucherBackendData;
  chitGroup?: { groupCode?: string; chitValue?: WholeRupeeValue };
  auction?: {
    auctionMonth?: number;
    installmentMonth?: number;
    bidDiscount?: WholeRupeeValue;
    prizeMoney?: WholeRupeeValue;
  };
  winner?: {
    ticketNumber?: number;
    ticketCode?: string;
    customer?: {
      customerCode?: string;
      fullName?: string;
      fullNameTamil?: string | null;
      phone?: string;
    };
  };
  disbursement?: { disbursementMode?: string; referenceNumber?: string | null };
  safetyProof?: {
    agreementSigned?: boolean;
    nomineeSigned?: boolean;
    isSecurityRequired?: boolean;
    blankChequeDetails?: string | null;
  };
  verifiedByUser?: { name?: string };
  authorizedByUser?: { name?: string };
  branch?: { code?: string; name?: string; address?: string; phone?: string };
}

/**
 * Formats a canonical Module 6 voucher number:
 * `KC-VOU-{BRANCH}-{YEAR}-{GROUP}-{MMMMM}` (e.g. `KC-VOU-PRD-2026-KCA-1L-20M-01-00004`).
 */
export function buildCanonicalVoucherNumber(params: {
  branchCode?: string | null;
  issuedAt?: string | Date | null;
  groupCode?: string | null;
  installmentMonth?: number | null;
}): string {
  const branchCode =
    (params.branchCode || 'PRD')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '') || 'PRD';
  const parsedDate = params.issuedAt ? new Date(params.issuedAt) : new Date();
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const year = formatIstDateString(safeDate).slice(0, 4);
  const sanitizedGroupCode =
    (params.groupCode || 'CHIT')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '') || 'CHIT';
  const monthSeq = String(Math.max(1, Math.trunc(params.installmentMonth ?? 1))).padStart(5, '0');
  return `KC-VOU-${branchCode}-${year}-${sanitizedGroupCode}-${monthSeq}`;
}

/**
 * Maps the `GET /api/v1/disbursements/auction/:auctionId/voucher` response
 * (which wraps `VoucherDataInput` under `.data`) into `VoucherData` with
 * exact whole-Rupee preservation and canonical voucher numbering.
 */
export function mapVoucherApiResponseToVoucherData(
  raw: PrintVoucherApiResponse,
): VoucherData {
  const inner = raw.data ?? raw;
  const chitGroupCode =
    inner.chitGroupCode || raw.chitGroup?.groupCode || raw.chitGroupCode || 'KCA';
  const installmentMonth =
    inner.installmentMonth ??
    raw.auction?.installmentMonth ??
    raw.auction?.auctionMonth ??
    raw.installmentMonth ??
    1;
  const disbursedAt =
    inner.disbursedAt ?? raw.issuedAt ?? raw.disbursedAt ?? new Date().toISOString();
  const branchCode = inner.branchCode ?? raw.branch?.code ?? 'PRD';

  const chitValue = toSafeBigInt(inner.chitValue ?? raw.chitGroup?.chitValue ?? raw.chitValue ?? 0);
  const bidDiscount = toSafeBigInt(
    inner.bidDiscount ?? raw.auction?.bidDiscount ?? raw.bidDiscount ?? 0,
  );
  const grossPrizeMoney =
    inner.grossPrizeMoney !== undefined && inner.grossPrizeMoney !== null
      ? toSafeBigInt(inner.grossPrizeMoney)
      : chitValue > bidDiscount
        ? chitValue - bidDiscount
        : 0n;
  const netPrizeMoney = toSafeBigInt(
    inner.prizeMoney ??
      inner.netPrizeMoney ??
      raw.auction?.prizeMoney ??
      raw.netPrizeMoney ??
      grossPrizeMoney,
  );
  const arrearsDeducted =
    inner.arrearsDeducted !== undefined && inner.arrearsDeducted !== null
      ? toSafeBigInt(inner.arrearsDeducted)
      : grossPrizeMoney > netPrizeMoney
        ? grossPrizeMoney - netPrizeMoney
        : 0n;

  const voucherNumber =
    raw.voucherNumber ||
    inner.voucherNumber ||
    buildCanonicalVoucherNumber({
      branchCode,
      issuedAt: disbursedAt,
      groupCode: chitGroupCode,
      installmentMonth,
    });

  return {
    voucherNumber,
    disbursedAt,
    chitGroupCode,
    chitValue,
    installmentMonth,
    ticketNumber: inner.ticketNumber ?? raw.winner?.ticketNumber ?? raw.ticketNumber ?? 1,
    winnerCode:
      inner.customerCode ||
      inner.winnerCode ||
      raw.winner?.customer?.customerCode ||
      raw.winner?.ticketCode ||
      raw.winnerCode ||
      '—',
    winnerName:
      inner.subscriberName ||
      inner.winnerName ||
      raw.winner?.customer?.fullName ||
      raw.winnerName ||
      'Winner',
    winnerNameTamil:
      inner.subscriberTamilName ??
      inner.winnerNameTamil ??
      raw.winner?.customer?.fullNameTamil ??
      raw.winnerNameTamil,
    winnerPhone:
      inner.subscriberMobile ||
      inner.winnerPhone ||
      raw.winner?.customer?.phone ||
      raw.winnerPhone ||
      '',
    bidDiscount,
    grossPrizeMoney,
    arrearsDeducted,
    netPrizeMoney,
    disbursementMode:
      inner.disbursementMode ||
      raw.disbursement?.disbursementMode ||
      raw.disbursementMode ||
      'CASH',
    paymentReference:
      inner.paymentReference ??
      raw.disbursement?.referenceNumber ??
      raw.paymentReference,
    agreementSigned: inner.agreementSigned ?? raw.safetyProof?.agreementSigned ?? true,
    nomineeSigned: inner.nomineeSigned ?? raw.safetyProof?.nomineeSigned ?? true,
    isSecurityRequired: inner.isSecurityRequired ?? raw.safetyProof?.isSecurityRequired ?? false,
    blankChequeDetails: inner.blankChequeDetails ?? raw.safetyProof?.blankChequeDetails,
    verifiedByUserName:
      inner.makerName ||
      inner.verifiedByUserName ||
      raw.verifiedByUser?.name ||
      raw.verifiedByUserName ||
      'Branch Staff (Maker)',
    authorizedByUserName:
      inner.checkerName ||
      inner.authorizedByUserName ||
      raw.authorizedByUser?.name ||
      raw.authorizedByUserName ||
      'Verified Partner (Checker)',
    branchName: inner.branchName ?? raw.branch?.name ?? raw.branchName,
    branchAddress: inner.branchAddress ?? raw.branch?.address ?? raw.branchAddress,
    branchPhone: inner.branchPhone ?? raw.branch?.phone ?? raw.branchPhone,
  };
}
