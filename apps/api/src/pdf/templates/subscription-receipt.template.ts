import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface SubscriptionReceiptData {
  receiptNumber: string;
  date: Date;
  groupCode: string;
  installmentMonth: number;
  durationMonths: number;
  ticketNumber: number;
  subscriberName: string;
  subscriberNameTamil?: string | null;
  address?: string;
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
  registrationNumber?: string | null;
  isCancelled?: boolean;
  reversedAt?: Date | null;
  reversalReason?: string | null;
}

export class SubscriptionReceiptTemplate {
  public static async generate(data: SubscriptionReceiptData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let isSettled = false;
      const safeResolve = (val: Buffer) => {
        if (!isSettled) {
          isSettled = true;
          resolve(val);
        }
      };
      const safeReject = (err: any) => {
        if (!isSettled) {
          isSettled = true;
          reject(err);
        }
      };

      try {
        StatutoryFormHelper.patchDocumentUnderline();

        // A5 portrait format (419.53 x 595.28 pt)
        const doc = new PDFDocument({
          size: [419.53, 595.28],
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
        const dateStr = FontResolverHelper.formatPdfDate(data.date);
        const regNo = data.registrationNumber || 'ROC/ERD/REG/2026/042';

        // 1. Company Letterhead Header
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(13).text('KUMARAN FINANCE / குமரன் பைனான்ஸ்', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('Chit Fund Operations / சீட்டு நிறுவனம்', { align: 'center', width: pageWidth });
        doc.text(data.branchAddress || 'Main Road, Perundurai, Erode / பெருந்துறை, ஈரோடு', { align: 'center', width: pageWidth });
        doc.text(`Phone / தொலைபேசி: ${data.branchPhone || '+91 98765 43210'}`, { align: 'center', width: pageWidth });

        doc.moveDown(0.3);
        doc.moveTo(leftX, doc.y).lineTo(rightX, doc.y).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).lineWidth(1).stroke();
        doc.moveDown(0.2);

        // 2. Statutory Receipt Title (Form XVI, Rule 25)
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
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
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
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
            doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
          }
        }
        doc.moveDown(0.2);
        doc.moveTo(leftX, doc.y).lineTo(rightX, doc.y).strokeColor('#888888').lineWidth(0.5).stroke();
        doc.moveDown(0.4);

        // 3. Receipt Metadata Grid (2-Column)
        const metaStartY = doc.y;
        const colWidth = (pageWidth - 10) / 2;
        const rightColX = leftX + colWidth + 10;

        // Left Column: Receipt & Transaction Info
        doc.font(regularFont).fontSize(8.5);
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
        doc.y = metaEndY + 4;
        doc.x = leftX;
        doc.moveTo(leftX, doc.y).lineTo(rightX, doc.y).strokeColor('#E0E0E0').lineWidth(0.5).stroke();
        doc.moveDown(0.4);

        // 4. Subscriber Information & Gazette Statement
        doc.font(boldFont).fontSize(8.5).text('சந்தாதாரர் விவரம் / SUBSCRIBER DETAILS:', leftX);
        doc.font(regularFont).fontSize(8);
        const nameTamil = data.subscriberNameTamil ? ` (${data.subscriberNameTamil})` : '';
        doc.text(`பெயர் / Name: ${data.subscriberName}${nameTamil}`);
        if (data.address) {
          doc.text(`முகவரி / Address: ${data.address}`);
        }
        doc.text(`தொலைபேசி / Phone: ${data.phone}`);

        doc.moveDown(0.35);
        doc.font(regularFont).fontSize(8).text('Received from ', leftX, doc.y, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, `${data.subscriberName}${nameTamil}`, '____________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' to credit of ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, `${data.groupCode} [#${data.ticketNumber}]`, '__________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' under Chit Agreement No: ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, regNo, '____________________', { lineGap: 3.5 });

        doc.moveDown(0.4);
        doc.moveTo(leftX, doc.y).lineTo(rightX, doc.y).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).lineWidth(0.8).stroke();
        doc.moveDown(0.35);

        // 5. Financial Breakdown Table matching Gazette Form XVI categories
        const tableTop = doc.y;
        const descX = leftX + 8;
        const amountX = rightX - 100;
        const rowH = 18;

        doc.rect(leftX, tableTop, pageWidth, rowH).fillColor('#212529').fill();
        doc.fillColor('#ffffff').font(boldFont).fontSize(8);
        doc.text('விவரம் / Description', descX, tableTop + 5);
        doc.text('Rs.    Ps.', amountX, tableTop + 5, { align: 'right', width: 90 });

        let currentY = tableTop + rowH + 2;

        // Item 1: Base Installment
        doc.rect(leftX, currentY, pageWidth, rowH).fillColor('#ffffff').fill();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(8.5);
        doc.text('Payment for current installment (அடிப்படை தவணை)', descX, currentY + 4);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.baseInstallment)}`, amountX, currentY + 4, { align: 'right', width: 90 });
        currentY += rowH;

        // Item 2: Dividend credit deduction
        doc.rect(leftX, currentY, pageWidth, rowH).fillColor('#f8f9fa').fill();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(8.5);
        doc.text('Less: Dividend credit (கழிவு லாபப்பங்கு)', descX, currentY + 4);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`- Rs. ${RupeeWordsHelper.formatWholeRupees(data.dividendDeduction)}`, amountX, currentY + 4, { align: 'right', width: 90 });
        currentY += rowH;

        // Item 3: Net Payable
        doc.rect(leftX, currentY, pageWidth, rowH).fillColor('#ffffff').fill();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(8.5);
        doc.text('செலுத்த வேண்டிய நிகர தொகை / Net Payable (I_net)', descX, currentY + 4);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.netPayableAmount)}`, amountX, currentY + 4, { align: 'right', width: 90 });
        currentY += rowH;

        // Total Row matching Gazette Form XVI with bold black underline
        doc.rect(leftX, currentY, pageWidth, 22).fillColor('#e9ecef').fill();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(9);
        doc.text('Total (செலுத்திய தொகை / TOTAL PAID):', descX, currentY + 6);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.amountPaid)}`, amountX, currentY + 6, {
          align: 'right',
          width: 90,
          statutoryUnderline: true,
          underlineColor: StatutoryFormHelper.TEMPLATE_BLACK,
          underlineWidth: StatutoryFormHelper.BOLD_LINE_WIDTH,
        } as any);
        currentY += 26;

        // (in words Rupees _____ only) matching Gazette Page 77
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(8);
        doc.text('(in words Rupees ', descX, currentY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, RupeeWordsHelper.toEnglishWords(data.amountPaid), '________________________________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' only)');
        currentY += 14;

        doc.font(regularFont).fontSize(8).fillColor('#333333');
        doc.text(`ரூபாய் வார்த்தைகளில்: ${RupeeWordsHelper.toTamilWords(data.amountPaid)}`, descX, currentY, { width: pageWidth - 16 });
        currentY = doc.y + 8;

        // Date and Revenue Stamp Box matching Gazette Page 77
        doc.moveTo(leftX, currentY).lineTo(rightX, currentY).strokeColor('#888888').lineWidth(0.5).stroke();
        currentY += 8;

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(8.5);
        doc.text('Date: ', leftX, currentY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, dateStr, '____________________');

        // Revenue stamp box
        doc.rect(rightX - 110, currentY, 110, 32).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).lineWidth(0.8).stroke();
        doc.font(regularFont).fontSize(6.5).fillColor('#666666').text('Affix revenue\nLabel here\n(Art. 51 Stamp Act)', rightX - 105, currentY + 5, { width: 100, align: 'center' });

        currentY += 36;
        doc.font(regularFont).fontSize(8).fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.text('Recorded By: ', leftX, currentY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, data.collectedByName, '____________________');

        doc.text('for and on behalf of foreman: ', rightX - 180, currentY, { continued: true });
        doc.font(boldFont).text('____________________');

        currentY += 20;
        doc.fontSize(7).fillColor('#555555');
        doc.x = leftX;
        doc.y = currentY;
        doc.text('* இது கணினி மூலம் உருவாக்கப்பட்ட டிஜிட்டல் ரசீது. / This is a computer-generated digital receipt.', { align: 'center', width: pageWidth });
        doc.moveDown(0.2);
        doc.text('* சந்தா செலுத்தியதற்கான முதன்மை சட்டப்பூர்வ ஆதாரம் சந்தாதாரரின் கையொப்பமிட்ட பாஸ்புக் ஆகும் (ADR-11).', { align: 'center', width: pageWidth });
        doc.moveDown(0.2);
        doc.text('* The primary acknowledged legal proof of payment is the signed physical paper passbook.', { align: 'center', width: pageWidth });

        // Cancelled Watermark for Reversed Payments (ADR-07)
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
