import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormIiPdfData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  maxDiscountCeiling: bigint;
  foremanCommissionRate?: string | number | { toString(): string } | null;
  sanctionOrderNumber?: string | null;
  sanctionDate?: Date | string | null;
  applicationDate?: Date | string | null;
  statutoryRegistrationFee?: bigint;
  branchName?: string | null;
  branchAddress?: string | null;
  managingPartnerName?: string | null;
  runningChitsCount?: number;
  aggregateRunningChitsAmount?: bigint;
}

export class FormIiRegistrationTemplate {
  static async generate(data: FormIiPdfData): Promise<Buffer> {
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
        const appDate = FontResolverHelper.formatPdfDate(data.applicationDate || new Date());
        const sancDate = FontResolverHelper.formatPdfDate(data.sanctionDate || new Date());
        const feeAmount = data.statutoryRegistrationFee ?? 1000n;
        const feeWords = RupeeWordsHelper.toEnglishWords(feeAmount);
        const runningCount = data.runningChitsCount ?? 1;
        const aggAmount = data.aggregateRunningChitsAmount ?? data.chitValue;
        const aggWords = RupeeWordsHelper.toEnglishWords(aggAmount);
        const chitValueWords = RupeeWordsHelper.toEnglishWords(data.chitValue);
        const managingPartner = data.managingPartnerName || 'P. Kumaran (Managing Partner)';
        const firmName = 'KUMARAN FINANCE';
        const officeAddress =
          data.branchAddress || '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052';
        const sanctionNo = data.sanctionOrderNumber || 'ROC/ERD/SANCTION/PENDING';

        // Header
        doc.font(boldFont).fontSize(11).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10.5).text('FORM — II', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('(See Section 7 and Rule 5)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);
        doc.font(boldFont).fontSize(10).text('APPLICATION FOR REGISTRATION OF THE CHIT AGREEMENT', { align: 'center', width: pageWidth });
        doc.moveTo(45, doc.y + 4).lineTo(550, doc.y + 4).stroke();
        doc.moveDown(0.8);

        // Place & Date
        const topY = doc.y;
        doc.font(boldFont).fontSize(8.5).text('To:', 45, topY);
        doc.font(regularFont).fontSize(8.5);
        doc.text('The Registrar of Chits,', 45, topY + 12);
        doc.text('Perundurai / Erode District,', 45, topY + 24);
        doc.text('Tamil Nadu.', 45, topY + 36);

        doc.font(boldFont).text('Place: Perundurai', 360, topY);
        doc.font(boldFont).text(`Date: ${appDate}`, 360, topY + 12);

        doc.y = topY + 65;
        doc.font(boldFont).fontSize(9).text('Dear Sir,', 45, doc.y);
        doc.moveDown(0.4);

        doc.font(regularFont).fontSize(8.5).text(
          `1. We, the Managing Partner and Partners on behalf of the foreman conducting chit business under the name and style of ${firmName} situated at ${officeAddress}, hereby apply for registration of the Chit Agreement for the scheme detailed below:`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.4);

        // Chit Summary Box
        const boxY = doc.y;
        doc.rect(45, boxY, pageWidth, 58).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor('#000');
        doc.font(boldFont).fontSize(8.5);
        doc.text(`Scheme Code: ${data.groupCode} (${data.groupName})`, 55, boxY + 6);
        doc.font(regularFont).fontSize(8);
        doc.text(`Chit Value: Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)} (${chitValueWords})`, 55, boxY + 18);
        doc.text(`Duration: ${data.durationMonths} Months | Total Tickets: ${data.totalTickets} Tickets | Monthly Base Installment: Rs. ${RupeeWordsHelper.formatWholeRupees(data.baseInstallment)}`, 55, boxY + 30);
        doc.text(`Discount Ceiling (25%): Rs. ${RupeeWordsHelper.formatWholeRupees(data.maxDiscountCeiling)} | Frozen Foreman Commission: 4.00%`, 55, boxY + 42);

        doc.y = boxY + 66;
        doc.moveDown(0.4);

        doc.font(regularFont).fontSize(8.5).text(
          `2. The Chit Agreement in duplicate is attached herewith together with a sum of Rs. ${RupeeWordsHelper.formatWholeRupees(feeAmount)} (${feeWords} only) being the registration fees as required under the Act and the Tamil Nadu Chit Funds Rules, 1984.`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.5);

        doc.text(
          `3. The number of current chits which are running as on the date of this application is ${runningCount} and the aggregate chit amount of these chits involved therein is Rs. ${RupeeWordsHelper.formatWholeRupees(aggAmount)} (${aggWords} only) which is within the limits specified in Section 13 of the Chit Funds Act, 1982 (Central Act No. 40 of 1982).`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.5);

        doc.text(
          `4. A certified true copy of the previous sanction obtained in Form I-B under Section 4 of the above Act for commencement and conduct of the chit in question is enclosed (Sanction Reference: ${sanctionNo}, Dated: ${sancDate}). A copy of the application dated ${appDate} together with its enclosures made to the State Government / authorized officer in this behalf is also enclosed for information and ready reference.`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.5);

        doc.text(
          `5. I / We remit herewith a sum of Rs. ${RupeeWordsHelper.formatWholeRupees(feeAmount)} (${feeWords} only) being the fee prescribed for the purpose.`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.8);

        // Statutory Declaration
        doc.font(boldFont).fontSize(9).text('DECLARATION', { align: 'center', width: pageWidth });
        doc.moveDown(0.2);
        doc.font(regularFont).fontSize(8.5).text(
          `6. I / We have read the Chit Funds Act, 1982 (Central Act No. 40 of 1982) and the Rules made by the State Government thereunder and I / We declare that the chit agreement has been drawn up in conformity with the provisions of the said Act and the Rules.\n\nThe above statements are true and complete to the best of my / our knowledge, information and belief.`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(1.5);

        // Signatures
        const sigY = doc.y;
        doc.font(boldFont).fontSize(8.5).text('Yours faithfully,', 360, sigY);
        doc.moveDown(2);
        doc.text(`For and on behalf of Foreman:`, 360, sigY + 35);
        doc.text(firmName, 360, sigY + 47);
        doc.font(regularFont).text(managingPartner, 360, sigY + 60);
        doc.text('(Managing Partner / Foreman)', 360, sigY + 72);

        doc.font(boldFont).fontSize(8).text('Enclosures Attached:', 45, sigY + 35);
        doc.font(regularFont).fontSize(8);
        doc.text('1. Chit Agreement in Duplicate', 45, sigY + 47);
        doc.text('2. Certified Copy of Prior Sanction (Form I-B)', 45, sigY + 59);
        doc.text('3. Copy of Application under Section 4 with Annexure', 45, sigY + 71);
        doc.text('4. Treasury Challan / Receipt for Registration Fee', 45, sigY + 83);

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
