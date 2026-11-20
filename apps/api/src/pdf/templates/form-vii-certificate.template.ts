import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';

export interface FormViiPdfData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  sanctionOrderNumber?: string | null;
  registrationNumber?: string | null;
  commencementCertificateDate?: Date | string | null;
  copiesFurnishedDate?: Date | string | null;
  firstDrawDate?: Date | string | null;
  certificateDate?: Date | string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  managingPartnerName?: string | null;
  isBlank?: boolean;
}

export class FormViiCertificateTemplate {
  static async generate(data: FormViiPdfData): Promise<Buffer> {
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
        doc.font(boldFont).fontSize(11).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10.5).text('FORM – VII', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('(See Section 10(2) and Rule 12)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);
        doc.font(boldFont).fontSize(9.5).text(
          'CERTIFICATE ABOUT FURNISHING COPY OF THE CHIT AGREEMENT TO THE SUBSCRIBERS OF A CHIT',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(45, doc.y + 4).lineTo(550, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.8);

        // To Address
        const topY = doc.y;
        doc.font(regularFont).fontSize(8.5).text('To', 45, topY);
        doc.text('The Registrar of Chits,', 45, topY + 14);
        doc.text('', 45, topY + 28, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai / Erode District, Tamil Nadu.', '________________________________________');

        doc.y = Math.max(doc.y, topY + 52);
        doc.font(regularFont).fontSize(9).text('Dear Sir,', 45, doc.y);
        doc.moveDown(0.4);

        doc.font(regularFont).fontSize(8.5).text('The Chit Funds Act, 1982 (Central Act No.40 of 1982)', 45, doc.y);
        doc.moveDown(0.5);

        // Core Statement verbatim from Gazette Page 57
        doc.font(regularFont).fontSize(8.5).text('I / We ', 45, doc.y, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' the Foreman of the chit / chairman and secretary on behalf of the Foreman / Firm / Company conducting the chit, the chit agreement bearing registration number ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : regNo, '____________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' of 20', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(regYear).slice(2), isBlank ? '____' : String(regYear).slice(2), { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' has been registered in the office of the Registrar of Chits ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai / Erode', '____________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' do hereby certify that I / We have furnished to every subscriber of the chit a copy of the said chit agreement duly certified by me / us to be a true copy. The copies were furnished to each of the subscribers on ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${furnishedDate}.`, '____________________.', { lineGap: 3.5 });
        doc.moveDown(0.6);

        // Commencement Certificate date
        doc.font(regularFont).fontSize(8.5).text('The date of obtaining the certificate of commencement of the said chit granted under sub-section(2) of Section 9 is ', 45, doc.y, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${commencementDate}.`, '____________________.', { lineGap: 3.5 });
        doc.moveDown(0.6);

        // First draw date
        doc.font(regularFont).fontSize(8.5).text('The first draw of the said chit was held on ', 45, doc.y, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${firstDrawDate}.`, '____________________.', { lineGap: 3.5 });
        doc.moveDown(1.2);

        // Signatures matching Gazette Page 57
        const sigY = doc.y;
        doc.font(regularFont).fontSize(8.5).text('Yours faithfully,', 360, sigY);
        doc.text('Chairman ', 360, sigY + 20, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________');
        doc.text('Secretary ', 360, sigY + 40, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Partner / Authorised Signatory', '____________________');

        const placeDateY = sigY + 68;
        doc.font(regularFont).fontSize(8.5).text('Place: ', 45, placeDateY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.font(regularFont).fontSize(8.5).text('Date: ', 45, placeDateY + 16, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : certDate, '____________________');

        doc.font(regularFont).fontSize(8.5).text('for and on behalf of ', 360, placeDateY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '____________________');
        doc.text('(Foreman)', 360, placeDateY + 16);

        doc.y = placeDateY + 45;
        doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor('#888888').stroke();
        doc.moveDown(0.3);
        doc.font(regularFont).fontSize(7.5).text(
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
