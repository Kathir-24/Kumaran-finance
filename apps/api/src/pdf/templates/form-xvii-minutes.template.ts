import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';

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
}

export class FormXviiMinutesTemplate {
  static async generate(data: FormXviiPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Standard A4 portrait (595.28 x 841.89 pt)
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 30, bottom: 30, left: 35, right: 35 },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const regularFont = FontResolverHelper.getTamilRegularFont();
      const boldFont = FontResolverHelper.getTamilBoldFont();

      const pageWidth = 595.28 - 70; // 525.28 pt printable

      // Statutory Header
      doc.font(boldFont).fontSize(13).text('KUMARAN FINANCE / குமரன் பைனான்ஸ்', { align: 'center', width: pageWidth });
      doc.font(regularFont).fontSize(9).text('Head Office: Perundurai, Erode / தலைமை கிளை: பெருந்துறை, ஈரோடு', { align: 'center', width: pageWidth });
      doc.moveDown(0.3);

      doc.font(boldFont).fontSize(10.5).text('படிவம் XVII / FORM XVII: ஏல நடவடிக்கைக் குறிப்பேடு [UNVERIFIED-LEGAL]', { align: 'center', width: pageWidth });
      doc.font(regularFont).fontSize(8.5).text('MINUTES OF THE AUCTION PROCEEDINGS', { align: 'center', width: pageWidth });
      doc.moveTo(35, doc.y).lineTo(560, doc.y).stroke();
      doc.moveDown(0.5);

      // Chit Scheme & Auction Info
      doc.font(regularFont).fontSize(9);
      const aucDate = data.auctionDate.toISOString().split('T')[0];
      doc.text(`சீட்டு குழு / Scheme: ${data.groupCode} (${data.groupName})`, { continued: true });
      doc.text(`ஏல தேதி / Date: ${aucDate}`, { align: 'right' });

      doc.text(`மொத்த மதிப்பு / Value: ₹ ${data.chitValue.toLocaleString('en-IN')} | தவணை காலம் / Duration: ${data.durationMonths} மாதங்கள்`);
      doc.text(`ஏல தவணை / Month: ${data.installmentMonth} | வருகை தந்த சந்தாதாரர்கள் / Members Present: ${data.subscribersPresent}`);
      if (data.sanctionOrderNumber) {
        doc.text(`அரசு ஆணை எண் / Sanction Order No: ${data.sanctionOrderNumber}`);
      }
      doc.moveDown(0.4);

      // Financial Calculation Table
      doc.font(boldFont).fontSize(9).text('ஏல முடிவு & கழிவு பகிர்வு விவரங்கள் / AUCTION FINANCIAL STATEMENT:');
      doc.moveDown(0.2);

      const tableY = doc.y;
      doc.rect(35, tableY, pageWidth, 68).fillAndStroke('#f8f9fa', '#ced4da');
      doc.fillColor('#000');

      const colValX = 360;
      const colValWidth = pageWidth - (colValX - 35) - 15;

      doc.font(regularFont).fontSize(8.5);
      doc.text(`வெற்றி பெற்ற ஏல கழிவு / Winning Bid Discount (Max 25%):`, 45, tableY + 8);
      doc.font(boldFont).text(`₹ ${data.bidDiscount.toLocaleString('en-IN')}`, colValX, tableY + 8, { width: colValWidth, align: 'right' });

      doc.font(regularFont).text(`நிறுவன முகவர் கழிவு / Foreman Commission (4%):`, 45, tableY + 22);
      doc.font(boldFont).text(`₹ ${data.foremanCommissionAmount.toLocaleString('en-IN')}`, colValX, tableY + 22, { width: colValWidth, align: 'right' });

      doc.font(regularFont).text(`பகிர்ந்தளிக்கப்படும் மொத்த லாபப்பங்கு / Total Universal Dividend:`, 45, tableY + 36);
      doc.font(boldFont).text(`₹ ${data.totalDividend.toLocaleString('en-IN')}`, colValX, tableY + 36, { width: colValWidth, align: 'right' });

      doc.font(regularFont).text(`ஒரு டிக்கெட்டுக்கான லாபப்பங்கு / Dividend Per Ticket:`, 45, tableY + 50);
      doc.font(boldFont).text(`₹ ${data.dividendPerTicket.toLocaleString('en-IN')}`, colValX, tableY + 50, { width: colValWidth, align: 'right' });

