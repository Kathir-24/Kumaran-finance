import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormViiCertificateData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  sanctionOrderNumber?: string | null;
  registrationNumber?: string | null;
  commencementCertificateDate?: Date | null;
  copiesFurnishedDate?: Date | null;
  firstDrawDate?: Date | null;
  certificateDate?: Date | null;
  branchName?: string;
  branchAddress?: string;
  managingPartnerName?: string;
  isBlank?: boolean;
}

export class FormViiCertificateTemplate {
  public static async generate(data: FormViiCertificateData): Promise<Buffer> {
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
          margins: { top: 40, bottom: 40, left: 45, right: 45 },
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

        const certDate = isBlank ? '' : FontResolverHelper.formatPdfDate(data.certificateDate || new Date());
        const furnishedDate = isBlank
          ? ''
          : FontResolverHelper.formatPdfDate(data.copiesFurnishedDate || new Date());
        const commencementDate = isBlank
          ? ''
          : FontResolverHelper.formatPdfDate(data.commencementCertificateDate || new Date());
        const firstDrawDate = isBlank ? '' : FontResolverHelper.formatPdfDate(data.firstDrawDate || new Date());
        const managingPartner = isBlank ? '' : (data.managingPartnerName || 'P. Kumaran (Managing Partner)');
        const firmName = isBlank ? '' : 'KUMARAN FINANCE';
        const regNo = isBlank ? '' : (data.registrationNumber || data.sanctionOrderNumber || 'ROC/ERD/REG/2026/042');
        const regYear = new Date().getFullYear();

        // Header matching Gazette Page 57
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(12).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(11).text('FORM – VII', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(9).text('(See Section 10(2) and Rule 12)', { align: 'center', width: pageWidth });
        doc.moveDown(0.4);
        doc.font(boldFont).fontSize(10.5).text(
          'CERTIFICATE ABOUT FURNISHING COPY OF THE CHIT AGREEMENT TO THE SUBSCRIBERS OF A CHIT',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(45, doc.y + 4).lineTo(550, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.8);

        // To Address & Place / Date
        const topY = doc.y;
        doc.font(regularFont).fontSize(9.5).text('To', 45, topY);
        doc.text('The Registrar of Chits,', 45, topY + 18);
        doc.text('', 45, topY + 36, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai / Erode District, Tamil Nadu.', '________________________________________');

        doc.font(regularFont).fontSize(9.5).text('Place: ', 360, topY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.font(regularFont).fontSize(9.5).text('Date: ', 360, topY + 20, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : certDate, '____________________');

        doc.y = Math.max(doc.y, topY + 65);
        doc.font(regularFont).fontSize(10).text('Dear Sir,', 45, doc.y);
        doc.moveDown(0.6);

        doc.font(boldFont).fontSize(9.5).text('The Chit Funds Act, 1982 (Central Act No.40 of 1982)', 45, doc.y);
        doc.moveDown(0.8);

        // Core Statement verbatim from Gazette Page 57
        doc.font(regularFont).fontSize(9.5).text('I / We ', 45, doc.y, { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' the Foreman of the chit / chairman and secretary on behalf of the Foreman / Firm / Company conducting the chit, the chit agreement bearing registration number ', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : regNo, '____________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' of 20', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(regYear).slice(2), isBlank ? '____' : String(regYear).slice(2), { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' has been registered in the office of the Registrar of Chits ', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai / Erode', '____________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' do hereby certify that I / We have furnished to every subscriber of the chit a copy of the said chit agreement duly certified by me / us to be a true copy. The copies were furnished to each of the subscribers on ', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${furnishedDate}.`, '____________________.', { lineGap: 5.5 });
        doc.moveDown(0.8);

        // Commencement Certificate date
        doc.font(regularFont).fontSize(9.5).text('The date of obtaining the certificate of commencement of the said chit granted under sub-section(2) of Section 9 is ', 45, doc.y, { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${commencementDate}.`, '____________________.', { lineGap: 5.5 });
        doc.moveDown(0.8);

        // First draw date
        doc.font(regularFont).fontSize(9.5).text('The first draw of the said chit was held on ', 45, doc.y, { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${firstDrawDate}.`, '____________________.', { lineGap: 5.5 });
        doc.moveDown(0.8);

        // Scheme Details Summary Card
        const cardY = doc.y;
        doc.rect(45, cardY, pageWidth, 54).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(8.5).text('PARTICULARS OF REGISTERED CHIT SCHEME & SUBSCRIBERS / சீட்டு மற்றும் சந்தாதாரர் விவரங்கள்:', 55, cardY + 7);
        doc.font(regularFont).fontSize(8);
        doc.text('Chit Scheme: ', 55, cardY + 22, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.groupCode} (${data.groupName})`, '________________________________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, '   |   Chit Value: ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)}`, '____________________');

        doc.text('Total Subscribers / Tickets: ', 55, cardY + 36, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.totalTickets} Members (100% Subscribed)`, '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, '   |   True Copies Furnished: ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'All Enrolled Members', '____________________');

        doc.y = cardY + 62;

        // Statutory Compliance Affirmation Box
        const affY = doc.y;
        doc.rect(45, affY, pageWidth, 48).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(8.5).text('STATUTORY COMPLIANCE AFFIRMATION (Section 10(2) & Rule 12):', 55, affY + 7);
        doc.font(regularFont).fontSize(8);
        doc.text(
          `I / We confirm that every enrolled subscriber in Chit Group ${isBlank ? '__________' : data.groupCode} has received an exact certified true copy of the registered chit agreement prior to the commencement of the chit business in compliance with Section 10(2).`,
          55,
          affY + 20,
          { width: pageWidth - 20, lineGap: 3 },
        );

        doc.y = affY + 56;

        // Signatures matching Gazette Page 57
        const sigY = doc.y;
        doc.font(regularFont).fontSize(9.5).text('Yours faithfully,', 360, sigY);
        doc.text('Chairman: ', 360, sigY + 20, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________');
        doc.text('Secretary: ', 360, sigY + 40, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Partner / Authorised Signatory', '____________________');

        doc.y = sigY + 64;
        doc.font(regularFont).fontSize(9.5).text('for and on behalf of (Foreman): ', 45, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '____________________');

        // Official Registrar Acknowledgement Box
        doc.y += 20;
        const ackY = doc.y;
        doc.rect(45, ackY, pageWidth, 52).strokeColor('#888888').lineWidth(0.8).stroke();
        doc.font(boldFont).fontSize(8).fillColor('#333333').text('FOR REGISTRAR OF CHITS OFFICE ACKNOWLEDGEMENT / பதிவாளர் அலுவலக பயன்பாட்டிற்கு:', 55, ackY + 7);
        doc.font(regularFont).fontSize(7.5).fillColor('#555555');
        doc.text('Received Form VII Certificate under Sec 10(2) on: ______________   |   Challan / Filing Ref: ______________', 55, ackY + 22);
        doc.text('Verified By (Name & Designation): ______________________   |   Registrar Official Seal & Signature: ______________________', 55, ackY + 36);

        // Footnote
        doc.y = ackY + 58;
        doc.font(regularFont).fontSize(7.5).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          'Strike out / delete whatever is not applicable. Insert the designation(s) as may be appropriate to the applicant.',
          45,
          doc.y,
        );

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
