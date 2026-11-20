import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

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
  branchAddress?: string | null;
}

export class FormXxiPassbookTemplate {
  private static drawTableHeader(
    doc: PDFKit.PDFDocument,
    boldFont: string,
    tableHeadY: number,
    pageWidth: number,
    headHeight: number,
  ): void {
    doc.rect(30, tableHeadY, pageWidth, headHeight).fillAndStroke('#343a40', '#343a40');
    doc.fillColor('#fff').font(boldFont).fontSize(6.8);

    doc.text('மாதம் / Month', 35, tableHeadY + 3, { width: 55, align: 'left' });
    doc.text('தவணை தேதி / Due Date', 95, tableHeadY + 3, { width: 85, align: 'center' });
    doc.text('அடிப்படை / Gross', 185, tableHeadY + 3, { width: 75, align: 'right' });
    doc.text('லாபப்பங்கு / Div', 265, tableHeadY + 3, { width: 75, align: 'right' });
    doc.text('நிகர தொகை / Net', 345, tableHeadY + 3, { width: 75, align: 'right' });
    doc.text('செலுத்தியது / Paid', 425, tableHeadY + 3, { width: 80, align: 'right' });
    doc.text('கட்டிய தேதி / Paid Date', 510, tableHeadY + 3, { width: 85, align: 'center' });
    doc.text('ரசீது எண் / Receipt No', 600, tableHeadY + 3, { width: 125, align: 'center' });
    doc.text('நிலை / Status', 730, tableHeadY + 3, { width: 75, align: 'center' });
  }

  static async generate(data: FormXxiPassbookPdfData): Promise<Buffer> {
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
        // Standard A4 landscape (841.89 x 595.28 pt)
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margins: { top: 25, bottom: 25, left: 30, right: 30 },
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

        const pageWidth = 841.89 - 60; // 781.89 pt printable

        // Company Header
        doc.font(boldFont).fontSize(13).text('KUMARAN FINANCE / குமரன் பைனான்ஸ்', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text(
          data.branchAddress || 'Main Road, Perundurai, Erode / தலைமை கிளை, பெருந்துறை, ஈரோடு',
          { align: 'center', width: pageWidth },
        );
        doc.moveDown(0.2);

        doc.font(boldFont).fontSize(9.5).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10.5).text(
          'FORM XIV: சந்தாதாரர் பேரேடு / FORM OF THE LEDGER TO BE MAINTAINED',
          { align: 'center', width: pageWidth },
        );
        doc.font(regularFont).fontSize(8).text(
          '(Section I — Receipts and Payments in Respect of Subscriber | See Section 23 and Rule 25(2))',
          { align: 'center', width: pageWidth },
        );
        doc.font(regularFont).fontSize(7).text(
          '*(Formerly cited as Form XXI Passbook; aligned with Form XIV Section I of Tamil Nadu Chit Funds Rules, 1984)*',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(30, doc.y + 2).lineTo(810, doc.y + 2).stroke();
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
        doc.text(`மொத்த சந்தா / Gross Due: ₹ ${RupeeWordsHelper.formatWholeRupees(data.totalGrossDue)}`, 40, summaryY + 8);
        doc.text(`மொத்த லாபப்பங்கு / Dividends: ₹ ${RupeeWordsHelper.formatWholeRupees(data.totalDividendCredit)}`, 220, summaryY + 8);
        doc.text(`செலுத்திய தொகை / Total Paid: ₹ ${RupeeWordsHelper.formatWholeRupees(data.totalPaid)}`, 420, summaryY + 8);

        const arrearsColor = data.totalOutstandingArrears > 0n ? '#dc3545' : '#28a745';
        doc.fillColor(arrearsColor).text(`நிலுவை / Arrears: ₹ ${RupeeWordsHelper.formatWholeRupees(data.totalOutstandingArrears)}`, 620, summaryY + 8);
        doc.fillColor('#000');

        doc.y = summaryY + 36;

        // Table Header
        const tableHeadY = doc.y;
        const headHeight = 22;
        const rowHeight = 16;
        const maxRowBottomY = 550; // Leaves room for margins & footer on 595.28pt height

        this.drawTableHeader(doc, boldFont, tableHeadY, pageWidth, headHeight);
        doc.fillColor('#000').font(regularFont).fontSize(7);
        let curY = tableHeadY + headHeight;

        data.schedule.forEach((row, idx) => {
          if (curY + rowHeight > maxRowBottomY) {
            doc.addPage();
            this.drawTableHeader(doc, boldFont, 30, pageWidth, headHeight);
            doc.fillColor('#000').font(regularFont).fontSize(7);
            curY = 30 + headHeight;
          }

          const bg = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
          doc.rect(30, curY, pageWidth, rowHeight).fillAndStroke(bg, '#e9ecef');
          doc.fillColor('#000');

          const dueStr = FontResolverHelper.formatPdfDate(row.dueDate);
          const paidStr = row.paymentDate ? FontResolverHelper.formatPdfDate(row.paymentDate) : '-';
          const recStr = row.receiptNumber || '-';

          doc.text(`மாதம் ${row.installmentMonth}`, 35, curY + 4, { width: 55, align: 'left' });
          doc.text(dueStr, 95, curY + 4, { width: 85, align: 'center' });
          doc.text(`₹ ${RupeeWordsHelper.formatWholeRupees(row.grossAmount)}`, 185, curY + 4, { width: 75, align: 'right' });
          doc.text(`- ₹ ${RupeeWordsHelper.formatWholeRupees(row.dividendDeduction)}`, 265, curY + 4, { width: 75, align: 'right' });
          doc.text(`₹ ${RupeeWordsHelper.formatWholeRupees(row.netPayableAmount)}`, 345, curY + 4, { width: 75, align: 'right' });
          doc.text(`₹ ${RupeeWordsHelper.formatWholeRupees(row.paidAmount)}`, 425, curY + 4, { width: 80, align: 'right' });
          doc.text(paidStr, 510, curY + 4, { width: 85, align: 'center' });
          doc.text(recStr, 600, curY + 4, { width: 125, align: 'center' });

          if (row.status === 'PAID') {
            doc.fillColor('#28a745').text('PAID', 730, curY + 4, { width: 75, align: 'center' });
          } else if (row.status === 'OVERDUE') {
            doc.fillColor('#dc3545').text('OVERDUE', 730, curY + 4, { width: 75, align: 'center' });
          } else {
            doc.fillColor('#6c757d').text('UNPAID', 730, curY + 4, { width: 75, align: 'center' });
          }
          doc.fillColor('#000');

          curY += rowHeight;
        });

        if (curY + 24 > 570) {
          doc.addPage();
          curY = 30;
        }

        doc.x = 30;
        doc.y = curY + 12;
        doc.font(regularFont).fontSize(7).text('* கணினி மூலம் உருவாக்கப்பட்ட அதிகாரப்பூர்வ சந்தாதாரர் பேரேடு. This is a computer-generated passbook statement.', 30, doc.y, { align: 'center', width: pageWidth });

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
