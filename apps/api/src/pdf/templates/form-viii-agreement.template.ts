import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';

export interface FormViiiPdfData {
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
  registrationNumber?: string | null;
  registrationDate?: Date | string | null;
  firstDrawDate?: Date | string | null;
  drawVenue?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  managingPartnerName?: string | null;
  subscribers?: Array<{
    ticketNumber: number;
    customerName: string;
    customerAddress?: string | null;
    phone: string;
  }>;
  isBlank?: boolean;
}

export class FormViiiAgreementTemplate {
  static async generate(data: FormViiiPdfData): Promise<Buffer> {
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
          margins: { top: 35, bottom: 35, left: 40, right: 40 },
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

        const pageWidth = 595.28 - 80; // 515.28 pt printable
        const isBlank = Boolean(
          data.isBlank ||
          data.groupCode.startsWith('___') ||
          data.chitValue === 0n,
        );

        const chitValueWords = isBlank ? '' : RupeeWordsHelper.toEnglishWords(data.chitValue);
        const baseInstWords = isBlank ? '' : RupeeWordsHelper.toEnglishWords(data.baseInstallment);
        const maxDiscountWords = isBlank ? '' : RupeeWordsHelper.toEnglishWords(data.maxDiscountCeiling);
        const managingPartner = isBlank ? '' : (data.managingPartnerName || 'P. Kumaran (Managing Partner)');
        const firmName = isBlank ? '' : 'KUMARAN FINANCE (Head Office: Perundurai)';
        const officeAddress = isBlank
          ? ''
          : (data.branchAddress || '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052');
        const commissionRateLabel = RupeeWordsHelper.formatCommissionRatePercent(
          data.foremanCommissionRate,
        );
        const regNo = isBlank ? '' : (data.registrationNumber || data.sanctionOrderNumber || 'ROC/ERD/REG/PENDING');
        const regYear = new Date().getFullYear();

        // ================= PAGE 1: CHIT AGREEMENT =================
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(11).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10.5).text('FORM VIII', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('(See Section 6 and Rule 13)', { align: 'center', width: pageWidth });
        doc.moveDown(0.2);
        doc.font(boldFont).fontSize(10).text(
          'FORM OF CHIT AGREEMENT / சீட்டு உடன்படிக்கை ஒப்பந்தம்',
          { align: 'center', width: pageWidth },
        );
        doc.font(regularFont).fontSize(8.5).text(
          '(Articles of Agreement between the Foreman and the Subscribers)',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(40, doc.y + 3).lineTo(555, doc.y + 3).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.6);

        // General Particulars 1 to 5 matching Gazette Page 58
        doc.font(regularFont).fontSize(8);
        doc.text('1. Office where the chit is registered: ', 40, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Registrar of Chits, Perundurai / Erode District', '________________________________________');

        doc.text('2. Year and Registered No: Year ', 40, doc.y + 12, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(regYear), '________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' No ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : regNo, '____________________');

        doc.text('3. Full name and address of foreman: ', 40, doc.y + 12, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${firmName}, ${officeAddress}`, '________________________________________________________');

        doc.text('4. Occupation (if applicable): ', 40, doc.y + 12, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Chit Fund Operations & Financial Services', '____________________');

        doc.text('5. Age (if applicable): ', 40, doc.y + 12, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '48 Years', '________');
        doc.moveDown(0.6);

        // Article I
        doc.font(boldFont).fontSize(8.5).text('I. Chit amount and No of tickets.');
        doc.font(regularFont).fontSize(8);
        doc.text('1. No of tickets or fraction thereof held by each subscriber: Full: ', 40, doc.y + 2, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(data.totalTickets), '____', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | 3/4: Nil | 1/2: Nil | 1/4: Nil | 1/8: Nil');

        doc.text('2. No. of installments and amount payable for each ticket at every installment: No. ', 40, doc.y + 12, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(data.durationMonths), '____', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' Amount Rs. ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(data.baseInstallment), '__________');

        doc.text('3. Chit amount Rs. ', 40, doc.y + 12, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(data.chitValue), '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : chitValueWords, '________________________________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ')');
        doc.moveDown(0.6);

        // Article II
        doc.font(boldFont).fontSize(8.5).text('II. Duration of the chit.');
        doc.font(regularFont).fontSize(8);
        doc.text('1. Date of 1st installment: ', 40, doc.y + 2, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '15/01/2026', '____________________');
        doc.text('2. Dates of subsequent installments: ', 40, doc.y + 12, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '15th of every consecutive calendar month', '________________________________________');
        doc.text('3. Duration of the chit: Years: ', 40, doc.y + 12, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '1 Year 8 Months', '________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(data.durationMonths), '____', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' consecutive calendar months)');
        doc.moveDown(0.6);

        // Article III
        doc.font(boldFont).fontSize(8.5).text('III. The place, time and probable date when the chit is to be commenced.');
        doc.font(regularFont).fontSize(8);
        doc.text('1. Place: ', 40, doc.y + 2, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : officeAddress, '________________________________________');
        doc.text('2. Time of commencement: ', 40, doc.y + 12, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '11:00 AM IST on scheduled draw date', '____________________');
        doc.moveDown(0.6);

        // Article IV
        doc.font(boldFont).fontSize(8.5).text('IV. Particulars of security given or deposited by foreman.');
        doc.font(regularFont).fontSize(8);
        doc.text('1. Cash deposit in approved scheduled bank / bank guarantee in the name of Registrar under Section 20.');
        doc.text('2. The foreman shall not get release of the security in full until all liabilities under the chit are discharged.');
        doc.moveDown(0.6);

        // Article V
        doc.font(boldFont).fontSize(8.5).text('V. Mode of conducting the chit.');
        doc.font(regularFont).fontSize(8);
        doc.text('1. Reverse auction among non-prized eligible subscribers. Defaulters barred under ADR-07.');
        doc.text('2. Ceiling discount fixed strictly at 25% (1/4th) of chit value: Rs. ', 40, doc.y + 12, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(data.maxDiscountCeiling), '__________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : maxDiscountWords, '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, '). Tie-break via physical paper tokens (ADR-06).');
        doc.moveDown(0.6);

        // Articles VI to XIII summary
        doc.font(boldFont).fontSize(8.5).text('VI - XIII. Statutory Provisions, Universal Dividends & Dual-Control:');
        doc.font(regularFont).fontSize(8);
        doc.text(`• Universal Equal Dividend: Auction discount minus 4.00% foreman commission divided equally among ALL subscribers.`);
        doc.text(`• Foreman Commission: Fixed at ${commissionRateLabel} (ADR-04) permanently frozen per scheme.`);
        doc.text(`• Month 1 & Month N Rules: Month 1 full pool taken by Foreman; Month N settled directly without auction.`);
        doc.text(`• Single Discrete Payments: Zero double/advance payments; receipts granted under Form XVI with Revenue Stamp.`);
        doc.moveDown(0.8);

        // ================= PAGE 2: SUBSCRIBERS EXECUTION ROSTER =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(10.5).text('FORM VIII — SCHEDULE 10: SUBSCRIBERS EXECUTION ROSTER', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text(
          `Scheme: ${data.groupCode} (${data.groupName}) | Chit Value: Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)}`,
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(40, doc.y + 3).lineTo(555, doc.y + 3).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.6);

        doc.font(regularFont).fontSize(8).text(
          '10. The subscribers who have affixed their signatures hereunder agreed to the above Articles:'
        );
        doc.moveDown(0.4);

        // Roster Table Header matching Gazette Page 65
        const tableY = doc.y;
        doc.rect(40, tableY, pageWidth, 20).fillAndStroke('#343a40', '#343a40');
        doc.fillColor('#fff').font(boldFont).fontSize(7.5);
        doc.text('Sl. No.', 44, tableY + 5, { width: 30, align: 'center' });
        doc.text('Name and full address of subscriber', 78, tableY + 5, { width: 190, align: 'left' });
        doc.text('No. of tickets', 272, tableY + 5, { width: 55, align: 'center' });
        doc.text('Subscribers signature and date', 332, tableY + 5, { width: 95, align: 'center' });
        doc.text('Name, Signature & witness address', 432, tableY + 5, { width: 115, align: 'center' });

        let currentY = tableY + 20;
        const rowHeight = 22;
        const totalRows = isBlank ? 20 : (data.subscribers && data.subscribers.length > 0 ? data.subscribers.length : data.totalTickets);

        for (let i = 0; i < totalRows; i++) {
          if (currentY + rowHeight > 780) {
            doc.addPage();
            currentY = 40;
          }

          const sub = isBlank ? null : data.subscribers?.[i];
          const ticketNo = sub?.ticketNumber ?? i + 1;
          const name = sub?.customerName || '';
          const addr = sub?.customerAddress ? `, ${sub.customerAddress}` : '';

          doc.rect(40, currentY, pageWidth, rowHeight).fillAndStroke(i % 2 === 0 ? '#ffffff' : '#f8f9fa', '#dee2e6');

          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(7);
          doc.text(String(i + 1), 44, currentY + 6, { width: 30, align: 'center' });

          if (isBlank) {
            doc.text('__________________________________________________', 78, currentY + 6, { width: 190 });
            doc.text('____', 272, currentY + 6, { width: 55, align: 'center' });
          } else {
            doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont);
            doc.text(`[#${ticketNo}] ${name}${addr}`, 78, currentY + 6, { width: 190, ellipsis: true });
            doc.text('1 (Full)', 272, currentY + 6, { width: 55, align: 'center' });
          }

          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.text('____________________', 332, currentY + 6, { width: 95, align: 'center' });
          doc.text('____________________', 432, currentY + 6, { width: 115, align: 'center' });

          currentY += rowHeight;
        }

        doc.y = currentY + 12;
        doc.font(boldFont).fontSize(8.5).text('முன்னிலையாளர் கையொப்பம் / Signature of the Foreman:', 40, doc.y);
        doc.font(regularFont).fontSize(8).text('For KUMARAN FINANCE, Perundurai', 40, doc.y + 12);
        doc.text('Date: ____________________', 40, doc.y + 24);

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
