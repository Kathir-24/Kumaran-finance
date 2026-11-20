import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

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
        const chitValueWords = RupeeWordsHelper.toEnglishWords(data.chitValue);
        const baseInstWords = RupeeWordsHelper.toEnglishWords(data.baseInstallment);
        const maxDiscountWords = RupeeWordsHelper.toEnglishWords(data.maxDiscountCeiling);
        const managingPartner = data.managingPartnerName || 'P. Kumaran (Managing Partner)';
        const firmName = 'KUMARAN FINANCE (Head Office: Perundurai)';
        const officeAddress =
          data.branchAddress || '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052';
        const commissionRateLabel = RupeeWordsHelper.formatCommissionRatePercent(
          data.foremanCommissionRate,
        );
        const regNo = data.registrationNumber || data.sanctionOrderNumber || 'ROC/ERD/REG/PENDING';
        const regYear = new Date().getFullYear();

        // ================= PAGE 1: CHIT AGREEMENT =================
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
        doc.moveTo(40, doc.y + 3).lineTo(555, doc.y + 3).stroke();
        doc.moveDown(0.6);

        // General Particulars Box
        const startY = doc.y;
        doc.rect(40, startY, pageWidth, 58).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor('#000').font(regularFont).fontSize(8);
        doc.text(`1. Office where chit is registered: Registrar of Chits, Perundurai / Erode`, 48, startY + 6);
        doc.text(`2. Year and Registered No: ${regNo} of ${regYear}`, 48, startY + 18);
        doc.text(`3. Full name and address of foreman: ${firmName}, ${officeAddress}`, 48, startY + 30);
        doc.text(`4. Managing Partner: ${managingPartner} | Occupation: Chit Fund Business`, 48, startY + 42);

        doc.x = 40;
        doc.y = startY + 68;

        // Article I
        doc.font(boldFont).fontSize(8.5).text('I. CHIT AMOUNT AND NUMBER OF TICKETS (சீட்டு தொகை மற்றும் டிக்கெட்டுகள்):');
        doc.font(regularFont).fontSize(8);
        doc.text(`1. Total Chit Value (மொத்த சீட்டு மதிப்பு): ₹ ${RupeeWordsHelper.formatWholeRupees(data.chitValue)} (${chitValueWords})`);
        doc.text(`2. Number of Installments & Tickets: ${data.durationMonths} Months | ${data.totalTickets} Tickets`);
        doc.text(`3. Subscription per Installment (மாத தவணை தொகை): ₹ ${RupeeWordsHelper.formatWholeRupees(data.baseInstallment)} (${baseInstWords})`);
        doc.moveDown(0.4);

        // Article II
        doc.font(boldFont).fontSize(8.5).text('II. DURATION OF THE CHIT (சீட்டு காலம்):');
        doc.font(regularFont).fontSize(8);
        doc.text(`1. Duration: ${data.durationMonths} consecutive calendar months.`);
        doc.text(`2. Manner of Installments: Monthly discrete single installments without double or advance payments.`);
        doc.moveDown(0.4);

        // Article III
        doc.font(boldFont).fontSize(8.5).text('III. PLACE, TIME AND COMMENCEMENT OF PROCEEDINGS (ஏலம் நடக்கும் இடம் மற்றும் நேரம்):');
        doc.font(regularFont).fontSize(8);
        doc.text(`1. Place: Head Office, ${officeAddress}`);
        doc.text(`2. Time of Proceedings: On the scheduled auction day at 11:00 AM IST.`);
        doc.moveDown(0.4);

        // Article IV
        doc.font(boldFont).fontSize(8.5).text('IV. FOREMAN SECURITY UNDER SECTION 20 (முன்னிலையாளர் பாதுகாப்பு வைப்பு):');
        doc.font(regularFont).fontSize(8);
        doc.text('1. Cash deposited in an approved scheduled bank in the name of the Registrar of Chits under Section 20(1)(a)(i) / Bank Guarantee.');
        doc.text('2. The foreman shall not get release of the security in full until all the liabilities under the chit are completely discharged.');
        doc.moveDown(0.4);

        // Article V
        doc.font(boldFont).fontSize(8.5).text('V. MODE OF CONDUCTING THE CHIT & 25% DISCOUNT CEILING (ஏல முறை & உச்ச வரம்பு):');
        doc.font(regularFont).fontSize(8);
        doc.text(`1. Ceiling Discount: Under Section 16 & Rule 13, the maximum bid discount is strictly fixed at 25% (1/4th) of total chit value: ₹ ${RupeeWordsHelper.formatWholeRupees(data.maxDiscountCeiling)} (${maxDiscountWords}).`);
        doc.text('2. Tie-Break Protocol (Option A): If two or more subscribers bid the ceiling of 25%, the winning prized subscriber is determined through a physical paper token lot draw in front of subscribers. No autonomous software draws.');
        doc.text('3. Defaulter Ineligibility (ADR-07): A subscriber who has not paid their installment due for that month is strictly ineligible to participate or bid.');
        doc.moveDown(0.4);

        // Article VI & VII
        doc.font(boldFont).fontSize(8.5).text('VI. MODE OF PAYMENT & ARREARS (தவணை செலுத்தும் முறை):');
        doc.font(regularFont).fontSize(8);
        doc.text('1. Every subscriber shall pay their net installment on or before the due date and obtain a receipt in Form XVI.');
        doc.text('2. 3 consecutive unpaid installments grants the company removal and substitution rights under Section 28 & 29.');
        doc.moveDown(0.4);

        // Article VIII - Universal Dividend
        doc.font(boldFont).fontSize(8.5).text('VIII. DISBURSEMENT OF UNIVERSAL DIVIDENDS (அனைவருக்கும் சமமான லாபப்பங்கு):');
        doc.font(regularFont).fontSize(8);
        doc.text('1. Universal Equal Dividend: The auction discount minus foreman commission is divided equally across ALL members in the group, INCLUDING the auction winner and past prized winners.');
        doc.text('2. Every subscriber pays the discounted net installment (I_net = I_base - Dividend) in the subsequent month.');
        doc.moveDown(0.4);

        // Article IX - Commission Freeze & Month 1/N Rules
        doc.font(boldFont).fontSize(8.5).text('IX. FOREMAN COMMISSION & MONTH 1 / MONTH N RULES (கழிவு & விதிமுறைகள்):');
        doc.font(regularFont).fontSize(8);
        doc.text(`1. Foreman Commission: Fixed at ${commissionRateLabel} (ADR-04), permanently frozen for the entire duration of the chit scheme.`);
        doc.text('2. Month 1 & Month N Rules: Month 1 full pool is taken by the company (no auction, ₹0 dividend). Month N is settled directly to the final subscriber with 4% commission (no auction). Auctions occur strictly in Months 2 through N-1.');
        doc.moveDown(0.4);

        // Article XIII & Signatures
        doc.font(boldFont).fontSize(8.5).text('XIII. COMPANY SAFETY PROOF & STATUTORY UNDERTAKING (ADR-15):');
        doc.font(regularFont).fontSize(8);
        doc.text('1. Prize disbursement requires signed agreement with winner and nominee, signed blank cheques / promissory notes as safety proof.');
        doc.text('2. Ticket Limit: Strictly maximum 1 ticket per subscriber in this chit group (enforced under ADR-13).');
        doc.moveDown(0.8);

        // ================= PAGE 2: SUBSCRIBERS EXECUTION ROSTER =================
        doc.addPage();
        doc.font(boldFont).fontSize(10.5).text('FORM VIII — SCHEDULE 10: SUBSCRIBERS EXECUTION ROSTER', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text(
          `Scheme: ${data.groupCode} (${data.groupName}) | Chit Value: ₹ ${RupeeWordsHelper.formatWholeRupees(data.chitValue)}`,
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(40, doc.y + 3).lineTo(555, doc.y + 3).stroke();
        doc.moveDown(0.6);

        doc.font(regularFont).fontSize(8).text(
          'We, the undersigned subscribers, have read and agreed to the Articles of Chit Agreement set forth above and affix our signatures hereunder:'
        );
        doc.moveDown(0.4);

        // Roster Table Header
        const tableY = doc.y;
        doc.rect(40, tableY, pageWidth, 20).fillAndStroke('#343a40', '#343a40');
        doc.fillColor('#fff').font(boldFont).fontSize(7.5);
        doc.text('Sl', 44, tableY + 5, { width: 22, align: 'center' });
        doc.text('Ticket', 68, tableY + 5, { width: 38, align: 'center' });
        doc.text('Subscriber Name & Address', 110, tableY + 5, { width: 175, align: 'left' });
        doc.text('Phone', 290, tableY + 5, { width: 65, align: 'left' });
        doc.text('Signature & Date', 360, tableY + 5, { width: 75, align: 'center' });
        doc.text('Witness Signature', 440, tableY + 5, { width: 70, align: 'center' });

        let currentY = tableY + 20;
        const rowHeight = 22;
        const totalRows = data.subscribers && data.subscribers.length > 0 ? data.subscribers.length : data.totalTickets;

        for (let i = 0; i < totalRows; i++) {
          if (currentY + rowHeight > 780) {
            doc.addPage();
            currentY = 40;
          }

          const sub = data.subscribers?.[i];
          const ticketNo = sub?.ticketNumber ?? i + 1;
          const name = sub?.customerName || '_________________________________';
          const addr = sub?.customerAddress ? `, ${sub.customerAddress}` : '';
          const phone = sub?.phone || '____________';

          doc.rect(40, currentY, pageWidth, rowHeight).fillAndStroke(i % 2 === 0 ? '#ffffff' : '#f8f9fa', '#dee2e6');
          doc.fillColor('#000').font(regularFont).fontSize(7);
          doc.text(String(i + 1), 44, currentY + 6, { width: 22, align: 'center' });
          doc.font(boldFont).text(`#${ticketNo}`, 68, currentY + 6, { width: 38, align: 'center' });
          doc.font(regularFont).text(`${name}${addr}`, 110, currentY + 6, { width: 175, ellipsis: true });
          doc.text(phone, 290, currentY + 6, { width: 65 });
          doc.text('________________', 360, currentY + 6, { width: 75, align: 'center' });
          doc.text('________________', 440, currentY + 6, { width: 70, align: 'center' });

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
