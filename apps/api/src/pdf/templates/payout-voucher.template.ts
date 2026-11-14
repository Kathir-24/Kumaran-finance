import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface PayoutVoucherPdfData {
  voucherNumber: string;
  disbursedAt: Date;
  groupCode: string;
  chitValue: bigint;
  installmentMonth: number;
  auctionDate: Date;
  ticketNumber: number;
  winnerCode: string;
  winnerName: string;
  winnerNameTamil?: string | null;
  phone: string;
  bidDiscount: bigint;
  netPrizeMoney: bigint;
  disbursementMode: string;
  paymentReference: string;
  agreementSigned: boolean;
  nomineeSigned: boolean;
  isSecurityRequired: boolean;
  blankChequeDetails?: string | null;
  verifiedByUserName: string;
  authorizedByUserName: string;
  branchName?: string;
  branchAddress?: string;
}

export class PayoutVoucherTemplate {
  static async generate(data: PayoutVoucherPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Standard A5 landscape (595.28 x 419.53 pt)
      const doc = new PDFDocument({
        size: 'A5',
        layout: 'landscape',
        margins: { top: 20, bottom: 20, left: 25, right: 25 },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const regularFont = FontResolverHelper.getTamilRegularFont();
      const boldFont = FontResolverHelper.getTamilBoldFont();

      const pageWidth = 595.28 - 50; // 545.28 pt printable

      // Company Header
      doc.font(boldFont).fontSize(14).text('KUMARAN FINANCE / குமரன் பைனான்ஸ்', { align: 'center', width: pageWidth });
      doc.font(regularFont).fontSize(9).text('Head Office: Perundurai, Erode / தலைமை கிளை: பெருந்துறை, ஈரோடு', { align: 'center', width: pageWidth });
      doc.moveDown(0.3);

      doc.font(boldFont).fontSize(11).text('பரிசு தொகை பட்டுவாடா வவுச்சர் / PRIZE DISBURSEMENT VOUCHER', { align: 'center', width: pageWidth });
      doc.moveTo(25, doc.y).lineTo(570, doc.y).stroke();
      doc.moveDown(0.5);

      // Metadata Row
      doc.font(regularFont).fontSize(9);
      const voucherDate = data.disbursedAt.toISOString().split('T')[0];
      doc.text(`வவுச்சர் எண் / Voucher No: ${data.voucherNumber}`, 25, doc.y, { continued: true });
      doc.text(`தேதி / Date: ${voucherDate}`, { align: 'right' });
      doc.moveDown(0.2);

      doc.text(`சீட்டு குழு / Chit Group: ${data.groupCode} | மாதம் / Month: ${data.installmentMonth} | டிக்கெட் / Ticket: #${data.ticketNumber}`);
      const winnerTamil = data.winnerNameTamil ? ` / ${data.winnerNameTamil}` : '';
      doc.text(`வெற்றியாளர் / Winner: ${data.winnerName}${winnerTamil} (${data.winnerCode}) | தொலைபேசி: ${data.phone}`);
      doc.moveDown(0.4);

      // Financial Breakdown Box
      const boxY = doc.y;
      const boxHeight = 64;
      doc.rect(25, boxY, pageWidth, boxHeight).fillAndStroke('#f8f9fa', '#ced4da');
      doc.fillColor('#000');

      doc.font(boldFont).fontSize(9).text('நிதி விவரங்கள் / FINANCIAL DETAILS:', 35, boxY + 8);
      doc.font(regularFont).fontSize(9);
      doc.text(`மொத்த சீட்டு மதிப்பு / Chit Value: ₹ ${data.chitValue.toLocaleString('en-IN')}`, 35, boxY + 25);
      doc.text(`ஏல கழிவு / Bid Discount: ₹ ${data.bidDiscount.toLocaleString('en-IN')}`, 35, boxY + 43);

      const rightBoxX = 295;
      const rightBoxWidth = pageWidth - (rightBoxX - 25) - 10;
      doc.font(boldFont).fontSize(9.5);
      doc.text(`நிகர பரிசு தொகை / NET PRIZE: ₹ ${data.netPrizeMoney.toLocaleString('en-IN')}`, rightBoxX, boxY + 8, { width: rightBoxWidth });
      doc.font(regularFont).fontSize(8.5);
      doc.text(`முறை / Mode: ${data.disbursementMode}`, rightBoxX, boxY + 26, { width: rightBoxWidth });
      doc.text(`குறிப்பு எண் / Ref: ${data.paymentReference}`, rightBoxX, boxY + 43, { width: rightBoxWidth });

      doc.x = 25;
      doc.y = boxY + boxHeight + 8;

      // Words
      doc.font(regularFont).fontSize(8.5);
      doc.text(`தொகை (சொற்களில்): ${RupeeWordsHelper.toTamilWords(data.netPrizeMoney)}`, 25, doc.y, { width: pageWidth });
      doc.text(`In Words: ${RupeeWordsHelper.toEnglishWords(data.netPrizeMoney)}`, 25, doc.y + 2, { width: pageWidth });
      doc.moveDown(0.4);

      // Safety Proof Checklist Stamp (ADR-15)
      doc.font(boldFont).fontSize(8.5).text('நிறுவன பாதுகாப்பு சரிபார்ப்பு / COMPANY SAFETY PROOF CHECKLIST (ADR-15):', 25, doc.y, { width: pageWidth });
      doc.font(regularFont).fontSize(8);
      const agr = data.agreementSigned ? 'சரி / YES' : 'இல்லை / NO';
      const nom = data.nomineeSigned ? 'சரி / YES' : 'இல்லை / NO';
      const chq = data.blankChequeDetails ? `காசோலை / Cheques (${data.blankChequeDetails})` : 'தேவையில்லை / N/A';
      doc.text(`• ஒப்பந்தம் / Agreement Signed: [ ${agr} ]   • வாரிசு கையொப்பம் / Nominee Signed: [ ${nom} ]   • பாதுகாப்பு / Security: [ ${chq} ]`, 25, doc.y + 2, { width: pageWidth });
      doc.moveDown(0.8);

      // Signature Blocks (Dual Control)
      const sigY = doc.y;
      doc.moveTo(25, sigY).lineTo(570, sigY).stroke();
      doc.moveDown(0.5);

      doc.font(regularFont).fontSize(8);
      doc.text(`சரிபார்த்தவர் (தயாரிப்பாளர் / Maker):`, 35, sigY + 8);
      doc.font(boldFont).fontSize(8.5).text(data.verifiedByUserName, 35, sigY + 20);

      doc.font(regularFont).fontSize(8).text(`அனுமதித்தவர் (சரிபார்ப்பாளர் / Checker):`, 230, sigY + 8);
      doc.font(boldFont).fontSize(8.5).text(data.authorizedByUserName, 230, sigY + 20);

      doc.font(regularFont).fontSize(8).text(`வெற்றியாளர் கையொப்பம் / Winner Signature:`, 410, sigY + 8);
      doc.font(boldFont).fontSize(8.5).text('(கையொப்பம் / Signature)', 410, sigY + 20);

      doc.end();
    });
  }
}