      doc.x = 35;
      doc.y = tableY + 76;

      doc.font(boldFont).fontSize(9.5);
      doc.text(`வெற்றியாளருக்கான பரிசு தொகை / Prize Money: ₹ ${data.prizeMoney.toLocaleString('en-IN')}`, 35, doc.y, { width: pageWidth });
      doc.text(`அடுத்த மாத நிகர தவணை / Next Month Net Installment: ₹ ${data.nextMonthNetInstallment.toLocaleString('en-IN')} (அனைவருக்கும் / For All Members)`, 35, doc.y + 2, { width: pageWidth });
      doc.moveDown(0.5);

      // Winner Details Box
      doc.font(boldFont).fontSize(9).text('வெற்றியாளர் விவரம் / PRIZED SUBSCRIBER DETAILS:', 35, doc.y, { width: pageWidth });
      doc.font(regularFont).fontSize(8.5);
      const nameTamil = data.winnerNameTamil ? ` / ${data.winnerNameTamil}` : '';
      doc.text(`டிக்கெட் / Ticket: #${data.winnerTicketNumber} | பெயர் / Name: ${data.winnerName}${nameTamil}`, 35, doc.y + 2, { width: pageWidth });
      doc.text(`குறியீடு / Code: ${data.winnerCustomerCode} | தொலைபேசி / Mobile: ${data.winnerPhone}`, 35, doc.y + 2, { width: pageWidth });
      doc.moveDown(0.4);

      // Tie-Breaker Table if applicable (Option A)
      if (data.wasTieBreakWinner && data.tiedBidders && data.tiedBidders.length > 0) {
        doc.font(boldFont).fontSize(8.5).text('அதிபட்ச கழிவு சமநிலை & குலுக்கல் முடிவு / CEILING TIE LOT DRAW (OPTION A):', 35, doc.y, { width: pageWidth });
        doc.font(regularFont).fontSize(8);
        doc.text('அதிகபட்ச கழிவான 25% ஏலம் கேட்டவர்களிடையே நேரில் டோக்கன் குலுக்கல் மூலம் வெற்றியாளர் தேர்வு செய்யப்பட்டார்:', 35, doc.y + 2, { width: pageWidth });

        data.tiedBidders.forEach((tb) => {
          const status = tb.isWinner ? '[வெற்றியாளர் / WINNER]' : '[பங்கேற்றவர் / Participant]';
          doc.text(`  • டோக்கன் #${tb.tokenNumberDrawn ?? 'N/A'}: டிக்கெட் #${tb.ticketNumber} - ${tb.customerName} ${status}`, 35, doc.y + 2, { width: pageWidth });
        });
        doc.moveDown(0.4);
      }

      // Minutes Proceedings Text
      doc.font(boldFont).fontSize(8.5).text('ஏல நடவடிக்கைகள் & குறிப்புகள் / AUCTION PROCEEDINGS:', 35, doc.y, { width: pageWidth });
      doc.font(regularFont).fontSize(8);
      doc.text(data.minutesText || 'ஏலம் முறைப்படி அமைதியான முறையில் உறுப்பினர்கள் முன்னிலையில் நடத்தப்பட்டது.', 35, doc.y + 2, { width: pageWidth });
      doc.moveDown(1.2);

      // Signatures
      const sigY = doc.y;
      doc.moveTo(35, sigY).lineTo(560, sigY).stroke();
      doc.moveDown(0.5);

      doc.font(regularFont).fontSize(8);
      doc.text('முன்னிலையாளர் கையொப்பம் / Foreman Signature:', 45, sigY + 8);
      doc.font(boldFont).fontSize(8.5).text('குமரன் பைனான்ஸ் (Foreman)', 45, sigY + 22);

      doc.font(regularFont).fontSize(8).text('பதிவாளர் தாக்கல் உறுதிமொழி / Registrar Filing:', 340, sigY + 8);
      doc.font(boldFont).fontSize(8.5).text('சரிபார்க்கப்பட்டு பதிவு செய்யப்பட்டது', 340, sigY + 22);

      doc.end();
    });
  }
}
