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

        const declDate = isBlank ? '' : FontResolverHelper.formatPdfDate(data.declarationDate || new Date());
        const sancDate = isBlank ? '' : FontResolverHelper.formatPdfDate(data.sanctionDate || new Date());
        const feeAmount = data.statutoryFilingFee ?? 60n;
        const feeWords = isBlank ? '' : RupeeWordsHelper.toEnglishWords(feeAmount);
        const managingPartner = isBlank ? '' : (data.managingPartnerName || 'P. Kumaran (Managing Partner)');
        const firmName = isBlank ? '' : 'KUMARAN FINANCE';

        // Header matching Gazette Page 55 verbatim
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(12).text('FORM - V', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(10).text('(See Section 9(1) and Rule 10)', { align: 'center', width: pageWidth });
        doc.moveDown(1.5);

        // Place & Date on right matching Gazette Page 55
        const topY = doc.y;
        doc.font(regularFont).fontSize(10.5).text('Place: ', 360, topY);
        if (!isBlank) {
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('Perundurai', 400, topY);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }

        doc.font(regularFont).fontSize(10.5).text('Date: ', 360, topY + 22);
        if (!isBlank) {
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(declDate, 400, topY + 22);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }

        doc.y = topY;
        doc.font(regularFont).fontSize(10.5).text('To', 50, topY);
        doc.text('The Registrar of Chits,', 50, topY + 20);
        doc.text('', 50, topY + 40, { continued: true });
        // Gazette Page 55 Path 125: line under address
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai / Erode District, Tamil Nadu.', '________________________________________');

        doc.y = Math.max(doc.y, topY + 85);
        doc.font(regularFont).fontSize(11).text('Dear Sir,', 50, doc.y);
        doc.moveDown(1.5);

        // Paragraph 1 verbatim from Gazette Page 55 (has 3 underlines: dated the, amount of Rs, duration)
        doc.font(regularFont).fontSize(10.5).text('By your letter dated the ', 50, doc.y, { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : sancDate, '____________________', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' you were pleased to grant me / us certificate of registration to commence a new chit of a chit amount of Rs ', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(data.chitValue), '____________________', { lineGap: 7.5 });
        doc.moveDown(0.25);
        StatutoryFormHelper.renderStatic(doc, regularFont, 'and of a duration ', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(data.durationMonths), '____________________', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' months.', { lineGap: 7.5 });
        doc.moveDown(2.0);

        // Paragraph 2 verbatim from Gazette Page 55 (NO underlines)
        doc.font(regularFont).fontSize(10.5).text(
          '2. I / We have subsequently enlisted the required number of members and we hereby declare in terms of sub-section(1) of Section 9 of the Chit Funds Act, 1982 (Central Act No. 40 of 1982) that all the tickets specified in the chit agreement have been fully subscribed.',
          50,
          doc.y,
          { align: 'justify', lineGap: 7.5 },
        );
        doc.moveDown(2.0);

        // Paragraph 3 verbatim from Gazette Page 55 (has 1 underline after Rs)
        doc.font(regularFont).fontSize(10.5).text('3. I / We remit herewith a sum of Rs ', 50, doc.y, { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${RupeeWordsHelper.formatWholeRupees(feeAmount)} (${feeWords} only)`, '____________________', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees in words only) being the fees prescribed for the purpose of filing this declaration.', { lineGap: 7.5 });
        doc.moveDown(3.5);

        // Signatures matching Gazette Page 55 verbatim (NO underlines after Chairman / Secretary / Foreman!)
        const sigY = Math.max(doc.y, 530);
        doc.font(regularFont).fontSize(10.5).text('Yours faithfully,', 360, sigY);
        doc.text('Chairman', 360, sigY + 30);
        if (!isBlank) {
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(managingPartner, 360, sigY + 48);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }
        doc.text('Secretary', 360, sigY + 70);
        if (!isBlank) {
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('Partner / Authorised Signatory', 360, sigY + 88);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }

        doc.y = sigY + 115;
        doc.font(regularFont).fontSize(10.5).text('for and on behalf of (Foreman)', 50, doc.y);
        if (!isBlank) {
          doc.moveDown(0.2);
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(firmName, 50, doc.y);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }

        // Footnote matching Gazette Page 55 verbatim
        doc.y = 705;
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.5);
        doc.font(regularFont).fontSize(8).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          '----------------------------------------------------------------------------------------------------------------\n' +
          'Strike out or delete whatever is not applicable insert such designation(s) as may be appropriate to the applicant.',
          50,
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
