import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';

export interface FormXviiPdfData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  baseInstallment: bigint;
  sanctionOrderNumber?: string | null;
  installmentMonth: number;
  auctionDate: Date;
  bidDiscount: bigint;
  /** Frozen foreman commission rate from Auction/ChitGroup (ADR-04, Guardrail 3). */
  foremanCommissionRate?: string | number | { toString(): string } | null;
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
  wasTieBreakWinner: boolean;
  tiedBidders?: Array<{
    ticketNumber: number;
    customerName: string;
    tokenNumberDrawn?: number | null;
    isWinner: boolean;
  }>;
  subscribersPresent: number;
  minutesText: string;
  signedByForeman: boolean;
  branchName?: string | null;
  branchAddress?: string | null;
  isBlank?: boolean;
}

export class FormXviiMinutesTemplate {
  static async generate(data: FormXviiPdfData): Promise<Buffer> {
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

        // Standard A4 portrait (595.28 x 841.89 pt)
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 30, bottom: 30, left: 35, right: 35 },
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

        doc.font(boldFont).fontSize(9.5).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10.5).text('MINUTES OF THE AUCTION PROCEEDINGS / ஏல நடவடிக்கைக் குறிப்பேடு', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8).text(
          '(Under Section 17 of Chit Funds Act, 1982 read with Rule 17 of Tamil Nadu Chit Funds Rules, 1984)',
          { align: 'center', width: pageWidth },
        );
        doc.font(regularFont).fontSize(7).text(
          '*(Statutory Draw Minutes under Sec 17 & Rule 17; Form XVII in Tamil Nadu Gazette is Dispute Reference u/s 64)*',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(35, doc.y + 3).lineTo(560, doc.y + 3).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.5);

        // Chit Scheme & Auction Info
        const aucDate = FontResolverHelper.formatPdfDate(data.auctionDate);
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(9);
        doc.text('சீட்டு குழு / Scheme: ', 35, doc.y, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.groupCode} (${data.groupName})`, '____________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, '    |    ஏல தேதி / Date: ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : aucDate, '____________________', { lineGap: 3.5 });
        doc.moveDown(0.35);

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        doc.text('மொத்த மதிப்பு / Value: ', 35, doc.y, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `₹ ${RupeeWordsHelper.formatWholeRupees(data.chitValue)}`, '____________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | தவணை காலம் / Duration: ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.durationMonths} மாதங்கள்`, '__________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | தவணை / Month: ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `#${data.installmentMonth}`, '____', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | வருகை தந்தோர் / Present: ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.subscribersPresent}`, '____', { lineGap: 3.5 });
        doc.moveDown(0.35);

        if (data.sanctionOrderNumber) {
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.text('அரசு ஆணை எண் / Sanction Order No: ', 35, doc.y, { continued: true, lineGap: 3.5 });
          StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.sanctionOrderNumber, '____________________', { lineGap: 3.5 });
          doc.moveDown(0.35);
        }
        doc.moveDown(0.3);

        // Financial Calculation Table
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(9).text('ஏல முடிவு & கழிவு பகிர்வு விவரங்கள் / AUCTION FINANCIAL STATEMENT:');
        doc.moveDown(0.2);

        const tableY = doc.y;
        doc.rect(35, tableY, pageWidth, 68).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);

        const colValX = 360;
        const colValWidth = pageWidth - (colValX - 35) - 15;

        doc.font(regularFont).fontSize(8.5);
        doc.text('வெற்றி பெற்ற ஏல கழிவு / Winning Bid Discount (Max 25%):', 45, tableY + 8);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`₹ ${RupeeWordsHelper.formatWholeRupees(data.bidDiscount)}`, colValX, tableY + 8, { width: colValWidth, align: 'right' });

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text(`நிறுவன முகவர் கழிவு / Foreman Commission (${commissionRateLabel}):`, 45, tableY + 22);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`₹ ${RupeeWordsHelper.formatWholeRupees(data.foremanCommissionAmount)}`, colValX, tableY + 22, { width: colValWidth, align: 'right' });

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text('பகிர்ந்தளிக்கப்படும் மொத்த லாபப்பங்கு / Total Universal Dividend:', 45, tableY + 36);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`₹ ${RupeeWordsHelper.formatWholeRupees(data.totalDividend)}`, colValX, tableY + 36, { width: colValWidth, align: 'right' });

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text('ஒரு டிக்கெட்டுக்கான லாபப்பங்கு / Dividend Per Ticket:', 45, tableY + 50);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`₹ ${RupeeWordsHelper.formatWholeRupees(data.dividendPerTicket)}`, colValX, tableY + 50, { width: colValWidth, align: 'right' });

        doc.x = 35;
        doc.y = tableY + 76;

        doc.font(boldFont).fontSize(9.5);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).text(`வெற்றியாளருக்கான பரிசு தொகை / Prize Money: ₹ ${RupeeWordsHelper.formatWholeRupees(data.prizeMoney)}`, 35, doc.y, { width: pageWidth });
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).text(`அடுத்த மாத நிகர தவணை / Next Month Net Installment: ₹ ${RupeeWordsHelper.formatWholeRupees(data.nextMonthNetInstallment)} (அனைவருக்கும் / For All Members)`, 35, doc.y + 2, { width: pageWidth });
        doc.moveDown(0.5);

        // Winner Details Box
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(9).text('வெற்றியாளர் விவரம் / PRIZED SUBSCRIBER DETAILS:', 35, doc.y, { width: pageWidth });
        doc.font(regularFont).fontSize(8.5);
        const nameTamil = data.winnerNameTamil ? ` / ${data.winnerNameTamil}` : '';
        doc.text('டிக்கெட் / Ticket: ', 35, doc.y + 2, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `#${data.winnerTicketNumber}`, '____', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | பெயர் / Name: ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.winnerName}${nameTamil}`, '________________________________________');

        doc.text('குறியீடு / Code: ', 35, doc.y + 2, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.winnerCustomerCode, '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | தொலைபேசி / Mobile: ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.winnerPhone, '____________________');
        doc.moveDown(0.4);

        // Tie-Breaker Table if applicable (Option A)
        if (data.wasTieBreakWinner && data.tiedBidders && data.tiedBidders.length > 0) {
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(8.5).text('அதிபட்ச கழிவு சமநிலை & குலுக்கல் முடிவு / CEILING TIE LOT DRAW (OPTION A):', 35, doc.y, { width: pageWidth });
          doc.font(regularFont).fontSize(8);
          doc.text('அதிகபட்ச கழிவான 25% ஏலம் கேட்டவர்களிடையே நேரில் டோக்கன் குலுக்கல் மூலம் வெற்றியாளர் தேர்வு செய்யப்பட்டார்:', 35, doc.y + 2, { width: pageWidth });

          data.tiedBidders.forEach((tb) => {
            const status = tb.isWinner ? '[வெற்றியாளர் / WINNER]' : '[பங்கேற்றவர் / Participant]';
            doc.text(`  • டோக்கன் #${tb.tokenNumberDrawn ?? 'N/A'}: டிக்கெட் #${tb.ticketNumber} - ${tb.customerName} ${status}`, 35, doc.y + 2, { width: pageWidth });
          });
          doc.moveDown(0.4);
        }

        // Minutes Proceedings Text
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(8.5).text('ஏல நடவடிக்கைகள் & குறிப்புகள் / AUCTION PROCEEDINGS:', 35, doc.y, { width: pageWidth });
        doc.font(regularFont).fontSize(8);
        doc.text(data.minutesText || 'ஏலம் முறைப்படி அமைதியான முறையில் உறுப்பினர்கள் முன்னிலையில் நடத்தப்பட்டது.', 35, doc.y + 2, { width: pageWidth });
        doc.moveDown(1.2);

        // Page overflow guard before signature block
        if (doc.y > 755) {
          doc.addPage();
        }

        // Signatures (Statutory Rule 17(f) & Section 17(2)(f): Foreman + At least 2 Subscribers Present)
        const sigY = doc.y;
        doc.moveTo(35, sigY).lineTo(560, sigY).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.3);

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(8).text('சட்டப்பூர்வ கையொப்பங்கள் / STATUTORY SIGNATURES (Sec 17(2)(f) & Rule 17(f)):', 35, sigY + 5);

        // Foreman
        doc.font(regularFont).fontSize(7.5);
        doc.text('முன்னிலையாளர் / Foreman:', 35, sigY + 18, { width: 125 });
        doc.font(boldFont).fontSize(7.5).text('குமரன் பைனான்ஸ்', 35, sigY + 30, { width: 125 });
        doc.font(boldFont).text('____________________', 35, sigY + 44);

        // Subscriber Witness 1
        doc.font(regularFont).fontSize(7.5);
        doc.text('சாட்சி 1 / Witness 1:', 168, sigY + 18, { width: 115 });
        doc.text('டிக்கெட் / Ticket: #', 168, sigY + 30, { continued: true });
        doc.font(boldFont).text('_______');
        doc.font(regularFont).text('ஒப்பம்: ', 168, sigY + 44, { continued: true });
        doc.font(boldFont).text('______________');

        // Subscriber Witness 2
        doc.font(regularFont).fontSize(7.5);
        doc.text('சாட்சி 2 / Witness 2:', 290, sigY + 18, { width: 115 });
        doc.text('டிக்கெட் / Ticket: #', 290, sigY + 30, { continued: true });
        doc.font(boldFont).text('_______');
        doc.font(regularFont).text('ஒப்பம்: ', 290, sigY + 44, { continued: true });
        doc.font(boldFont).text('______________');

        // Registrar Filing Status
        doc.font(regularFont).fontSize(7).text('பதிவாளர் தாக்கல் / Registrar Filing (Sec 18):', 385, sigY + 18, { width: 175 });
        doc.font(boldFont).fontSize(7).text('சரிபார்க்கப்பட்டு தாக்கல் செய்யப்பட்டது', 385, sigY + 30, { width: 175 });
        doc.font(regularFont).fontSize(7).text('நிலை: FILED WITH REGISTRAR', 385, sigY + 44, { width: 175 });

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
