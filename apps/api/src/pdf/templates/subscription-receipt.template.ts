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
}

export class SubscriptionReceiptTemplate {
  static async generate(data: ReceiptPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Standard A5 portrait (419.53 x 595.28 pt)
      const doc = new PDFDocument({
        size: 'A5',
        layout: 'portrait',
        margins: { top: 25, bottom: 25, left: 30, right: 30 },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const regularFont = FontResolverHelper.getTamilRegularFont();
      const boldFont = FontResolverHelper.getTamilBoldFont();

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

      // 2. Receipt Title
      doc.font(boldFont).fontSize(10.5).text('சந்தா ரசீது / SUBSCRIPTION RECEIPT', { align: 'center', width: pageWidth });
      doc.moveDown(0.3);
      doc.moveTo(leftX, doc.y).lineTo(rightX, doc.y).strokeColor('#888888').lineWidth(0.5).stroke();
      doc.moveDown(0.5);

      // 3. Receipt Metadata Grid (2-Column)
      const metaStartY = doc.y;
      const colWidth = (pageWidth - 10) / 2;

      // Left Column: Receipt & Transaction Info
      const dateStr = data.date.toISOString().split('T')[0];
      doc.font(regularFont).fontSize(8);
      doc.text(`ரசீது எண் / Receipt No: ${data.receiptNumber}`, leftX, metaStartY);
      doc.text(`தேதி / Date: ${dateStr}`, leftX, doc.y + 2);
      doc.text(`கட்டண முறை / Mode: ${data.paymentMethod}`, leftX, doc.y + 2);

      // Right Column: Scheme & Ticket Info
      const rightColX = leftX + colWidth + 10;
      doc.text(`சீட்டு குழு / Chit Group: ${data.groupCode}`, rightColX, metaStartY);
      doc.text(`தவணை மாதம் / Month: ${data.installmentMonth} / ${data.durationMonths}`, rightColX, doc.y + 2);
      doc.text(`டிக்கெட் எண் / Ticket No: #${data.ticketNumber}`, rightColX, doc.y + 2);

      doc.moveDown(0.8);
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
      doc.text(`₹ ${data.baseInstallment.toLocaleString('en-IN')}`, amountX, currentY, { align: 'right', width: 90 });
      currentY += 15;

      // Row 2: Dividend Deduction
      doc.text(`கழிவு லாபப்பங்கு / Dividend Credit (Div)`, descX, currentY);
      doc.text(`- ₹ ${data.dividendDeduction.toLocaleString('en-IN')}`, amountX, currentY, { align: 'right', width: 90 });
      currentY += 15;

      // Row 3: Net Payable
      doc.text(`செலுத்த வேண்டிய நிகர தொகை / Net Payable (I_net)`, descX, currentY);
      doc.text(`₹ ${data.netPayableAmount.toLocaleString('en-IN')}`, amountX, currentY, { align: 'right', width: 90 });
      currentY += 18;

      // Total Paid Highlight Box
      doc.rect(leftX, currentY - 3, pageWidth, 24).fillColor('#EAEAEA').fill();
      doc.fillColor('#000000').font(boldFont).fontSize(9.5);
      doc.text(`செலுத்திய தொகை / TOTAL AMOUNT PAID:`, descX, currentY + 4);
      doc.text(`₹ ${data.amountPaid.toLocaleString('en-IN')}`, amountX, currentY + 4, { align: 'right', width: 90 });
      currentY += 28;

      // Rupee Words (Bilingual)
      doc.font(regularFont).fontSize(7.5).fillColor('#333333');
      doc.text(`ரூபாய் வார்த்தைகளில்: ${RupeeWordsHelper.toTamilWords(data.amountPaid)}`, descX, currentY);
      currentY += 12;
      doc.text(`In Words: ${RupeeWordsHelper.toEnglishWords(data.amountPaid)}`, descX, currentY);
      currentY += 20;

      // 6. Sign-off and Ledger Notice Block
      doc.moveTo(leftX, currentY).lineTo(rightX, currentY).strokeColor('#333333').lineWidth(0.5).stroke();
      currentY += 8;

      doc.font(regularFont).fontSize(7.5).fillColor('#000000');
      doc.text(`வசூலித்தவர் / Recorded By: ${data.collectedByName}`, leftX, currentY);
      doc.text('அங்கீகரிக்கப்பட்ட கையொப்பம் / Authorized Signature', rightX - 160, currentY, { align: 'right', width: 160 });

      currentY += 25;
      doc.fontSize(6.5).fillColor('#555555');
      doc.text('* இது கணினி மூலம் உருவாக்கப்பட்ட டிஜிட்டல் ரசீது. / This is a computer-generated digital receipt.', leftX, currentY, { align: 'center', width: pageWidth });
      doc.text('* சந்தா செலுத்தியதற்கான முதன்மை சட்டப்பூர்வ ஆதாரம் சந்தாதாரரின் கையொப்பமிட்ட பாஸ்புக் ஆகும் (ADR-11).', leftX, currentY + 9, { align: 'center', width: pageWidth });
      doc.text('* The primary acknowledged legal proof of payment is the signed physical paper passbook.', leftX, currentY + 18, { align: 'center', width: pageWidth });

      doc.end();
    });
  }
}
