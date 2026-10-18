import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';

export interface PassbookScheduleItem {
  installmentMonth: number;
  dueDate: Date;
  grossAmount: bigint;
  dividendDeduction: bigint;
  netPayableAmount: bigint;
  paidAmount: bigint;
  status: string;
  paymentDate?: Date | null;
  receiptNumber?: string | null;
}

export interface FormXxiPassbookPdfData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  baseInstallment: bigint;
  ticketNumber: number;
  isPrized: boolean;
  customerCode: string;
  customerName: string;
  customerNameTamil?: string | null;
  phone: string;
  totalGrossDue: bigint;
  totalDividendCredit: bigint;
  totalNetPayable: bigint;
  totalPaid: bigint;
  totalOutstandingArrears: bigint;
  schedule: PassbookScheduleItem[];
}

export class FormXxiPassbookTemplate {
  static async generate(data: FormXxiPassbookPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Standard A4 landscape (841.89 x 595.28 pt)
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 25, bottom: 25, left: 30, right: 30 },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const regularFont = FontResolverHelper.getTamilRegularFont();
      const boldFont = FontResolverHelper.getTamilBoldFont();

      const pageWidth = 841.89 - 60; // 781.89 pt printable

      // Company Header
      doc.font(boldFont).fontSize(13).text('KUMARAN FINANCE / குமரன் பைனான்ஸ்', { align: 'center', width: pageWidth });
      doc.font(regularFont).fontSize(8.5).text('Main Road, Perundurai, Erode / தலைமை கிளை, பெருந்துறை, ஈரோடு', { align: 'center', width: pageWidth });
      doc.moveDown(0.2);

      doc.font(boldFont).fontSize(10.5).text('படிவம் XXI / FORM XXI: சந்தாதாரர் பேரேடு / SUBSCRIBER PASSBOOK LEDGER [UNVERIFIED-LEGAL]', { align: 'center', width: pageWidth });
      doc.moveTo(30, doc.y).lineTo(810, doc.y).stroke();
      doc.moveDown(0.4);

      // Customer & Scheme Meta Row
      doc.font(regularFont).fontSize(8.5);
      const nameTamil = data.customerNameTamil ? ` / ${data.customerNameTamil}` : '';
      doc.text(`சந்தாதாரர் / Member: ${data.customerName}${nameTamil} (${data.customerCode}) | போன்: ${data.phone}`, 30, doc.y, { continued: true });
      doc.text(`சீட்டு / Scheme: ${data.groupCode} (${data.groupName}) | டிக்கெட்: #${data.ticketNumber}`, { align: 'right' });
      doc.moveDown(0.3);

      // Financial Summary Bar
      const summaryY = doc.y;
      doc.rect(30, summaryY, pageWidth, 28).fillAndStroke('#e9ecef', '#ced4da');
      doc.fillColor('#000');

      doc.font(boldFont).fontSize(8);
      doc.text(`மொத்த சந்தா / Gross Due: ₹ ${data.totalGrossDue.toLocaleString('en-IN')}`, 40, summaryY + 8);
      doc.text(`மொத்த லாபப்பங்கு / Dividends: ₹ ${data.totalDividendCredit.toLocaleString('en-IN')}`, 220, summaryY + 8);
      doc.text(`செலுத்திய தொகை / Total Paid: ₹ ${data.totalPaid.toLocaleString('en-IN')}`, 420, summaryY + 8);

      const arrearsColor = data.totalOutstandingArrears > 0n ? '#dc3545' : '#28a745';
      doc.fillColor(arrearsColor).text(`நிலுவை / Arrears: ₹ ${data.totalOutstandingArrears.toLocaleString('en-IN')}`, 620, summaryY + 8);
      doc.fillColor('#000');

      doc.y = summaryY + 36;

      // Table Header
      const tableHeadY = doc.y;
      doc.rect(30, tableHeadY, pageWidth, 18).fillAndStroke('#343a40', '#343a40');
      doc.fillColor('#fff').font(boldFont).fontSize(7.5);

      doc.text('மாதம் / Month', 35, tableHeadY + 5);
      doc.text('தவணை தேதி / Due Date', 100, tableHeadY + 5);
      doc.text('அடிப்படை / Gross', 190, tableHeadY + 5);
      doc.text('லாபப்பங்கு / Div', 270, tableHeadY + 5);
      doc.text('நிகர தொகை / Net', 350, tableHeadY + 5);
      doc.text('செலுத்தியது / Paid', 430, tableHeadY + 5);
      doc.text('கட்டிய தேதி / Paid Date', 510, tableHeadY + 5);
      doc.text('ரசீது எண் / Receipt No', 600, tableHeadY + 5);
      doc.text('நிலை / Status', 710, tableHeadY + 5);

      doc.fillColor('#000').font(regularFont).fontSize(7);
      let curY = tableHeadY + 18;

      data.schedule.forEach((row, idx) => {
        const bg = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
        doc.rect(30, curY, pageWidth, 16).fillAndStroke(bg, '#e9ecef');
        doc.fillColor('#000');

        const dueStr = row.dueDate.toISOString().split('T')[0];
        const paidStr = row.paymentDate ? row.paymentDate.toISOString().split('T')[0] : '-';
        const recStr = row.receiptNumber || '-';

        doc.text(`மாதம் ${row.installmentMonth}`, 35, curY + 4);
        doc.text(dueStr, 100, curY + 4);
        doc.text(`₹ ${row.grossAmount.toLocaleString('en-IN')}`, 190, curY + 4);
        doc.text(`- ₹ ${row.dividendDeduction.toLocaleString('en-IN')}`, 270, curY + 4);
        doc.text(`₹ ${row.netPayableAmount.toLocaleString('en-IN')}`, 350, curY + 4);
        doc.text(`₹ ${row.paidAmount.toLocaleString('en-IN')}`, 430, curY + 4);
        doc.text(paidStr, 510, curY + 4);
        doc.text(recStr, 600, curY + 4);

        if (row.status === 'PAID') {
          doc.fillColor('#28a745').text('PAID', 710, curY + 4);
        } else if (row.status === 'OVERDUE') {
          doc.fillColor('#dc3545').text('OVERDUE', 710, curY + 4);
        } else {
          doc.fillColor('#6c757d').text('UNPAID', 710, curY + 4);
        }
        doc.fillColor('#000');

        curY += 16;
      });

      doc.y = curY + 10;
      doc.font(regularFont).fontSize(7).text('* கணினி மூலம் உருவாக்கப்பட்ட அதிகாரப்பூர்வ சந்தாதாரர் பேரேடு. This is a computer-generated passbook statement.', { align: 'center', width: pageWidth });

      doc.end();
    });
  }
}
