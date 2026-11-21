import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';

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
          margins: { top: 45, bottom: 45, left: 50, right: 50 },
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

        const pageWidth = 595.28 - 100; // 495.28 pt printable
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

        // Header matching Gazette Page 57 verbatim
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(12).text('FORM – VII', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(10).text('(See Section 10(2) and Rule 12)', { align: 'center', width: pageWidth });
        doc.moveDown(1.8);

        // To Address matching Gazette Page 57
        doc.font(regularFont).fontSize(10.5).text('To', 50, doc.y);
        doc.text('The Registrar of Chits,', 50, doc.y + 16);
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai / Erode District, Tamil Nadu.', '________________________________________');

        doc.moveDown(2.2);
        doc.font(regularFont).fontSize(11).text('Dear Sir,', 50, doc.y);
        doc.moveDown(1.2);

        doc.font(boldFont).fontSize(10.5).text('The Chit Funds Act, 1982 (Central Act No.40 of 1982)', 50, doc.y);
        doc.moveDown(1.5);

        // Core Statement verbatim from Gazette Page 57 (has 5 underlines in main paragraph)
        doc.font(regularFont).fontSize(10.5).text('I / We ', 50, doc.y, { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' the Foreman of the chit / chairman and secretary on behalf of the Foreman / Firm / Company conducting the chit, the chit agreement bearing registration number ', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : regNo, '____________________', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' of 200', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(regYear).slice(2), isBlank ? '____' : String(regYear).slice(2), { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' has been registered in the office of the Registrar of Chits ', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai / Erode', '____________________', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' do hereby certify that I / We have furnished to every subscriber of the chit a copy of the said chit agreement duly certified by me / us to be a true copy. The copies were furnished to each of the subscribers on ', { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${furnishedDate}.`, '____________________.', { lineGap: 8 });
        doc.moveDown(1.8);

        // Commencement Certificate date (1 underline)
        doc.font(regularFont).fontSize(10.5).text('The date of obtaining the certificate of commencement of the said chit granted under sub-section(2) of Section 9 is ', 50, doc.y, { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${commencementDate}.`, '____________________.', { lineGap: 8 });
        doc.moveDown(1.8);

        // First draw date (1 underline)
        doc.font(regularFont).fontSize(10.5).text('The first draw of the said chit was held on ', 50, doc.y, { continued: true, lineGap: 8 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${firstDrawDate}.`, '____________________.', { lineGap: 8 });
        doc.moveDown(3.0);

        // Signatures and Place/Date matching Gazette Page 57 verbatim
        const sigY = Math.max(doc.y, 480);
        doc.font(regularFont).fontSize(10.5).text('Yours faithfully,', 360, sigY);
        doc.text('Chairman', 360, sigY + 30);
        if (!isBlank) {
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(managingPartner, 360, sigY + 46);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }
        doc.text('Secretary', 360, sigY + 68);
        if (!isBlank) {
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('Partner / Authorised Signatory', 360, sigY + 84);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }

        // Place and Date on left
        if (isBlank) {
          doc.font(regularFont).fontSize(10.5).text('Place: ', 50, sigY + 68);
          doc.font(regularFont).fontSize(10.5).text('Date: ', 50, sigY + 95);
        } else {
          doc.font(regularFont).fontSize(10.5).text('Place: ', 50, sigY + 68, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('Perundurai');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.font(regularFont).fontSize(10.5).text('Date: ', 50, sigY + 95, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(certDate);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }

        // for and on behalf of on right under Secretary
        doc.font(regularFont).fontSize(10.5).text('for and on behalf of………..', 360, sigY + 95);
        if (!isBlank) {
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(firmName, 360, sigY + 112);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }
        doc.text('(Foreman)', 360, sigY + (!isBlank ? 130 : 118));

        // Footnote matching Gazette Page 57 verbatim (divider line sits naturally below Foreman)
        doc.y = sigY + (!isBlank ? 152 : 138);
        doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.8);
        doc.font(regularFont).fontSize(9).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          'Strike out / delete whatever is not applicable. Insert the designation(s) as may be appropriate to the applicant.',
          45,
          doc.y,
          { width: pageWidth, lineGap: 3 },
        );

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
