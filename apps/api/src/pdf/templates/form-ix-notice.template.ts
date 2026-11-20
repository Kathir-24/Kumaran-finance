import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormIxNoticeData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  maxDiscountCeiling: bigint;
  installmentMonth: number;
  auctionDate: Date;
  auctionTime?: string;
  drawVenue?: string;
  subscriberTicketNumber?: number | null;
  subscriberName?: string | null;
  subscriberNameTamil?: string | null;
  subscriberPhone?: string | null;
  branchName?: string;
  branchAddress?: string;
  managingPartnerName?: string;
  sanctionOrderNumber?: string | null;
  isBlank?: boolean;
}

export class FormIxNoticeTemplate {
  public static async generate(data: FormIxNoticeData): Promise<Buffer> {
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
          margins: { top: 35, bottom: 35, left: 45, right: 45 },
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

        const aucDate = isBlank ? '' : FontResolverHelper.formatPdfDate(data.auctionDate);
        const aucTime = isBlank ? '' : (data.auctionTime || '11:00 AM');
        const firmName = isBlank ? '' : 'KUMARAN FINANCE';
        const officeAddress = isBlank
          ? ''
          : (data.drawVenue ||
             data.branchAddress ||
             '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052');
        const currentYear = new Date().getFullYear();
        const year2Digit = String(currentYear).slice(2);

        // Date breakdown for day / month blanks
        let dayStr = '';
        let monthStr = '';
        if (!isBlank && data.auctionDate) {
          const d = data.auctionDate instanceof Date ? data.auctionDate : new Date(data.auctionDate);
          if (!Number.isNaN(d.getTime())) {
            dayStr = String(d.getDate());
            monthStr = d.toLocaleString('en-IN', { month: 'long' });
          }
        }

        // Header matching Gazette Page 66
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(12).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(11).text('FORM IX', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(9).text('(See Section 16 and Rule 16)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);

        doc.font(boldFont).fontSize(10).text('Notice to subscribers of Chit Number ', 45, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.groupCode, '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, boldFont, ' of 20', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : year2Digit, isBlank ? '____' : year2Digit);
        doc.moveTo(45, doc.y + 4).lineTo(550, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.7);

        // Addressed To & Place / Date
        const topY = doc.y;
        doc.font(regularFont).fontSize(9).text('To:', 45, topY);
        if (isBlank) {
          doc.text('Subscriber Name: ________________________________________', 45, topY + 14);
          doc.text('Ticket Number:   ____________________', 45, topY + 28);
        } else if (data.subscriberName) {
          const tamilSuffix = data.subscriberNameTamil ? ` / ${data.subscriberNameTamil}` : '';
          const ticketLabel = data.subscriberTicketNumber ? ` [Ticket #${data.subscriberTicketNumber}]` : '';
          doc.font(boldFont).fillColor(StatutoryFormHelper.DATA_BLUE).text(`${data.subscriberName}${tamilSuffix}${ticketLabel}`, 45, topY + 14);
          doc.font(regularFont).fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
          if (data.subscriberPhone) {
            doc.text(`Mobile: ${data.subscriberPhone}`, 45, topY + 28);
          }
          doc.text(`Subscriber, Chit Group: ${data.groupCode}`, 45, topY + 42);
        } else {
          doc.font(boldFont).fillColor(StatutoryFormHelper.DATA_BLUE).text(`All Esteemed Subscribers of Chit Group ${data.groupCode}`, 45, topY + 14);
          doc.font(regularFont).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(`${firmName}, Head Office - Perundurai`, 45, topY + 28);
        }

        doc.font(regularFont).fontSize(9).text('Place: ', 360, topY);
        doc.text('', 395, topY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.font(regularFont).fontSize(9).text('Date: ', 360, topY + 18);
        doc.text('', 395, topY + 18, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : aucDate, '____________________');

        doc.y = Math.max(doc.y, topY + 58);
        doc.font(regularFont).fontSize(9.5).text('Sir,', 45, doc.y);
        doc.moveDown(0.5);

        // Core Statutory Wording verbatim from Gazette Page 66
        doc.font(regularFont).fontSize(9.5).text('This is to inform you that the ', 45, doc.y, { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.installmentMonth}th`, '__________', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' draw in monthly / quarterly / half yearly / yearly chit No ', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.groupCode, '____________________', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' 20', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : year2Digit, isBlank ? '____' : year2Digit, { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' in which you are one of the subscribers will be held on ', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : dayStr, '_______', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' day ', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : monthStr, '____________________', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (month) 20', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : year2Digit, isBlank ? '____' : year2Digit, { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' at ', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : aucTime, '__________', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' at ', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : officeAddress, '________________________________________', { continued: true, lineGap: 5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' be present at the draw in person or by your duly authorized agent.', { lineGap: 5 });
        doc.moveDown(0.8);

        // Signatures matching Gazette Page 66
        const sigY = doc.y;
        doc.font(regularFont).fontSize(9).text('Yours faithfully,', 360, sigY);
        doc.text('Secretary ', 360, sigY + 18, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Partner / Authorised Signatory', '____________________');

        doc.y = sigY + 40;
        doc.font(regularFont).fontSize(9).text('for and on behalf of (foreman) ', 360, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '____________________');

        doc.y += 24;
        doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor('#888888').stroke();
        doc.moveDown(0.2);
        doc.font(regularFont).fontSize(7.5).text(
          'Strike out or delete whatever is not applicable. Insert such designation(s) as may be appropriate.',
          45,
          doc.y,
        );

        // Scheme & Draw Summary Box
        doc.moveDown(0.6);
        const boxY = doc.y;
        doc.rect(45, boxY, pageWidth, 72).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);

        doc.font(boldFont).fontSize(8.5).text('SCHEME & DRAW SUMMARY / ஏல விவரக் குறிப்பு:', 55, boxY + 7);
        doc.font(regularFont).fontSize(8);

        doc.text('Scheme Name: ', 55, boxY + 23, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.groupName} (${data.groupCode})`, '________________________________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, '   |   Installment: ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `Month #${data.installmentMonth} of ${data.durationMonths}`, 'Month _____ of _____');

        doc.text('Chit Value: ', 55, boxY + 38, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)}`, '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, '   |   Monthly Base Installment: ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `Rs. ${RupeeWordsHelper.formatWholeRupees(data.baseInstallment)}`, '__________');

        doc.text('Max Discount Ceiling: ', 55, boxY + 53, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `Rs. ${RupeeWordsHelper.formatWholeRupees(data.maxDiscountCeiling)} (25% / 1/4th Value)`, 'Rs. __________ (25% Ceiling)', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, '   |   Tie-Break: Physical Paper Token Draw (ADR-06)');

        doc.y = boxY + 80;

        // Important Subscriber Guidelines (Sec 16, 22)
        doc.moveDown(0.4);
        const guideY = doc.y;
        doc.rect(45, guideY, pageWidth, 72).fillAndStroke('#ffffff', '#ced4da');
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(8.5).text('IMPORTANT BIDDING & ATTENDANCE INSTRUCTIONS (Sec 16 & Sec 22):', 55, guideY + 7);
        doc.font(regularFont).fontSize(8);
        doc.text('1. Eligibility: Only subscribers who have paid all due installments are eligible to bid (Defaulters strictly barred per ADR-07).', 55, guideY + 21);
        doc.text('2. Ceiling Auction: Reverse bidding discount cannot exceed 25% of chit value. Multiple ceiling bids decided by paper tokens.', 55, guideY + 34);
        doc.text('3. Universal Dividend: The net auction discount minus 4% commission is distributed equally among all subscribers.', 55, guideY + 47);
        doc.text('4. In-person or Proxy: If unable to attend in person, subscriber may depute an authorized agent using the slip below.', 55, guideY + 60);

        doc.y = guideY + 80;

        // Perforated line for detachable Proxy Authorization Slip (Rule 16(2))
        doc.moveDown(0.4);
        const perfY = doc.y;
        doc.moveTo(45, perfY).lineTo(550, perfY).dash(4, { space: 4 }).strokeColor('#666666').lineWidth(0.8).stroke();
        doc.undash();

        doc.y = perfY + 8;
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(9).text(
          'PROXY / ATTENDANCE AUTHORIZATION SLIP / பிரதிநிதித்துவ அனுமதிச் சீட்டு (Rule 16(2))',
          45,
          doc.y,
          { align: 'center', width: pageWidth },
        );
        doc.moveDown(0.4);

        doc.font(regularFont).fontSize(8.5).text('I / We, ', 45, doc.y, { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : (data.subscriberName || '___________________________'), '___________________________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' Subscriber of Ticket No: ', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : String(data.subscriberTicketNumber ?? '___'), '____', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' in Chit Group ', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.groupCode, '____________________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' hereby authorize Thiru / Tmt ', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, '', '___________________________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' residing at ', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, '', '________________________________________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' to attend and bid at the auction on ', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : aucDate, '__________', { continued: true, lineGap: 4.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' on my / our behalf.', { lineGap: 4.5 });

        doc.moveDown(0.6);
        const proxySigY = doc.y;
        doc.font(regularFont).fontSize(8.5);
        doc.text('Signature of Subscriber: ____________________', 45, proxySigY);
        doc.text('Signature of Proxy: ____________________', 320, proxySigY);

        doc.text('Date: ______________   |   Mobile: ____________________', 45, proxySigY + 18);
        doc.text('Foreman Verification: ____________________', 320, proxySigY + 18);

        // Verification Box at bottom of Proxy Slip
        doc.y = proxySigY + 38;
        const deskBoxY = doc.y;
        doc.rect(45, deskBoxY, pageWidth, 42).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(8).text('FOR AUCTION VENUE DESK VERIFICATION / ஏல நுழைவு சரிபார்ப்பு:', 55, deskBoxY + 6);
        doc.font(regularFont).fontSize(7.5);
        doc.text('Proxy Identity Verified (Aadhaar / Voter ID / Driving License): YES   |   Subscriber Clear of Arrears: YES', 55, deskBoxY + 18);
        doc.text('Token Number Issued: _______   |   Verified by Desk Officer: ______________________', 55, deskBoxY + 29);

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
