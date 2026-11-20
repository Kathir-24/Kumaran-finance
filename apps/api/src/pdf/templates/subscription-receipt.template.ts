import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface ReceiptPdfData {
  receiptNumber: string;
  date: Date;
  groupCode: string;
  installmentMonth: number;
  durationMonths: number;
  ticketNumber: number;
  subscriberName: string;
  subscriberNameTamil?: string | null;
  address?: string | null;
  phone: string;
  baseInstallment: bigint;
  dividendDeduction: bigint;
  netPayableAmount: bigint;
  amountPaid: bigint;
  paymentMethod: string;
  collectedByName: string;
  branchName?: string;
  branchAddress?: string;
  branchPhone?: string;
  isCancelled?: boolean; // KFC-PDF-001: True if payment reversal was approved
  reversalReason?: string | null;
  reversedAt?: Date | null;
}

export class SubscriptionReceiptTemplate {
  static async generate(data: ReceiptPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const safeResolve = (buf: Buffer) => {
        if (!settled) {
          settled = true;
          resolve(buf);
        }
      };
      const safeReject = (err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };

      try {
        // Standard A5 portrait (419.53 x 595.28 pt)
        const doc = new PDFDocument({
          size: 'A5',
          layout: 'portrait',
          margins: { top: 25, bottom: 25, left: 30, right: 30 },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => safeResolve(Buffer.concat(chunks)));
        doc.on('error', (err) => safeReject(err));

        const regularFont = FontResolverHelper.resolveSafeFont(
          doc,
          FontResolverHelper.getTamilRegularFont(),
          'Helvetica',
        );
        const boldFont = FontResolverHelper.resolveSafeFont(
          doc,
          FontResolverHelper.getTamilBoldFont(),
          'Helvetica-Bold',
        );

        const pageWidth = 419.53 - 60; // 359.53 pt printable width
        const leftX = 30;
        const rightX = 389.53;

        // 1. Company Letterhead Header
        doc.font(boldFont).fontSize(13).text('KUMARAN FINANCE / குமரன் பைனான்ஸ்', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('Chit Fund Operations / சீட்டு நிறுவனம்', { align: 'center', width: pageWidth });
        doc.text(data.branchAddress || 'Main Road, Perundurai, Erode / பெருந்துறை, ஈரோடு', { align: 'center', width: pageWidth });
        doc.text(`Phone / தொலைபேசி: ${data.branchPhone || '+91 98765 43210'}`, { align: 'center', width: pageWidth });

        doc.moveDown(0.4);
        doc.moveTo(leftX, doc.y).lineTo(rightX, doc.y).strokeColor('#333333').lineWidth(1).stroke();
        doc.moveDown(0.3);

        // 2. Statutory Receipt Title (Form XVI, Rule 25)
        doc.font(boldFont).fontSize(9.5).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10.5).text('FORM – XVI: சந்தா ரசீது / SUBSCRIPTION RECEIPT', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(7.5).text('(See Section 23 and Rule 25 — Original / Duplicate)', { align: 'center', width: pageWidth });

        // KFC-PDF-001 cancelled banner when reversed
        if (data.isCancelled) {
          doc.moveDown(0.2);
          doc.font(boldFont).fontSize(10).fillColor('#DC2626').text(
            '*** ரத்து செய்யப்பட்ட ரசீது / CANCELLED RECEIPT ***',
            { align: 'center', width: pageWidth },
          );
          doc.fillColor('#000000');
          if (data.reversalReason || data.reversedAt) {
            const revDate = data.reversedAt ? FontResolverHelper.formatPdfDate(data.reversedAt) : '';
            const revReason = data.reversalReason ? `காரணம் / Reason: ${data.reversalReason}` : '';
            const auditLine = [revDate ? `ரத்து தேதி / Cancelled: ${revDate}` : '', revReason]
              .filter(Boolean)
              .join(' | ');
            doc.font(regularFont).fontSize(7).fillColor('#991B1B').text(auditLine, {
              align: 'center',
              width: pageWidth,
            });
            doc.fillColor('#000000');
          }
        }
        doc.moveDown(0.3);
        doc.moveTo(leftX, doc.y).lineTo(rightX, doc.y).strokeColor('#888888').lineWidth(0.5).stroke();
        doc.moveDown(0.5);

        // 3. Receipt Metadata Grid (2-Column)
        const metaStartY = doc.y;
        const colWidth = (pageWidth - 10) / 2;
        const rightColX = leftX + colWidth + 10;

        // Left Column: Receipt & Transaction Info
        const dateStr = FontResolverHelper.formatPdfDate(data.date);
        doc.font(regularFont).fontSize(8);
        doc.text(`ரசீது எண் / Receipt No: ${data.receiptNumber}`, leftX, metaStartY, { width: colWidth });
        const recEndY = doc.y;
        doc.text(`தேதி / Date: ${dateStr}`, leftX, recEndY + 2, { width: colWidth });
        const dateEndY = doc.y;
        doc.text(`கட்டண முறை / Mode: ${data.paymentMethod}`, leftX, dateEndY + 2, { width: colWidth });
        const leftEndY = doc.y;

        // Right Column: Scheme & Ticket Info
        doc.text(`சீட்டு குழு / Chit Group: ${data.groupCode}`, rightColX, metaStartY, { width: colWidth });
        const groupEndY = doc.y;
        doc.text(`தவணை மாதம் / Month: ${data.installmentMonth} / ${data.durationMonths}`, rightColX, groupEndY + 2, { width: colWidth });
        const monthEndY = doc.y;
        doc.text(`டிக்கெட் எண் / Ticket No: #${data.ticketNumber}`, rightColX, monthEndY + 2, { width: colWidth });
        const rightEndY = doc.y;

        const metaEndY = Math.max(leftEndY, rightEndY);
        doc.y = metaEndY + 6;
        doc.x = leftX;
        doc.moveTo(leftX, doc.y).lineTo(rightX, doc.y).strokeColor('#E0E0E0').lineWidth(0.5).stroke();
        doc.moveDown(0.5);

        // 4. Subscriber Information
        doc.font(boldFont).fontSize(8.5).text('சந்தாதாரர் விவரம் / SUBSCRIBER DETAILS:', leftX);
        doc.font(regularFont).fontSize(8);
        const nameTamil = data.subscriberNameTamil ? ` (${data.subscriberNameTamil})` : '';
        doc.text(`பெயர் / Name: ${data.subscriberName}${nameTamil}`);
        if (data.address) {
          doc.text(`முகவரி / Address: ${data.address}`);
        }
        doc.text(`தொலைபேசி / Phone: ${data.phone}`);

        doc.moveDown(0.6);
        doc.moveTo(leftX, doc.y).lineTo(rightX, doc.y).strokeColor('#333333').lineWidth(0.8).stroke();
        doc.moveDown(0.4);

        // 5. Financial Breakdown Table
        doc.font(boldFont).fontSize(8.5).text('கட்டண விவரங்கள் / INSTALLMENT BREAKDOWN:');
        doc.moveDown(0.3);

        const tableTop = doc.y;
        const descX = leftX + 8;
        const amountX = rightX - 100;

        // Table Header Row
        doc.rect(leftX, tableTop, pageWidth, 16).fillColor('#F5F5F5').fill();
        doc.fillColor('#000000').font(boldFont).fontSize(7.5);
        doc.text('விவரம் / Description', descX, tableTop + 4);
        doc.text('தொகை / Amount (₹)', amountX, tableTop + 4, { align: 'right', width: 90 });

        let currentY = tableTop + 20;

        // Row 1: Base Installment
        doc.font(regularFont).fontSize(8);
        doc.text(`அடிப்படை தவணை / Base Installment (I_base)`, descX, currentY);
        doc.text(`₹ ${RupeeWordsHelper.formatWholeRupees(data.baseInstallment)}`, amountX, currentY, { align: 'right', width: 90 });
        currentY += 15;

        // Row 2: Dividend Deduction
        doc.text(`கழிவு லாபப்பங்கு / Dividend Credit (Div)`, descX, currentY);
        doc.text(`- ₹ ${RupeeWordsHelper.formatWholeRupees(data.dividendDeduction)}`, amountX, currentY, { align: 'right', width: 90 });
        currentY += 15;

        // Row 3: Net Payable
        doc.text(`செலுத்த வேண்டிய நிகர தொகை / Net Payable (I_net)`, descX, currentY);
        doc.text(`₹ ${RupeeWordsHelper.formatWholeRupees(data.netPayableAmount)}`, amountX, currentY, { align: 'right', width: 90 });
        currentY += 18;

        // Total Paid Highlight Box
        doc.rect(leftX, currentY - 3, pageWidth, 24).fillColor('#EAEAEA').fill();
        doc.fillColor('#000000').font(boldFont).fontSize(9.5);
        doc.text(`செலுத்திய தொகை / TOTAL AMOUNT PAID:`, descX, currentY + 4);
        doc.text(`₹ ${RupeeWordsHelper.formatWholeRupees(data.amountPaid)}`, amountX, currentY + 4, { align: 'right', width: 90 });
        currentY += 28;

        // Rupee Words (Bilingual)
        doc.font(regularFont).fontSize(7.5).fillColor('#333333');
        doc.text(`ரூபாய் வார்த்தைகளில்: ${RupeeWordsHelper.toTamilWords(data.amountPaid)}`, descX, currentY, { width: pageWidth - 16 });
        currentY = doc.y + 3;
        doc.text(`In Words: ${RupeeWordsHelper.toEnglishWords(data.amountPaid)}`, descX, currentY, { width: pageWidth - 16 });
        currentY = doc.y + 10;

        // 6. Sign-off and Ledger Notice Block
        doc.moveTo(leftX, currentY).lineTo(rightX, currentY).strokeColor('#333333').lineWidth(0.5).stroke();
        currentY += 6;

        doc.font(regularFont).fontSize(7.5).fillColor('#000000');
        doc.text(`வசூலித்தவர் / Recorded By: ${data.collectedByName}`, leftX, currentY);

        // Statutory Stamp Box & Foreman Signature (Gazette Form XVI / Article 51 Indian Stamp Act)
        doc.rect(rightX - 110, currentY, 110, 26).strokeColor('#888888').lineWidth(0.5).stroke();
        doc.font(regularFont).fontSize(6).fillColor('#666666').text('வருவாய் வில்லை\nAffix Revenue Stamp\n(Art. 51 Stamp Act)', rightX - 105, currentY + 3, { width: 100, align: 'center' });

        currentY += 28;
        doc.font(boldFont).fontSize(7.5).fillColor('#000000').text('for and on behalf of foreman / முன்னிலையாளர் சார்பாக', rightX - 190, currentY, { align: 'right', width: 190 });

        currentY += 15;
        doc.fontSize(6.5).fillColor('#555555');
        doc.x = leftX;
        doc.y = currentY;
        doc.text('* இது கணினி மூலம் உருவாக்கப்பட்ட டிஜிட்டல் ரசீது. / This is a computer-generated digital receipt.', { align: 'center', width: pageWidth });
        doc.moveDown(0.2);
        doc.text('* சந்தா செலுத்தியதற்கான முதன்மை சட்டப்பூர்வ ஆதாரம் சந்தாதாரரின் கையொப்பமிட்ட பாஸ்புக் ஆகும் (ADR-11).', { align: 'center', width: pageWidth });
        doc.moveDown(0.2);
        doc.text('* The primary acknowledged legal proof of payment is the signed physical paper passbook.', { align: 'center', width: pageWidth });

        // KFC-PDF-001: Bold Red Diagonal Cancelled Watermark for Reversed Payments (ADR-07 & Q22)
        if (data.isCancelled) {
          doc.save();
          doc.rotate(-35, { origin: [209.76, 297.64] });
          doc.font(boldFont).fontSize(28).fillColor('#DC2626').fillOpacity(0.28);
          doc.text('ரத்து செய்யப்பட்டது / CANCELLED', -50, 280, {
            align: 'center',
            width: 519.53,
          });
          doc.restore();
        }

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
