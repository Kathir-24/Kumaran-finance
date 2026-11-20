import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';

export interface FormIxPdfData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  maxDiscountCeiling: bigint;
  installmentMonth: number;
  auctionDate: Date | string;
  auctionTime?: string | null;
  drawVenue?: string | null;
  subscriberTicketNumber?: number | null;
  subscriberName?: string | null;
  subscriberNameTamil?: string | null;
  subscriberPhone?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  managingPartnerName?: string | null;
  sanctionOrderNumber?: string | null;
  isBlank?: boolean;
}

export class FormIxNoticeTemplate {
  static async generate(data: FormIxPdfData): Promise<Buffer> {
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
        StatutoryFormHelper.patchDocumentUnderline();

        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 40, bottom: 40, left: 45, right: 45 },
          bufferPages: true,
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

        const pageWidth = 595.28 - 90; // 505.28 pt printable
        const isBlank = Boolean(
          data.isBlank ||
          data.groupCode.startsWith('___') ||
          data.chitValue === 0n,
        );

        const aucDate = isBlank ? '' : FontResolverHelper.formatPdfDate(data.auctionDate);
        const aucTime = isBlank ? '' : (data.auctionTime || '11:00 AM');
        const firmName = isBlank ? '' : 'KUMARAN FINANCE';
        const officeAddress = isBlank
          ? ''
          : (data.drawVenue ||
             data.branchAddress ||
             '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052');
        const currentYear = new Date().getFullYear();
        const year2Digit = String(currentYear).slice(2);

        // Date breakdown for day / month blanks
        let dayStr = '';
        let monthStr = '';
        if (!isBlank && data.auctionDate) {
          const d = data.auctionDate instanceof Date ? data.auctionDate : new Date(data.auctionDate);
          if (!Number.isNaN(d.getTime())) {
            dayStr = String(d.getDate());
            monthStr = d.toLocaleString('en-IN', { month: 'long' });
          }
        }

        // Header matching Gazette Page 66
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(11).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10.5).text('FORM IX', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('(See Section 16 and Rule 16)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);

        doc.font(boldFont).fontSize(9.5).text('Notice to subscribers of Chit Number ', 45, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.groupCode, '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, boldFont, ' of 20', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : year2Digit, isBlank ? '____' : year2Digit);
        doc.moveTo(45, doc.y + 4).lineTo(550, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.8);

        // Addressed To & Place / Date
        const topY = doc.y;
        doc.font(regularFont).fontSize(8.5).text('To:', 45, topY);
        if (isBlank) {
          doc.text('Subscriber Name: ________________________________________', 45, topY + 14);
          doc.text('Ticket Number:   ____________________', 45, topY + 28);
        } else if (data.subscriberName) {
          const tamilSuffix = data.subscriberNameTamil ? ` / ${data.subscriberNameTamil}` : '';
          const ticketLabel = data.subscriberTicketNumber ? ` [Ticket #${data.subscriberTicketNumber}]` : '';
          doc.font(boldFont).fillColor(StatutoryFormHelper.DATA_BLUE).text(`${data.subscriberName}${tamilSuffix}${ticketLabel}`, 45, topY + 14);
          doc.font(regularFont).fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
          if (data.subscriberPhone) {
            doc.text(`Mobile: ${data.subscriberPhone}`, 45, topY + 28);
          }
          doc.text(`Subscriber, Chit Group: ${data.groupCode}`, 45, topY + 42);
        } else {
          doc.font(boldFont).fillColor(StatutoryFormHelper.DATA_BLUE).text(`All Esteemed Subscribers of Chit Group ${data.groupCode}`, 45, topY + 14);
          doc.font(regularFont).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(`${firmName}, Head Office - Perundurai`, 45, topY + 28);
        }

        doc.font(regularFont).fontSize(8.5).text('Place: ', 360, topY);
        doc.text('', 395, topY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.font(regularFont).fontSize(8.5).text('Date: ', 360, topY + 16);
        doc.text('', 395, topY + 16, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : aucDate, '____________________');

        doc.y = Math.max(doc.y, topY + 60);
        doc.font(regularFont).fontSize(9).text('Sir,', 45, doc.y);
        doc.moveDown(0.5);

        // Core Statutory Wording verbatim from Gazette Page 66
        doc.font(regularFont).fontSize(8.5).text('This is to inform you that the ', 45, doc.y, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.installmentMonth}th`, '__________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' draw in monthly / quarterly / half yearly / yearly chit No ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.groupCode, '____________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' 20', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : year2Digit, isBlank ? '____' : year2Digit, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' in which you are one of the subscribers will be held on ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : dayStr, '_______', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' day ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : monthStr, '____________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (month) 20', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : year2Digit, isBlank ? '____' : year2Digit, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' at ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : aucTime, '__________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' at ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : officeAddress, '________________________________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' be present at the draw in person or by your duly authorized agent.', { lineGap: 3.5 });
        doc.moveDown(1.2);

        // Signatures matching Gazette Page 66
        const sigY = doc.y;
        doc.font(regularFont).fontSize(8.5).text('Yours faithfully,', 360, sigY);
        doc.text('Secretary ', 360, sigY + 20, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Partner / Authorised Signatory', '____________________');

        doc.y = sigY + 45;
        doc.font(regularFont).fontSize(8.5).text('for and on behalf of (foreman) ', 360, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '____________________');

        doc.y += 30;
        doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor('#888888').stroke();
        doc.moveDown(0.2);
        doc.font(regularFont).fontSize(7.5).text(
          'Strike out or delete whatever is not applicable. Insert such designation(s) as may be appropriate.',
          45,
          doc.y,
        );

        // Pre-filled Operational Scheme Summary Box if applicable
        if (!isBlank) {
          doc.moveDown(0.8);
          const boxY = doc.y;
          doc.rect(45, boxY, pageWidth, 90).fillAndStroke('#f8f9fa', '#ced4da');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);

          doc.font(boldFont).fontSize(8.5).text('SCHEME & DRAW SUMMARY / ஏல விவரக் குறிப்பு:', 55, boxY + 8);
          doc.font(regularFont).fontSize(8);

          doc.text('Scheme Name:', 55, boxY + 24);
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`${data.groupName} (${data.groupCode})`, 180, boxY + 24);

          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text('Total Chit Value:', 55, boxY + 38);
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)}`, 180, boxY + 38);

          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text('Monthly Base Installment:', 55, boxY + 52);
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.baseInstallment)}`, 180, boxY + 52);

          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text('Max Auction Discount Ceiling:', 55, boxY + 66);
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.maxDiscountCeiling)} (25% / 1/4 Chit Value)`, 180, boxY + 66);
        }

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
