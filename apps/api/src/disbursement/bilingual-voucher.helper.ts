/**
 * Bilingual Prize Money Disbursement Voucher Formatter for Kumaran Chits (English + தமிழ்).
 */

export interface VoucherDataInput {
  voucherNumber: string;
  disbursedAt: Date;
  chitGroupCode: string;
  chitValue: bigint;
  durationMonths: number;
  installmentMonth: number;
  ticketNumber: number;
  subscriberName: string;
  subscriberTamilName?: string | null;
  customerCode: string;
  subscriberAddress: string;
  subscriberMobile: string;
  bidDiscount: bigint;
  grossPrizeMoney?: bigint;
  arrearsDeducted?: bigint;
  prizeMoney: bigint;
  disbursementMode: string;
  paymentReference: string;
  makerName: string;
  checkerName: string;
  branchName: string;
  branchTamilName?: string | null;
  branchPhone: string;
  disbursementStatus: string;
}

export function formatBilingualVoucherText(data: VoucherDataInput): string {
  const dateStr = data.disbursedAt.toISOString().slice(0, 10);
  const timeStr = data.disbursedAt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const modeTamilMap: Record<string, string> = {
    ACCOUNT_PAYEE_CHEQUE: 'காசோலை / ACCOUNT PAYEE CHEQUE',
    BANK_TRANSFER_NEFT: 'வங்கி NEFT / BANK TRANSFER NEFT',
    BANK_TRANSFER_RTGS: 'வங்கி RTGS / BANK TRANSFER RTGS',
    BANK_TRANSFER_IMPS: 'வங்கி IMPS / BANK TRANSFER IMPS',
    CASH: 'ரொக்கம் / CASH',
  };

  const modeStr = modeTamilMap[data.disbursementMode] || data.disbursementMode;

  const arrearsLine =
    data.arrearsDeducted !== undefined && data.arrearsDeducted > 0n
      ? `\n  நிலுவை கழிவு / Arrears & Installment Offset : - ₹ ${data.arrearsDeducted.toString()}`
      : '';

  return `================================================================================
                    KUMARAN FINANCE / குமரன் பைனான்ஸ்
               Chit Fund Operations / சீட்டு நிறுவனம்
        ${data.branchName || 'Head Office - Perundurai'} / ${data.branchTamilName || 'தலைமை கிளை, பெருந்துறை, ஈரோடு'}
                 Phone / தொலைபேசி: ${data.branchPhone || '+91 98765 43210'}
================================================================================
           பரிசுத் தொகை பட்டுவாடா ரசீது / PRIZE MONEY DISBURSEMENT VOUCHER
--------------------------------------------------------------------------------
பற்றுச்சீட்டு எண் / Voucher No : ${data.voucherNumber.padEnd(25)} தேதி / Date : ${dateStr}
சீட்டு குறியீடு / Chit Code    : ${data.chitGroupCode.padEnd(25)} மாதம் / Month: ${data.installmentMonth} / ${data.durationMonths}
டிக்கெட் எண் / Ticket No      : ${String(data.ticketNumber).padStart(2, '0').padEnd(25)} நேரம் / Time: ${timeStr}
நிலை / Status                : ${data.disbursementStatus}
--------------------------------------------------------------------------------
வெற்றி பெற்ற சந்தாதாரர் / Winner : ${data.subscriberTamilName ? `${data.subscriberTamilName} / ` : ''}${data.subscriberName}
வாடிக்கையாளர் எண் / Code       : ${data.customerCode}
முகவரி / Address              : ${data.subscriberAddress}
தொலைபேசி / Mobile             : ${data.subscriberMobile}
--------------------------------------------------------------------------------
பரிசுத் தொகை கணக்கீடு / PRIZE MONEY CALCULATION:
  மொத்த சீட்டு மதிப்பு / Total Chit Value       : ₹ ${data.chitValue.toString()}
  ஏலக் கழிவு / Winning Bid Discount           : - ₹ ${data.bidDiscount.toString()}${arrearsLine}
  ----------------------------------------------------------------------------
  வழங்கப்படும் பரிசுத் தொகை / Net Prize Money : ₹ ${data.prizeMoney.toString()}
--------------------------------------------------------------------------------
பட்டுவாடா விவரங்கள் / DISBURSEMENT DETAILS:
  பட்டுவாடா முறை / Payment Mode             : ${modeStr}
  பரிவர்த்தனை குறிப்பு / Payment Reference   : ${data.paymentReference}
  சரிபார்த்தவர் / Verified By (Maker)       : ${data.makerName}
  அங்கீகரித்தவர் / Authorized By (Checker)   : ${data.checkerName}
--------------------------------------------------------------------------------
  * கணினி மூலம் உருவாக்கப்பட்ட பற்றுச்சீட்டு. கையொப்பம் தேவையில்லை.
  * This is a computer-generated digital payout voucher.
================================================================================`;
}
