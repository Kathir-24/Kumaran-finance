import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormVDeclarationData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  sanctionOrderNumber?: string | null;
  sanctionDate?: Date | null;
  declarationDate?: Date | null;
  statutoryFilingFee?: bigint;
  branchName?: string;
  branchAddress?: string;
  managingPartnerName?: string;
  subscribedTicketsCount?: number;
  subscribers?: Array<{
    ticketNumber: number;
    customerCode: string;
    customerName: string;
    phone: string;
  }>;
  isBlank?: boolean;
}

export class FormVDeclarationTemplate {
  public static async generate(data: FormVDeclarationData): Promise<Buffer> {
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
          margins: { top: 38, bottom: 38, left: 45, right: 45 },
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
        doc.font(boldFont).fontSize(12).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(11).text('FORM - V', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(9).text('(See Section 9(1) and Rule 10)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);
        doc.font(boldFont).fontSize(10.5).text(
          'DECLARATION TO BE FILED ABOUT SUBSCRIPTION TO ALL TICKETS OF A CHIT',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(45, doc.y + 4).lineTo(550, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.7);

        // Place & Date on right
        const topY = doc.y;
        doc.font(regularFont).fontSize(9.5).text('Place: ', 360, topY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.font(regularFont).fontSize(9.5).text('Date: ', 360, topY + 20, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : declDate, '____________________');

        doc.y = topY;
        doc.font(regularFont).fontSize(9.5).text('To', 45, topY);
        doc.text('The Registrar of Chits,', 45, topY + 18);
        doc.text('', 45, topY + 36, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai / Erode District, Tamil Nadu.', '________________________________________');

        doc.y = Math.max(doc.y, topY + 65);
        doc.font(regularFont).fontSize(10).text('Dear Sir,', 45, doc.y);
        doc.moveDown(0.7);

        // Paragraph 1 verbatim from Gazette Page 55
        doc.font(regularFont).fontSize(9.5).text('By your letter dated the ', 45, doc.y, { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : sancDate, '____________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' you were pleased to grant me / us certificate of registration to commence a new chit of a chit amount of Rs ', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(data.chitValue), '____________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' and of a duration ', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(data.durationMonths), '__________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' months.', { lineGap: 5.5 });
        doc.moveDown(1.0);

        // Paragraph 2 verbatim from Gazette Page 55
        doc.font(regularFont).fontSize(9.5).text(
          '2. I / We have subsequently enlisted the required number of members and we hereby declare in terms of sub-section(1) of Section 9 of the Chit Funds Act, 1982 (Central Act No. 40 of 1982) that all the tickets specified in the chit agreement have been fully subscribed.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5 },
        );
        doc.moveDown(1.0);

        // Paragraph 3 verbatim from Gazette Page 55
        doc.font(regularFont).fontSize(9.5).text('3. I / We remit herewith a sum of Rs ', 45, doc.y, { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(feeAmount), '__________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees in words only ', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : feeWords, '________________________________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ') being the fees prescribed for the purpose of filing this declaration.', { lineGap: 5.5 });
        doc.moveDown(1.0);

        // Registered Scheme Particulars Card
        const cardY = doc.y;
        doc.rect(45, cardY, pageWidth, 74).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(8.5).text('PARTICULARS OF REGISTERED CHIT SCHEME / பதிவு செய்யப்பட்ட சீட்டு விவரங்கள்:', 55, cardY + 7);
        doc.font(regularFont).fontSize(8);
        doc.text('Scheme Code & Name: ', 55, cardY + 23, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.groupCode} (${data.groupName})`, '________________________________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, '   |   Total Tickets: ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.totalTickets} Tickets`, '____');

        doc.text('Chit Value: ', 55, cardY + 40, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)}`, '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, '   |   Monthly Installment: ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `Rs. ${RupeeWordsHelper.formatWholeRupees(data.baseInstallment)}`, '__________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, '   |   Enrolled: ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '100% Fully Subscribed', '100%');

        doc.text('Sanction Order Ref: ', 55, cardY + 57, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : (data.sanctionOrderNumber || 'ROC/ERD/SANCTION/2026/042'), '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, '   |   Branch Venue: ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Head Office - Perundurai', '____________________');

        doc.y = cardY + 82;
        doc.moveDown(0.7);

        // Statutory Solemn Declaration
        doc.font(regularFont).fontSize(9).text(
          'I / We solemnly declare that all tickets in the chit scheme have been fully subscribed without any shortfall, and all particulars stated herein are true and correct to the best of my / our knowledge and belief.',
          45,
          doc.y,
          { align: 'justify', lineGap: 4.5 },
        );
        doc.moveDown(1.0);

        // Signatures matching Gazette Page 55
        const sigY = doc.y;
        doc.font(regularFont).fontSize(9.5).text('Yours faithfully,', 360, sigY);
        doc.text('Chairman: ', 360, sigY + 20, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________');
        doc.text('Secretary: ', 360, sigY + 40, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Partner / Authorised Signatory', '____________________');

        doc.y = sigY + 64;
        doc.font(regularFont).fontSize(9.5).text('for and on behalf of (Foreman): ', 45, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '________________________________________');

        // Official Registrar Filing Box
        doc.y += 20;
        const ackY = doc.y;
        doc.rect(45, ackY, pageWidth, 62).strokeColor('#888888').lineWidth(0.8).stroke();
        doc.font(boldFont).fontSize(8).fillColor('#333333').text('FOR REGISTRAR OF CHITS OFFICE USE ONLY / பதிவாளர் அலுவலக பயன்பாட்டிற்கு மட்டும்:', 55, ackY + 7);
        doc.font(regularFont).fontSize(7.5).fillColor('#555555');
        doc.text('Filing Date: ______________   |   Challan / Receipt No: ______________   |   Fee Verified: Rs. 60/-', 55, ackY + 22);
        doc.text('Date of Scrutiny: ______________   |   Entry in Register of Chits Vol: _____ Page: _____', 55, ackY + 36);
        doc.text('Initials of Receiving Officer: ______________________   |   Registrar Seal & Signature: ______________________', 55, ackY + 50);

        // Footnote
        doc.y = ackY + 70;
        doc.font(regularFont).fontSize(7.5).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          'Strike out or delete whatever is not applicable insert such designation(s) as may be appropriate to the applicant.',
          45,
          doc.y,
        );

        // If pre-filled with subscribers, attach Annexure Roster on Page 2
        if (!isBlank && data.subscribers && data.subscribers.length > 0) {
          doc.addPage();
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
          doc.font(boldFont).fontSize(11).text('ANNEXURE TO FORM V: SUBSCRIBER ENROLLMENT ROSTER', { align: 'center', width: pageWidth });
          doc.font(regularFont).fontSize(9).text(
            `Scheme: ${data.groupCode} (${data.groupName}) — Verified 100% Full Subscription (${data.totalTickets} of ${data.totalTickets} Tickets)`,
            { align: 'center', width: pageWidth },
          );
          doc.moveTo(45, doc.y + 4).lineTo(550, doc.y + 4).lineWidth(0.8).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
          doc.moveDown(0.6);

          const tableY = doc.y;
          const rowHeight = 25;
          const tableHeaderHeight = 22;
          doc.rect(45, tableY, pageWidth, tableHeaderHeight).fillAndStroke('#212529', '#212529');
          doc.fillColor('#fff').font(boldFont).fontSize(8.5);

          doc.text('Ticket #', 55, tableY + 6, { width: 50 });
          doc.text('Customer Code', 115, tableY + 6, { width: 85 });
          doc.text('Subscriber Name', 210, tableY + 6, { width: 190 });
          doc.text('Mobile Number', 410, tableY + 6, { width: 120, align: 'right' });

          let rowY = tableY + tableHeaderHeight;
          data.subscribers.forEach((sub, idx) => {
            const bg = idx % 2 === 0 ? '#f8f9fa' : '#ffffff';
            doc.rect(45, rowY, pageWidth, rowHeight).fillAndStroke(bg, '#e9ecef');

            doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).fontSize(8.5);
            doc.text(`#${sub.ticketNumber}`, 55, rowY + 7, { width: 50 });
            doc.font(regularFont).text(sub.customerCode, 115, rowY + 7, { width: 85 });
            doc.font(boldFont).text(sub.customerName, 210, rowY + 7, { width: 190 });
            doc.font(regularFont).text(sub.phone, 410, rowY + 7, { width: 120, align: 'right' });

            rowY += rowHeight;
          });

          // Attestation box below table
          const certBoxY = rowY + 12;
          doc.rect(45, certBoxY, pageWidth, 52).fillAndStroke('#f8f9fa', '#ced4da');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(8.5).text('STATUTORY VERIFICATION & ATTESTATION (Rule 10(2)):', 55, certBoxY + 7);
          doc.font(regularFont).fontSize(8);
          doc.text('Certified that the above 20 subscriber tickets constitute 100% full subscription of the chit scheme without any unallotted tickets.', 55, certBoxY + 22);
          doc.text(`Attested by Foreman: ${managingPartner}   |   Date: ${declDate}`, 55, certBoxY + 36);
        }

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
