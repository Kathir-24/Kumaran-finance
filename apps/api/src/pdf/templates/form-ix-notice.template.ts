import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormIxPdfData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  maxDiscountCeiling: bigint;
  installmentMonth: number;
  auctionDate: Date | string;
  auctionTime?: string | null;
  drawVenue?: string | null;
  subscriberTicketNumber?: number | null;
  subscriberName?: string | null;
  subscriberNameTamil?: string | null;
  subscriberPhone?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  managingPartnerName?: string | null;
  sanctionOrderNumber?: string | null;
}

export class FormIxNoticeTemplate {
  static async generate(data: FormIxPdfData): Promise<Buffer> {
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
        const aucDate = FontResolverHelper.formatPdfDate(data.auctionDate);
        const aucTime = data.auctionTime || '11:00 AM IST';
        const chitValueWords = RupeeWordsHelper.toEnglishWords(data.chitValue);
        const managingPartner = data.managingPartnerName || 'P. Kumaran (Managing Partner)';
        const firmName = 'KUMARAN FINANCE';
        const officeAddress =
          data.drawVenue ||
          data.branchAddress ||
          '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052';
        const year = new Date().getFullYear();

        // Header
        doc.font(boldFont).fontSize(11).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10.5).text('FORM IX', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('(See Section 16 and Rule 16)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);
        doc.font(boldFont).fontSize(10).text(
          `NOTICE TO SUBSCRIBERS OF CHIT DRAW — SCHEME NO. ${data.groupCode} OF ${year}`,
          { align: 'center', width: pageWidth },
        );
        doc.font(regularFont).fontSize(8.5).text(
          'படிவம் IX: சீட்டு ஏல அறிவிப்பு கடிதம் (பிரிவு 16 மற்றும் விதி 16)',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(45, doc.y + 4).lineTo(550, doc.y + 4).stroke();
        doc.moveDown(0.8);

        // Addressed To Box
        const topY = doc.y;
        doc.font(boldFont).fontSize(8.5).text('To:', 45, topY);
        doc.font(regularFont).fontSize(8.5);

        if (data.subscriberName) {
          const tamilSuffix = data.subscriberNameTamil ? ` / ${data.subscriberNameTamil}` : '';
          const ticketLabel = data.subscriberTicketNumber ? ` [Ticket #${data.subscriberTicketNumber}]` : '';
          doc.font(boldFont).text(`${data.subscriberName}${tamilSuffix}${ticketLabel}`, 45, topY + 12);
          if (data.subscriberPhone) {
            doc.font(regularFont).text(`Mobile: ${data.subscriberPhone}`, 45, topY + 24);
          }
          doc.font(regularFont).text(`Subscriber, Chit Group: ${data.groupCode}`, 45, topY + 36);
        } else {
          doc.font(boldFont).text(`All Esteemed Subscribers of Chit Group ${data.groupCode}`, 45, topY + 12);
          doc.font(regularFont).text(`${firmName}, Head Office - Perundurai`, 45, topY + 24);
        }

        doc.font(boldFont).text('Place: Perundurai', 360, topY);
        doc.font(boldFont).text(`Notice Date: ${aucDate}`, 360, topY + 12);
        if (data.sanctionOrderNumber) {
          doc.font(regularFont).fontSize(8).text(`Sanction Ref: ${data.sanctionOrderNumber}`, 360, topY + 24, { width: 150 });
        }

        doc.y = topY + 60;
        doc.font(boldFont).fontSize(9).text('Sir / Madam,', 45, doc.y);
        doc.moveDown(0.4);

        // Core Statutory Wording from Gazette
        doc.font(regularFont).fontSize(8.5).text(
          `This is to inform you that the draw in monthly chit No. ${data.groupCode} (${data.groupName}) of ${year} in which you are one of the subscribers will be held on ${aucDate} at ${aucTime} at ${officeAddress}.`,
          { align: 'justify', lineGap: 2.5 },
        );
        doc.moveDown(0.4);

        doc.font(boldFont).fontSize(8.5).text(
          'You are requested to be present at the draw in person or by your duly authorized agent.',
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.6);

        // Draw Schedule Details Box
        const boxY = doc.y;
        doc.rect(45, boxY, pageWidth, 115).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor('#000');

        doc.font(boldFont).fontSize(8.5).text('CHIT DRAW SPECIFICATIONS & FINANCIAL LIMITS:', 55, boxY + 8);
        doc.font(regularFont).fontSize(8);

        doc.text('1. தவணை எண் / Installment Draw Number:', 55, boxY + 24);
        doc.font(boldFont).text(`Month ${data.installmentMonth} of ${data.durationMonths} Months`, 250, boxY + 24);

        doc.text('2. மொத்த சீட்டு மதிப்பு / Chit Value:', 55, boxY + 38);
        doc.font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)} (${chitValueWords})`, 250, boxY + 38);

        doc.text('3. மாத அடிப்படை தவணை / Monthly Installment:', 55, boxY + 52);
        doc.font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.baseInstallment)}`, 250, boxY + 52);

        doc.text('4. அதிகபட்ச ஏல கழிவு வரம்பு / Max Ceiling (1/4):', 55, boxY + 66);
        doc.font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.maxDiscountCeiling)} (Strictly 25% Ceiling per ADR-06)`, 250, boxY + 66);

        doc.text('5. ஏல தேதி மற்றும் நேரம் / Date & Time of Draw:', 55, boxY + 80);
        doc.font(boldFont).text(`${aucDate} at ${aucTime}`, 250, boxY + 80);

        doc.text('6. ஏல இடம் / Venue of Draw:', 55, boxY + 94);
        doc.font(boldFont).text(officeAddress, 250, boxY + 94, { width: 240 });

        doc.y = boxY + 125;
        doc.moveDown(0.5);

        // Statutory Conditions Note
        doc.font(boldFont).fontSize(8).text('STATUTORY AUCTION CONDITIONS (Chit Funds Act, 1982 & Company Rules):');
        doc.font(regularFont).fontSize(7.5);
        doc.text(
          '1. Defaulter Ineligibility: Subscribers who have outstanding unpaid dues for this installment month are strictly ineligible to bid or participate in this auction (Section 16 & ADR-07).',
          { lineGap: 1.5 },
        );
        doc.text(
          '2. Fixed 1/4 Discount Ceiling: Bidding cannot exceed one-fourth of chit value (Rs. ' +
            RupeeWordsHelper.formatWholeRupees(data.maxDiscountCeiling) +
            '). In case of tie, physical paper tokens will be drawn publicly by Foreman (ADR-06).',
          { lineGap: 1.5 },
        );
        doc.text(
          '3. Universal Equal Dividend: The auction dividend will be distributed equally among all members (including prized subscribers), reducing the next installment payable.',
          { lineGap: 1.5 },
        );
        doc.moveDown(1.2);

        // Signatures
        const sigY = doc.y;
        doc.font(boldFont).fontSize(8.5).text('Yours faithfully,', 360, sigY);
        doc.moveDown(2);
        doc.text(`For and on behalf of Foreman:`, 360, sigY + 30);
        doc.text(firmName, 360, sigY + 42);
        doc.font(regularFont).text(managingPartner, 360, sigY + 55);
        doc.text('(Managing Partner / Foreman)', 360, sigY + 67);

        doc.font(boldFont).fontSize(8).text('Foreman Registered Office:', 45, sigY + 30);
        doc.font(regularFont).fontSize(8);
        doc.text(firmName, 45, sigY + 42);
        doc.text(officeAddress, 45, sigY + 54, { width: 260 });
        doc.text(`Contact: +91 98765 43210`, 45, sigY + 76);

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
