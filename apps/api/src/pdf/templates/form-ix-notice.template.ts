import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormIxNoticeData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  maxDiscountCeiling: bigint;
  installmentMonth: number;
  auctionDate: Date;
  auctionTime?: string;
  drawVenue?: string;
  subscriberTicketNumber?: number | null;
  subscriberName?: string | null;
  subscriberNameTamil?: string | null;
  subscriberPhone?: string | null;
  branchName?: string;
  branchAddress?: string;
  managingPartnerName?: string;
  sanctionOrderNumber?: string | null;
  isBlank?: boolean;
}

export class FormIxNoticeTemplate {
  public static async generate(data: FormIxNoticeData): Promise<Buffer> {
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

        // Standard A4 portrait (595.28 x 841.89 pt)
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 35, bottom: 35, left: 45, right: 45 },
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
        doc.font(boldFont).fontSize(13).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(12).text('FORM IX', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(10).text('(See Section 16 and Rule 16)', { align: 'center', width: pageWidth });
        doc.moveDown(0.6);

        doc.font(boldFont).fontSize(11).text('Notice to subscribers of Chit Number ', 45, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.groupCode, '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, boldFont, ' of 20', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : year2Digit, isBlank ? '____' : year2Digit);
        doc.moveTo(45, doc.y + 6).lineTo(550, doc.y + 6).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(1.5);

        // Addressed To & Place / Date
        const topY = doc.y;
        doc.font(regularFont).fontSize(10.5).text('To:', 45, topY);
        if (isBlank) {
          doc.text('Subscriber Name: ________________________________________', 45, topY + 18);
          doc.text('Ticket Number:   ____________________', 45, topY + 36);
        } else if (data.subscriberName) {
          const tamilSuffix = data.subscriberNameTamil ? ` / ${data.subscriberNameTamil}` : '';
          const ticketLabel = data.subscriberTicketNumber ? ` [Ticket #${data.subscriberTicketNumber}]` : '';
          doc.font(boldFont).fillColor(StatutoryFormHelper.DATA_BLUE).text(`${data.subscriberName}${tamilSuffix}${ticketLabel}`, 45, topY + 18);
          doc.font(regularFont).fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
          if (data.subscriberPhone) {
            doc.text(`Mobile: ${data.subscriberPhone}`, 45, topY + 36);
          }
          doc.text(`Subscriber, Chit Group: ${data.groupCode}`, 45, topY + 54);
        } else {
          doc.font(boldFont).fillColor(StatutoryFormHelper.DATA_BLUE).text(`All Esteemed Subscribers of Chit Group ${data.groupCode}`, 45, topY + 18);
          doc.font(regularFont).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(`${firmName}, Head Office - Perundurai`, 45, topY + 36);
        }

        doc.font(regularFont).fontSize(10.5).text('Place: ', 360, topY);
        doc.text('', 400, topY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.font(regularFont).fontSize(10.5).text('Date: ', 360, topY + 22);
        doc.text('', 400, topY + 22, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : aucDate, '____________________');

        doc.y = Math.max(doc.y, topY + 80);
        doc.font(regularFont).fontSize(11).text('Sir,', 45, doc.y);
        doc.moveDown(1.2);

        // Core Statutory Wording verbatim from Gazette Page 66
        doc.font(regularFont).fontSize(11).text('This is to inform you that the ', 45, doc.y, { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.installmentMonth}th`, '__________', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' draw in monthly / quarterly / half yearly / yearly chit No ', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.groupCode, '____________________', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' 20', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : year2Digit, isBlank ? '____' : year2Digit, { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' in which you are one of the subscribers will be held on ', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : dayStr, '_______', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' day ', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : monthStr, '____________________', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (month) 20', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : year2Digit, isBlank ? '____' : year2Digit, { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' at ', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : aucTime, '__________', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' at ', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : officeAddress, '________________________________________', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' be present at the draw in person or by your duly authorized agent.', { lineGap: 8 });
        doc.moveDown(3.0);

        // Signatures matching Gazette Page 66 verbatim
        const sigY = Math.max(doc.y, 520);
        doc.font(regularFont).fontSize(10.5).text('Yours faithfully,', 360, sigY);
        doc.text('Secretary ', 360, sigY + 32, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Partner / Authorised Signatory', '____________________');

        doc.y = sigY + 75;
        doc.font(regularFont).fontSize(10.5).text('for and on behalf of (foreman) ', 45, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '________________________________________');

        // Footnote matching Gazette Page 66 verbatim
        doc.y = 705;
        doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.5);
        doc.font(regularFont).fontSize(8).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          'Strike out or delete whatever is not applicable. Insert such designation(s) as may be appropriate.',
          45,
          doc.y,
          { width: pageWidth, lineGap: 2 },
        );

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
