import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormViiiAgreementData {
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
  registrationNumber?: string | null;
  registrationDate?: Date | null;
  firstDrawDate?: Date | null;
  drawVenue?: string;
  branchName?: string;
  branchAddress?: string;
  managingPartnerName?: string;
  subscribers?: Array<{
    ticketNumber: number;
    customerName: string;
    customerAddress?: string;
    isPrized?: boolean;
  }>;
  isBlank?: boolean;
}

export class FormViiiAgreementTemplate {
  public static async generate(data: FormViiiAgreementData): Promise<Buffer> {
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
          margins: { top: 30, bottom: 30, left: 40, right: 40 },
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
        doc.font(boldFont).fontSize(11.5).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(11).text('FORM VIII', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(9).text('(See Section 6 and Rule 13)', { align: 'center', width: pageWidth });
        doc.moveDown(0.2);
        doc.font(boldFont).fontSize(10.5).text(
          'FORM OF CHIT AGREEMENT / சீட்டு உடன்படிக்கை ஒப்பந்தம்',
          { align: 'center', width: pageWidth },
        );
        doc.font(regularFont).fontSize(8.5).text(
          '(Articles of Agreement between the Foreman and the Subscribers)',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(40, doc.y + 3).lineTo(555, doc.y + 3).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.5);

        // General Particulars 1 to 5 matching Gazette Page 58
        doc.font(regularFont).fontSize(8.5);
        doc.text('1. Office where the chit is registered: ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Registrar of Chits, Perundurai / Erode District', '________________________________________', { lineGap: 4 });
        doc.moveDown(0.4);

        doc.text('2. Year and Registered No: Year ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(regYear), '________', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' No ', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : regNo, '____________________', { lineGap: 4 });
        doc.moveDown(0.4);

        doc.text('3. Full name and address of foreman: ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${firmName}, ${officeAddress}`, '________________________________________________________', { lineGap: 4 });
        doc.moveDown(0.4);

        doc.text('4. Occupation (if applicable): ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Chit Fund Operations & Financial Services', '____________________', { lineGap: 4 });
        doc.moveDown(0.4);

        doc.text('5. Age (if applicable): ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '48 Years', '________', { lineGap: 4 });
        doc.moveDown(0.6);

        // Article I
        doc.font(boldFont).fontSize(9).text('I. Chit amount and No of tickets.');
        doc.font(regularFont).fontSize(8.5);
        doc.moveDown(0.2);
        doc.text('1. No of tickets or fraction thereof held by each subscriber: Full: ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(data.totalTickets), '____', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | 3/4: Nil | 1/2: Nil | 1/4: Nil | 1/8: Nil', { lineGap: 4 });
        doc.moveDown(0.35);

        doc.text('2. No. of installments and amount payable for each ticket at every installment: No. ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(data.durationMonths), '____', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' Amount Rs. ', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(data.baseInstallment), '__________', { lineGap: 4 });
        doc.moveDown(0.35);

        doc.text('3. Chit amount Rs. ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(data.chitValue), '____________________', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees ', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : chitValueWords, '________________________________________', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ')', { lineGap: 4 });
        doc.moveDown(0.6);

        // Article II
        doc.font(boldFont).fontSize(9).text('II. Duration of the chit.');
        doc.font(regularFont).fontSize(8.5);
        doc.moveDown(0.2);
        doc.text('1. Date of 1st installment: ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '15/01/2026', '____________________', { lineGap: 4 });
        doc.moveDown(0.35);
        doc.text('2. Dates of subsequent installments: ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '15th of every consecutive calendar month', '________________________________________', { lineGap: 4 });
        doc.moveDown(0.35);
        doc.text('3. Duration of the chit: Years: ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '1 Year 8 Months', '________', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(data.durationMonths), '____', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' consecutive calendar months)', { lineGap: 4 });
        doc.moveDown(0.6);

        // Article III
        doc.font(boldFont).fontSize(9).text('III. The place, time and probable date when the chit is to be commenced.');
        doc.font(regularFont).fontSize(8.5);
        doc.moveDown(0.2);
        doc.text('1. Place: ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : officeAddress, '________________________________________', { lineGap: 4 });
        doc.moveDown(0.35);
        doc.text('2. Time of commencement: ', 40, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '11:00 AM IST on scheduled draw date', '____________________', { lineGap: 4 });
        doc.moveDown(0.6);

        // Article IV
        doc.font(boldFont).fontSize(9).text('IV. Particulars of security given or deposited by foreman.');
        doc.font(regularFont).fontSize(8.5);
        doc.moveDown(0.2);
        doc.text('1. Cash deposit in approved scheduled bank / bank guarantee in the name of Registrar under Section 20.', 40, doc.y, { lineGap: 3.5 });
        doc.moveDown(0.35);
        doc.text('2. The foreman shall not get release of the security in full until all liabilities under the chit are discharged.', 40, doc.y, { lineGap: 3.5 });
        doc.moveDown(0.6);

        // Article V
        doc.font(boldFont).fontSize(9).text('V. Mode of conducting the chit.');
        doc.font(regularFont).fontSize(8.5);
        doc.moveDown(0.2);
        doc.text('1. Reverse auction among non-prized eligible subscribers. Subscribers with unpaid installments due are ineligible to bid.', 40, doc.y, { lineGap: 3.5 });
        doc.moveDown(0.35);
        doc.text('2. Ceiling discount fixed strictly at 25% (1/4th) of chit value: Rs. ', 40, doc.y, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(data.maxDiscountCeiling), '__________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : maxDiscountWords, '____________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, '). Tie-break via physical paper tokens drawn in presence of members.', { lineGap: 3.5 });
        doc.moveDown(0.6);

        // Articles VI to XIII (substantive Gazette provisions)
        doc.font(boldFont).fontSize(9).text('VI - XIII. Statutory Operational Provisions & Legal Covenants (Gazette Form VIII):');
        doc.font(regularFont).fontSize(8);
        doc.moveDown(0.25);
        doc.text('• VI. Prize Disbursement: Prize money paid within 30 days of auction upon furnishing satisfactory security/surety under Sec 31.', 40, doc.y, { lineGap: 3.5 });
        doc.moveDown(0.25);
        doc.text('• VII. Defaulters & Bar on Bidding: Subscriptions in arrears incur interest @ 12% p.a. Unpaid subscribers are ineligible to bid.', 40, doc.y, { lineGap: 3.5 });
        doc.moveDown(0.25);
        doc.text(`• VIII. Universal Equal Dividend: Auction discount minus ${commissionRateLabel} foreman commission distributed equally to all subscribers.`, 40, doc.y, { lineGap: 3.5 });
        doc.moveDown(0.25);
        doc.text(`• IX. Foreman Commission: Fixed at ${commissionRateLabel} permanently frozen per chit group upon registration under Section 21.`, 40, doc.y, { lineGap: 3.5 });
        doc.moveDown(0.25);
        doc.text('• X. Receipts & Stamp: Receipts granted for all payments duly affixing Revenue Stamp required as per Art. 51 of Schedule 1 of Stamp Act.', 40, doc.y, { lineGap: 3.5 });
        doc.moveDown(0.25);
        doc.text('• XI. Inspection of Records: Subscribers have the statutory right to inspect accounts and registers under Section 24.', 40, doc.y, { lineGap: 3.5 });
        doc.moveDown(0.25);
        doc.text('• XII. Termination of Chit: Upon completion of all installments, liabilities are discharged and security released under Section 40.', 40, doc.y, { lineGap: 3.5 });
        doc.moveDown(0.25);
        doc.text('• XIII. Dispute Resolution: All disputes between foreman and subscribers referred to Registrar of Chits for arbitration under Section 64.', 40, doc.y, { lineGap: 3.5 });

        doc.y = 705;
        doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.5);
        doc.font(regularFont).fontSize(7.5).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          '* This Chit Agreement is executed in accordance with Section 6 of the Chit Funds Act, 1982 and Rule 13 of the Tamil Nadu Chit Funds Rules, 1984.',
          40,
          doc.y,
          { width: pageWidth, lineGap: 2 },
        );

        // ================= PAGE 2: SUBSCRIBERS EXECUTION ROSTER =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(11).text('FORM VIII — SCHEDULE 10: SUBSCRIBERS EXECUTION ROSTER', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(9).text(
          `Scheme: ${data.groupCode} (${data.groupName}) | Chit Value: Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)}`,
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(40, doc.y + 3).lineTo(555, doc.y + 3).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.5);

        doc.font(regularFont).fontSize(8.5).text(
          '10. The subscribers who have affixed their signatures hereunder agreed to the above Articles:'
        );
        doc.moveDown(0.4);

        // Roster Table Header matching Gazette Page 65
        const tableY = doc.y;
        doc.rect(40, tableY, pageWidth, 22).fillAndStroke('#343a40', '#343a40');
        doc.fillColor('#fff').font(boldFont).fontSize(8);
        doc.text('Sl. No.', 44, tableY + 6, { width: 30, align: 'center' });
        doc.text('Name and full address of subscriber', 78, tableY + 6, { width: 190, align: 'left' });
        doc.text('No. of tickets', 272, tableY + 6, { width: 55, align: 'center' });
        doc.text('Subscribers signature and date', 332, tableY + 6, { width: 95, align: 'center' });
        doc.text('Name, Signature & witness address', 432, tableY + 6, { width: 115, align: 'center' });

        let currentY = tableY + 22;
        const rowHeight = 25;
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

          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(7.5);
          doc.text(String(i + 1), 44, currentY + 7, { width: 30, align: 'center' });

          if (isBlank) {
            doc.text('__________________________________________________', 78, currentY + 7, { width: 190 });
            doc.text('____', 272, currentY + 7, { width: 55, align: 'center' });
          } else {
            doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont);
            doc.text(`[#${ticketNo}] ${name}${addr}`, 78, currentY + 7, { width: 190, ellipsis: true });
            doc.text('1 (Full)', 272, currentY + 7, { width: 55, align: 'center' });
          }

          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.text('____________________', 332, currentY + 7, { width: 95, align: 'center' });
          doc.text('____________________', 432, currentY + 7, { width: 115, align: 'center' });

          currentY += rowHeight;
        }

        doc.y = currentY + 8;
        const foremanSigY = doc.y;
        doc.font(boldFont).fontSize(8.5).text('முன்னிலையாளர் கையொப்பம் / Signature of the Foreman:', 40, foremanSigY);
        doc.font(regularFont).fontSize(8).text('For KUMARAN FINANCE, Perundurai', 40, foremanSigY + 12);
        doc.text('Date: ____________________', 40, foremanSigY + 24);

        // Item 11 note matching Gazette Page 65 verbatim
        doc.y = foremanSigY + 40;
        doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.3);
        doc.font(regularFont).fontSize(7.5).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          '11. The total number of subscribers should be limited to the total number of drawn / auctions that have been agreed to and each subscriber shall be entitled to a copy of the chit agreement.\n' +
          '* Duly stamped with Revenue Label as required under Article 51 of Schedule 1 of the Indian Stamp Act, 1899.',
          40,
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
