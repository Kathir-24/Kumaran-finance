/**
 * Bilingual Receipt Formatter for Kumaran Chits (English + தமிழ்).
 * Implements approved specification in docs/02-requirements/notification-and-receipt-templates.md.
 */

export interface ReceiptDataInput {
  receiptNumber: string;
  issuedAt: Date;
  chitGroupCode: string;
  chitValue: bigint;
  durationMonths: number;
  installmentMonth: number;
  ticketNumber: number;
  subscriberName: string;
  subscriberTamilName?: string | null;
  subscriberAddress: string;
  subscriberMobile: string;
  baseInstallment: bigint;
  dividendDeduction: bigint;
  netPayableAmount: bigint;
  amountPaid: bigint;
  paymentMethod: string;
  transactionRef?: string | null;
  collectorName: string;
  collectorPhone?: string | null;
  branchName: string;
  branchTamilName?: string | null;
  branchAddress: string;
  branchPhone: string;
  isReversed?: boolean;
}

export function formatBilingualReceiptText(data: ReceiptDataInput): string {
  const dateStr = data.issuedAt.toISOString().slice(0, 10);
  const timeStr = data.issuedAt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const methodTamilMap: Record<string, string> = {
    CASH: 'ரொக்கம் / CASH',
    UPI: 'யுபிஐ / UPI',
    BANK_TRANSFER: 'வங்கி பரிமாற்றம் / BANK TRANSFER',
    CHEQUE: 'காசோலை / CHEQUE',
  };

  const paymentModeStr = methodTamilMap[data.paymentMethod] || data.paymentMethod;
  const statusHeader = data.isReversed
    ? '\n*** ரத்து செய்யப்பட்ட ரசீது / VOID - REVERSED RECEIPT ***\n'
    : '';

  return `================================================================================
                    KUMARAN FINANCE / குமரன் பைனான்ஸ்
               Chit Fund Operations / சீட்டு நிறுவனம்
        Main Road, Perundurai, Erode / ${data.branchTamilName || 'தலைமை கிளை, பெருந்துறை, ஈரோடு'}
                 Phone / தொலைபேசி: ${data.branchPhone || '+91 98765 43210'}
================================================================================${statusHeader}
                   சந்தா ரசீது / SUBSCRIPTION RECEIPT
--------------------------------------------------------------------------------
ரசீது எண் / Receipt No   : ${data.receiptNumber.padEnd(25)} தேதி / Date : ${dateStr}
சீட்டு குறியீடு / Chit Code: ${data.chitGroupCode.padEnd(25)} மாதம் / Month: ${data.installmentMonth} / ${data.durationMonths}
டிக்கெட் எண் / Ticket No : ${String(data.ticketNumber).padStart(2, '0').padEnd(25)} நேரம் / Time: ${timeStr}
--------------------------------------------------------------------------------
சந்தாதாரர் பெயர் / Subscriber Name : ${data.subscriberTamilName ? `${data.subscriberTamilName} / ` : ''}${data.subscriberName}
முகவரி / Address                 : ${data.subscriberAddress}
தொலைபேசி / Mobile                : ${data.subscriberMobile}
--------------------------------------------------------------------------------
கட்டண விவரங்கள் / PAYMENT BREAKDOWN:
  அடிப்படை தவணை / Base Installment      : ₹ ${data.baseInstallment.toString()}
  கழிவு லாபப்பங்கு / Dividend Deduction : - ₹ ${data.dividendDeduction.toString()}
  செலுத்த வேண்டியது / Net Payable       : ₹ ${data.netPayableAmount.toString()}
--------------------------------------------------------------------------------
செலுத்திய தொகை / AMOUNT PAID           : ₹ ${data.amountPaid.toString()}

கட்டண முறை / Payment Mode              : ${paymentModeStr}
வசூலித்தவர் / Collected By             : ${data.collectorName}${data.collectorPhone ? ` (${data.collectorPhone})` : ''}
${data.transactionRef ? `குறிப்பு எண் / Reference No        : ${data.transactionRef}\n` : ''}--------------------------------------------------------------------------------
  * கணினி மூலம் உருவாக்கப்பட்ட ரசீது. கையொப்பம் தேவையில்லை.
  * This is a computer-generated digital receipt.
================================================================================`;
}
