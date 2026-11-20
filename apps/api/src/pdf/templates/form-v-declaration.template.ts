import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';

export interface FormVPdfData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  sanctionOrderNumber?: string | null;
  sanctionDate?: Date | string | null;
  declarationDate?: Date | string | null;
  statutoryFilingFee?: bigint;
  branchName?: string | null;
  branchAddress?: string | null;
  managingPartnerName?: string | null;
  subscribedTicketsCount: number;
  subscribers?: Array<{
    ticketNumber: number;
    customerName: string;
    customerCode: string;
    phone: string;
  }>;
  isBlank?: boolean;
}

export class FormVDeclarationTemplate {
  static async generate(data: FormVPdfData): Promise<Buffer> {
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

        const declDate = isBlank ? '' : FontResolverHelper.formatPdfDate(data.declarationDate || new Date());
        const sancDate = isBlank ? '' : FontResolverHelper.formatPdfDate(data.sanctionDate || new Date());
        const feeAmount = data.statutoryFilingFee ?? 60n;
        const feeWords = isBlank ? '' : RupeeWordsHelper.toEnglishWords(feeAmount);
        const managingPartner = isBlank ? '' : (data.managingPartnerName || 'P. Kumaran (Managing Partner)');
        const firmName = isBlank ? '' : 'KUMARAN FINANCE';

        // Header matching Gazette Page 55
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(11).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10.5).text('FORM - V', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('(See Section 9(1) and Rule 10)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);
        doc.font(boldFont).fontSize(9.5).text(
          'DECLARATION TO BE FILED ABOUT SUBSCRIPTION TO ALL TICKETS OF A CHIT',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(45, doc.y + 4).lineTo(550, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.8);

        // Place & Date on right
        const topY = doc.y;
        doc.font(regularFont).fontSize(8.5).text('Place: ', 360, topY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.font(regularFont).fontSize(8.5).text('Date: ', 360, topY + 14, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : declDate, '____________________');

        doc.y = topY;
        doc.font(regularFont).fontSize(8.5).text('To', 45, topY);
        doc.text('The Registrar of Chits,', 45, topY + 12);
        doc.text('', 45, topY + 24, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai / Erode District, Tamil Nadu.', '________________________________________');

        doc.y = topY + 55;
        doc.font(regularFont).fontSize(9).text('Dear Sir,', 45, doc.y);
        doc.moveDown(0.5);

        // Paragraph 1 verbatim from Gazette Page 55
        doc.font(regularFont).fontSize(8.5).text('By your letter dated the ', 45, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : sancDate, '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' you were pleased to grant me / us certificate of registration to commence a new chit of a chit amount of Rs ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(data.chitValue), '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' and of a duration ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(data.durationMonths), '__________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' months.');
        doc.moveDown(0.6);

        // Paragraph 2 verbatim from Gazette Page 55
        doc.font(regularFont).fontSize(8.5).text(
          '2. I / We have subsequently enlisted the required number of members and we hereby declare in terms of sub-section(1) of Section 9 of the Chit Funds Act, 1982 (Central Act No. 40 of 1982) that all the tickets specified in the chit agreement have been fully subscribed.',
          45,
          doc.y,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.6);

        // Paragraph 3 verbatim from Gazette Page 55
        doc.font(regularFont).fontSize(8.5).text('3. I / We remit herewith a sum of Rs ', 45, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(feeAmount), '__________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees in words only ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : feeWords, '________________________________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ') being the fees prescribed for the purpose of filing this declaration.');
        doc.moveDown(1.2);

        // Signatures matching Gazette Page 55
        const sigY = doc.y;
        doc.font(regularFont).fontSize(8.5).text('Yours faithfully,', 360, sigY);
        doc.text('Chairman ', 360, sigY + 20, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________');
        doc.text('Secretary ', 360, sigY + 40, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Partner / Authorised Signatory', '____________________');

        doc.y = sigY + 65;
        doc.font(regularFont).fontSize(8.5).text('for and on behalf of (Foreman) ', 45, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '________________________________________');

        doc.y += 25;
        doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor('#888888').stroke();
        doc.moveDown(0.2);
        doc.font(regularFont).fontSize(7.5).text(
          'Strike out or delete whatever is not applicable insert such designation(s) as may be appropriate to the applicant.',
          45,
          doc.y,
        );

        // If pre-filled with subscribers, attach Annexure Roster on Page 2
        if (!isBlank && data.subscribers && data.subscribers.length > 0) {
          doc.addPage();
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
          doc.font(boldFont).fontSize(10).text('ANNEXURE TO FORM V: SUBSCRIBER ENROLLMENT ROSTER', { align: 'center', width: pageWidth });
          doc.font(regularFont).fontSize(8).text(
            `Scheme: ${data.groupCode} (${data.groupName}) — Verified 100% Full Subscription (${data.totalTickets} of ${data.totalTickets} Tickets)`,
            { align: 'center', width: pageWidth },
          );
          doc.moveTo(45, doc.y + 3).lineTo(550, doc.y + 3).lineWidth(0.8).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
          doc.moveDown(0.5);

          const tableY = doc.y;
          const rowHeight = 14;
          const tableHeaderHeight = 16;
          doc.rect(45, tableY, pageWidth, tableHeaderHeight).fillAndStroke('#212529', '#212529');
          doc.fillColor('#fff').font(boldFont).fontSize(7.5);

          doc.text('Ticket #', 50, tableY + 4, { width: 50 });
          doc.text('Customer Code', 105, tableY + 4, { width: 85 });
          doc.text('Subscriber Name', 195, tableY + 4, { width: 195 });
          doc.text('Mobile Number', 400, tableY + 4, { width: 120, align: 'right' });

          let rowY = tableY + tableHeaderHeight;
          data.subscribers.forEach((sub, idx) => {
            const bg = idx % 2 === 0 ? '#f8f9fa' : '#ffffff';
            doc.rect(45, rowY, pageWidth, rowHeight).fillAndStroke(bg, '#e9ecef');

            doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).fontSize(7.5);
            doc.text(`#${sub.ticketNumber}`, 50, rowY + 3, { width: 50 });
            doc.font(regularFont).text(sub.customerCode, 105, rowY + 3, { width: 85 });
            doc.font(boldFont).text(sub.customerName, 195, rowY + 3, { width: 195 });
            doc.font(regularFont).text(sub.phone, 400, rowY + 3, { width: 120, align: 'right' });

            rowY += rowHeight;
          });
        }

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
