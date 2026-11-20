import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormIiRegistrationData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  maxDiscountCeiling: bigint;
  foremanCommissionRate: string | any;
  sanctionOrderNumber?: string | null;
  sanctionDate?: Date | null;
  applicationDate?: Date | null;
  statutoryRegistrationFee?: bigint;
  branchName?: string;
  branchAddress?: string;
  managingPartnerName?: string;
  runningChitsCount?: number;
  aggregateRunningChitsAmount?: bigint;
  isBlank?: boolean;
}

export class FormIiRegistrationTemplate {
  public static async generate(data: FormIiRegistrationData): Promise<Buffer> {
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

        const appDate = isBlank ? '' : FontResolverHelper.formatPdfDate(data.applicationDate || new Date());
        const sancDate = isBlank ? '' : FontResolverHelper.formatPdfDate(data.sanctionDate || new Date());
        const feeAmount = data.statutoryRegistrationFee ?? 1000n;
        const feeWords = isBlank ? '' : RupeeWordsHelper.toEnglishWords(feeAmount);
        const runningCount = data.runningChitsCount ?? 5;
        const aggAmount = data.aggregateRunningChitsAmount ?? data.chitValue;
        const managingPartner = isBlank ? '' : (data.managingPartnerName || 'P. Kumaran (Managing Partner)');
        const firmName = isBlank ? '' : 'KUMARAN FINANCE';
        const officeAddress = isBlank
          ? ''
          : (data.branchAddress || '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052');

        // Header matching Gazette Page 49
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(11.5).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(11).text('FORM — II', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(9).text('(See Section 7 and Rule 5)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);
        doc.font(boldFont).fontSize(10.5).text('APPLICATION FOR REGISTRATION OF THE CHIT AGREEMENT', { align: 'center', width: pageWidth });
        doc.moveTo(45, doc.y + 4).lineTo(550, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.7);

        // To & Place / Date
        const topY = doc.y;
        doc.font(regularFont).fontSize(9).text('To', 45, topY);
        doc.text('The Registrar of Chits,', 45, topY + 16);
        doc.text('', 45, topY + 32, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai / Erode District, Tamil Nadu.', '________________________________________.');

        doc.font(regularFont).fontSize(9).text('Place: ', 360, topY);
        doc.text('', 395, topY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.font(regularFont).fontSize(9).text('Date: ', 360, topY + 18);
        doc.text('', 395, topY + 18, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : appDate, '____________________');

        doc.y = Math.max(doc.y, topY + 56);
        doc.font(regularFont).fontSize(9.5).text('Dear Sir,', 45, doc.y);
        doc.moveDown(0.5);

        // (a) and (b) verbatim from Gazette Page 49
        doc.font(regularFont).fontSize(9).text('(a) I ', 45, doc.y, { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '____________________', '____________________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' S/o Sri. ', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '____________________', '____________________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' being the foreman conducting chit under the name and style of * ', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '____________________', '____________________.', { lineGap: 4.5 });
        doc.moveDown(0.5);

        doc.font(regularFont).fontSize(9).text('(b) We ', 45, doc.y, { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' the Chairman and Secretary respectively of the foreman conducting chit business under the name and style of * ', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '____________________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' at ', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : officeAddress, '________________________________________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' hereby apply for registration of the Chit Agreement.', { lineGap: 4.5 });
        doc.moveDown(0.5);

        // (2)
        doc.font(regularFont).fontSize(9).text('(2) The Chit Agreement in duplicate is attached herewith together with a sum of Rs. ', 45, doc.y, { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(feeAmount), '__________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' being the registration fees as required under the Act of Chit Funds Rules, 1984.', { lineGap: 4.5 });
        doc.moveDown(0.5);

        // (3)
        doc.font(regularFont).fontSize(9).text('(3) The number of current chits which are running as on the date of this application is ', 45, doc.y, { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(runningCount), '__________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' and the aggregate chit amount of these chits involved therein is Rs. ', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(aggAmount), '____________________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' which is within the limits specified in Section 13 of the Chit Funds Act, 1982 (Central Act No. 40 of 1982).', { lineGap: 4.5 });
        doc.moveDown(0.5);

        // (4)
        doc.font(regularFont).fontSize(9).text('(4) A certified true copy of the sanction obtained in Form IB under Section 4 of the above Act for commencement and conduct of the chit in question is enclosed. A copy of the application dated the ', 45, doc.y, { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : sancDate, '____________________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' together with its enclosures made to the State Government / authorized officer in this behalf is also enclosed for information and ready reference.', { lineGap: 4.5 });
        doc.moveDown(0.5);

        // (5)
        doc.font(regularFont).fontSize(9).text('(5) I / We remit herewith a sum of Rs. ', 45, doc.y, { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(feeAmount), '__________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees ', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${feeWords} only`, '________________________________________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ') being the fee prescribed for the purpose.', { lineGap: 4.5 });
        doc.moveDown(0.6);

        // DECLARATION
        doc.font(boldFont).fontSize(9.5).text('DECLARATION', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);
        doc.font(regularFont).fontSize(9).text(
          '(6) I / We have read the Chit Funds Act, 1982 (Central Act No. 40 of 1982) and the Rules made by the State Government thereunder and I / We declare that the chit agreement has been drawn up in conformity with the provisions of the said Act and the Rules.',
          45,
          doc.y,
          { align: 'justify', lineGap: 4 },
        );
        doc.moveDown(0.4);

        doc.font(regularFont).fontSize(9).text(
          'The above statements are true and complete to the best of my / our knowledge, information and belief.',
          45,
          doc.y,
          { align: 'justify', lineGap: 4 },
        );
        doc.moveDown(0.6);

        // Signatures matching Gazette Page 50
        const sigY = doc.y;
        doc.font(regularFont).fontSize(9).text('Yours faithfully,', 360, sigY);
        doc.text('Chairman ', 360, sigY + 18, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________');
        doc.text('Secretary ', 360, sigY + 36, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Partner / Authorised Signatory', '____________________');
        doc.text('Name(s) ', 360, sigY + 54, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________');
        doc.text('Designation (s) ', 360, sigY + 72, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Managing Partner / Foreman', '____________________');

        doc.y = sigY + 92;
        doc.font(regularFont).fontSize(9).text('* for and on behalf of Foreman ', 45, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '________________________________________');

        // Footnote matching Gazette Page 50 verbatim
        doc.y = sigY + 116;
        doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.3);
        doc.font(regularFont).fontSize(7.5).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          'Note 1. * Here enter the name of the applicant institution if any.\n2. Strike out or delete whatever is not applicable insert the designation(s) as may be appropriate to the applicant.',
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
