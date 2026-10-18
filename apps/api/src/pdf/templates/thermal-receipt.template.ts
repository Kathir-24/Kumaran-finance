import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface ReceiptPdfData {
  receiptNumber: string;
  date: Date;
  groupCode: string;
  installmentMonth: number;
  durationMonths: number;
  ticketNumber: number;
  subscriberName: string;
  subscriberNameTamil?: string | null;
  address?: string | null;
  phone: string;
  baseInstallment: bigint;
  dividendDeduction: bigint;
  netPayableAmount: bigint;
  amountPaid: bigint;
  paymentMethod: string;
  collectedByName: string;
  branchName?: string;
  branchAddress?: string;
  branchPhone?: string;
}

export class ThermalReceiptTemplate {
  static async generate(data: ReceiptPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // 80mm standard thermal roll width is 226.77 pt (~80mm)
      const doc = new PDFDocument({
        size: [226.77, 560],
        margins: { top: 10, bottom: 10, left: 10, right: 10 },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const regularFont = FontResolverHelper.getTamilRegularFont();
      const boldFont = FontResolverHelper.getTamilBoldFont();

      const width = 206.77; // 226.77 - 20 margin

      // Header
      doc.font(boldFont).fontSize(9).text('KUMARAN FINANCE / குமரன் பைனான்ஸ்', { align: 'center', width });
      doc.font(regularFont).fontSize(7.5).text('Chit Fund Operations / சீட்டு நிறுவனம்', { align: 'center', width });
      doc.text(data.branchAddress || 'Main Road, Perundurai / பெருந்துறை, ஈரோடு', { align: 'center', width });
      doc.text(`Phone / தொலைபேசி: ${data.branchPhone || '+91 98765 43210'}`, { align: 'center', width });

      doc.moveDown(0.3);
      doc.text('------------------------------------------------------------', { align: 'center', width });
      doc.font(boldFont).fontSize(8.5).text('சந்தா ரசீது / SUBSCRIPTION RECEIPT', { align: 'center', width });
      doc.font(regularFont).fontSize(7.5).text('------------------------------------------------------------', { align: 'center', width });

      // Metadata
      doc.font(regularFont).fontSize(7.5);
      const dateStr = data.date.toISOString().split('T')[0];
      doc.text(`ரசீது எண் / Receipt: ${data.receiptNumber}`);
      doc.text(`தேதி / Date: ${dateStr}`);
      doc.text(`சீட்டு / Chit Code: ${data.groupCode}`);
      doc.text(`மாதம் / Month: ${data.installmentMonth} / ${data.durationMonths}    டிக்கெட் / Ticket: #${data.ticketNumber}`);

      doc.text('------------------------------------------------------------', { align: 'center', width });
      const nameTamil = data.subscriberNameTamil ? ` / ${data.subscriberNameTamil}` : '';
      doc.text(`சந்தாதாரர் / Name: ${data.subscriberName}${nameTamil}`);
      if (data.address) {
        doc.text(`முகவரி / Address: ${data.address}`);
      }
      doc.text(`தொலைபேசி / Mobile: ${data.phone}`);

      doc.text('------------------------------------------------------------', { align: 'center', width });
      doc.font(boldFont).fontSize(7.5).text('கட்டண விவரங்கள் / PAYMENT BREAKDOWN:');
      doc.font(regularFont).fontSize(7.5);
      doc.text(`அடிப்படை தவணை / Base Due: ₹ ${data.baseInstallment.toLocaleString('en-IN')}`);
      doc.text(`கழிவு லாபப்பங்கு / Dividend Credit: - ₹ ${data.dividendDeduction.toLocaleString('en-IN')}`);
      doc.text(`செலுத்த வேண்டியது / Net Payable: ₹ ${data.netPayableAmount.toLocaleString('en-IN')}`);

      doc.text('------------------------------------------------------------', { align: 'center', width });
      doc.font(boldFont).fontSize(9);
      doc.text(`செலுத்திய தொகை / AMOUNT: ₹ ${data.amountPaid.toLocaleString('en-IN')}`);

      // Words
      doc.font(regularFont).fontSize(6.5);
      doc.text(`(${RupeeWordsHelper.toTamilWords(data.amountPaid)})`);
      doc.text(`(${RupeeWordsHelper.toEnglishWords(data.amountPaid)})`);

      doc.moveDown(0.2);
      doc.fontSize(7.5);
      doc.text(`கட்டண முறை / Mode: ${data.paymentMethod}`);
      doc.text(`வசூலித்தவர் / Collected By: ${data.collectedByName}`);

      doc.moveDown(0.3);
      doc.fontSize(6.5).text('------------------------------------------------------------', { align: 'center', width });
      doc.text('* கணினி மூலம் உருவாக்கப்பட்ட ரசீது.', { align: 'center', width });
      doc.text('* This is a computer-generated digital receipt.', { align: 'center', width });

      doc.end();
    });
  }
}
