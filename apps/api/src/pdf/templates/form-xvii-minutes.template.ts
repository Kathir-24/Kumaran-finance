import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormXviiMinutesData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  baseInstallment: bigint;
  sanctionOrderNumber?: string | null;
  installmentMonth: number;
  auctionDate: Date;
  bidDiscount: bigint;
  foremanCommissionRate: string | any;
  foremanCommissionAmount: bigint;
  totalDividend: bigint;
  dividendPerTicket: bigint;
  nextMonthNetInstallment: bigint;
  prizeMoney: bigint;
  winnerTicketNumber: number;
  winnerName: string;
  winnerNameTamil?: string | null;
  winnerCustomerCode: string;
  winnerPhone: string;
  wasTieBreakWinner?: boolean;
  tiedBidders?: Array<{
    ticketNumber: number;
    customerName: string;
    tokenNumberDrawn?: number | null;
    isWinner: boolean;
  }>;
  subscribersPresent: number;
  minutesText?: string;
  signedByForeman?: boolean;
  branchName?: string;
  branchAddress?: string;
  isBlank?: boolean;
}

export class FormXviiMinutesTemplate {
  public static async generate(data: FormXviiMinutesData): Promise<Buffer> {
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
          margins: { top: 35, bottom: 35, left: 35, right: 35 },
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

        const pageWidth = 595.28 - 70; // 525.28 pt printable
        const commissionRateLabel = RupeeWordsHelper.formatCommissionRatePercent(
          data.foremanCommissionRate,
        );
        const isBlank = Boolean(data.isBlank);

        // Statutory Header
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(13).text('KUMARAN FINANCE / குமரன் பைனான்ஸ்', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(9).text(
          data.branchAddress || 'Head Office: Perundurai, Erode / தலைமை கிளை: பெருந்துறை, ஈரோடு',
          { align: 'center', width: pageWidth },
        );
        doc.moveDown(0.2);

        doc.font(boldFont).fontSize(10).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(11).text('MINUTES OF THE AUCTION PROCEEDINGS / ஏல நடவடிக்கைக் குறிப்பேடு', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text(
          '(Under Section 17 of Chit Funds Act, 1982 read with Rule 17 of Tamil Nadu Chit Funds Rules, 1984)',
          { align: 'center', width: pageWidth },
        );
        doc.font(regularFont).fontSize(7.5).text(
          '*(Statutory Draw Minutes under Sec 17 & Rule 17; Form XVII in Tamil Nadu Gazette is Dispute Reference u/s 64)*',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(35, doc.y + 4).lineTo(560, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.6);

        // Chit Scheme & Auction Info
        const aucDate = FontResolverHelper.formatPdfDate(data.auctionDate);
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(9);
        doc.text('சீட்டு குழு / Scheme: ', 35, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.groupCode} (${data.groupName})`, '____________________', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderStatic(doc, regularFont, '    |    ஏல தேதி / Date: ', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : aucDate, '____________________', { lineGap: 4 });
        doc.moveDown(0.4);

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        doc.text('மொத்த மதிப்பு / Value: ', 35, doc.y, { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)}`, '____________________', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | தவணை காலம் / Duration: ', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.durationMonths} Months`, '__________', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | தவணை / Month: ', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `#${data.installmentMonth}`, '____', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | வருகை தந்தோர் / Present: ', { continued: true, lineGap: 4 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.subscribersPresent} Members`, '____', { lineGap: 4 });
        doc.moveDown(0.4);

        if (data.sanctionOrderNumber) {
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.text('அரசு ஆணை எண் / Sanction Order No: ', 35, doc.y, { continued: true, lineGap: 4 });
          StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.sanctionOrderNumber, '____________________', { lineGap: 4 });
          doc.moveDown(0.4);
        }
        doc.moveDown(0.4);

        // Financial Calculation Table
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(10).text('ஏல முடிவு & கழிவு பகிர்வு விவரங்கள் / AUCTION FINANCIAL STATEMENT:');
        doc.moveDown(0.4);

        const tableY = doc.y;
        const tableHeight = 96;
        doc.rect(35, tableY, pageWidth, tableHeight).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);

        const colValX = 360;
        const colValWidth = pageWidth - (colValX - 35) - 15;

        doc.font(regularFont).fontSize(9);
        doc.text('வெற்றி பெற்ற ஏல கழிவு / Winning Bid Discount (Max 25%):', 45, tableY + 11);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.bidDiscount)}`, colValX, tableY + 11, { width: colValWidth, align: 'right' });

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text(`நிறுவன முகவர் கழிவு / Foreman Commission (${commissionRateLabel}):`, 45, tableY + 31);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.foremanCommissionAmount)}`, colValX, tableY + 31, { width: colValWidth, align: 'right' });

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text('பகிர்ந்தளிக்கப்படும் மொத்த லாபப்பங்கு / Total Universal Dividend:', 45, tableY + 51);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.totalDividend)}`, colValX, tableY + 51, { width: colValWidth, align: 'right' });

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text('ஒரு டிக்கெட்டுக்கான லாபப்பங்கு / Dividend Per Ticket:', 45, tableY + 71);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`Rs. ${RupeeWordsHelper.formatWholeRupees(data.dividendPerTicket)}`, colValX, tableY + 71, { width: colValWidth, align: 'right' });

        doc.x = 35;
        doc.y = tableY + tableHeight + 10;

        doc.font(boldFont).fontSize(10);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).text(`வெற்றியாளருக்கான பரிசு தொகை / Prize Money: Rs. ${RupeeWordsHelper.formatWholeRupees(data.prizeMoney)}`, 35, doc.y, { width: pageWidth });
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).text(`அடுத்த மாத நிகர தவணை / Next Month Net Installment: Rs. ${RupeeWordsHelper.formatWholeRupees(data.nextMonthNetInstallment)} (அனைவருக்கும் / For All Members)`, 35, doc.y + 3, { width: pageWidth });
        doc.moveDown(1.0);

        // Winner Details Box
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(10).text('வெற்றியாளர் விவரம் / PRIZED SUBSCRIBER DETAILS:', 35, doc.y, { width: pageWidth });
        doc.font(regularFont).fontSize(9.5);
        const nameTamil = data.winnerNameTamil ? ` / ${data.winnerNameTamil}` : '';
        doc.text('டிக்கெட் / Ticket: ', 35, doc.y + 4, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `#${data.winnerTicketNumber}`, '____', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | பெயர் / Name: ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.winnerName}${nameTamil}`, '________________________________________');

        doc.text('குறியீடு / Code: ', 35, doc.y + 4, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.winnerCustomerCode, '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | தொலைபேசி / Mobile: ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.winnerPhone, '____________________');
        doc.moveDown(1.0);

        // Tie-Breaker Table if applicable
        if (data.wasTieBreakWinner && data.tiedBidders && data.tiedBidders.length > 0) {
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(9).text('அதிபட்ச கழிவு சமநிலை & குலுக்கல் முடிவு / CEILING TIE LOT DRAW:', 35, doc.y, { width: pageWidth });
          doc.font(regularFont).fontSize(8.5);
          doc.text('அதிகபட்ச கழிவான 25% ஏலம் கேட்டவர்களிடையே நேரில் டோக்கன் குலுக்கல் மூலம் வெற்றியாளர் தேர்வு செய்யப்பட்டார்:', 35, doc.y + 3, { width: pageWidth });

          data.tiedBidders.forEach((tb) => {
            const status = tb.isWinner ? '[வெற்றியாளர் / WINNER]' : '[பங்கேற்றவர் / Participant]';
            doc.text(`  • டோக்கன் #${tb.tokenNumberDrawn ?? 'N/A'}: டிக்கெட் #${tb.ticketNumber} - ${tb.customerName} ${status}`, 35, doc.y + 3, { width: pageWidth });
          });
          doc.moveDown(0.8);
        }

        // Universal Dividend Deduction Policy Note
        const divBoxY = doc.y;
        doc.rect(35, divBoxY, pageWidth, 54).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(8.5).text('UNIVERSAL EQUAL DIVIDEND DEDUCTION ALLOCATION (Sec 17):', 45, divBoxY + 8);
        doc.font(regularFont).fontSize(8);
        doc.text(`Dividend of Rs. ${RupeeWordsHelper.formatWholeRupees(data.dividendPerTicket)} per ticket is credited equally to ALL ${data.durationMonths} subscribers (including prized winners).`, 45, divBoxY + 23);
        doc.text(`All members pay the uniform net installment of Rs. ${RupeeWordsHelper.formatWholeRupees(data.nextMonthNetInstallment)} for Month #${data.installmentMonth + 1}.`, 45, divBoxY + 38);

        doc.y = divBoxY + 62;

        // Minutes Proceedings Text
        doc.moveDown(0.8);
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(9).text('ஏல நடவடிக்கைகள் & குறிப்புகள் / AUCTION PROCEEDINGS:', 35, doc.y, { width: pageWidth });
        doc.font(regularFont).fontSize(8.5);
        doc.text(data.minutesText || 'ஏலம் முறைப்படி அமைதியான முறையில் உறுப்பினர்கள் முன்னிலையில் நடத்தப்பட்டது.', 35, doc.y + 3, { width: pageWidth });
        doc.moveDown(1.5);

        // Signatures (Statutory Rule 17(f) & Section 17(2)(f): Foreman + At least 2 Subscribers Present)
        const sigY = Math.max(doc.y, 560);
        doc.moveTo(35, sigY).lineTo(560, sigY).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.3);

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(8.5).text('சட்டப்பூர்வ கையொப்பங்கள் / STATUTORY SIGNATURES (Sec 17(2)(f) & Rule 17(f)):', 35, sigY + 6);

        // Foreman
        doc.font(regularFont).fontSize(8);
        doc.text('முன்னிலையாளர் / Foreman:', 35, sigY + 20, { width: 125 });
        doc.font(boldFont).fontSize(8).text('குமரன் பைனான்ஸ்', 35, sigY + 34, { width: 125 });
        doc.font(boldFont).text('____________________', 35, sigY + 50);

        // Subscriber Witness 1
        doc.font(regularFont).fontSize(8);
        doc.text('சாட்சி 1 / Witness 1:', 170, sigY + 20, { width: 115 });
        doc.text('டிக்கெட் / Ticket: #', 170, sigY + 34, { continued: true });
        doc.font(boldFont).text('_______');
        doc.font(regularFont).text('ஒப்பம்: ', 170, sigY + 50, { continued: true });
        doc.font(boldFont).text('______________');

        // Subscriber Witness 2
        doc.font(regularFont).fontSize(8);
        doc.text('சாட்சி 2 / Witness 2:', 295, sigY + 20, { width: 115 });
        doc.text('டிக்கெட் / Ticket: #', 295, sigY + 34, { continued: true });
        doc.font(boldFont).text('_______');
        doc.font(regularFont).text('ஒப்பம்: ', 295, sigY + 50, { continued: true });
        doc.font(boldFont).text('______________');

        // Registrar Filing Status
        doc.font(regularFont).fontSize(7.5).text('பதிவாளர் தாக்கல் / Registrar Filing (Sec 18):', 415, sigY + 20, { width: 140 });
        doc.font(boldFont).fontSize(7.5).text('சரிபார்க்கப்பட்டு தாக்கல் செய்யப்பட்டது', 415, sigY + 34, { width: 140 });
        doc.font(regularFont).fontSize(7.5).text('நிலை: FILED WITH REGISTRAR', 415, sigY + 50, { width: 140 });

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
