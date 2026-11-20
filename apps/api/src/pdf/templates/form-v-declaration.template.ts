import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormVPdfData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  sanctionOrderNumber?: string | null;
  sanctionDate?: Date | string | null;
  declarationDate?: Date | string | null;
  statutoryFilingFee?: bigint;
  branchName?: string | null;
  branchAddress?: string | null;
  managingPartnerName?: string | null;
  subscribedTicketsCount: number;
  subscribers?: Array<{
    ticketNumber: number;
    customerName: string;
    customerCode: string;
    phone: string;
  }>;
}

export class FormVDeclarationTemplate {
  static async generate(data: FormVPdfData): Promise<Buffer> {
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
        const declDate = FontResolverHelper.formatPdfDate(data.declarationDate || new Date());
        const sancDate = FontResolverHelper.formatPdfDate(data.sanctionDate || new Date());
        const feeAmount = data.statutoryFilingFee ?? 200n;
        const feeWords = RupeeWordsHelper.toEnglishWords(feeAmount);
        const chitValueWords = RupeeWordsHelper.toEnglishWords(data.chitValue);
        const managingPartner = data.managingPartnerName || 'P. Kumaran (Managing Partner)';
        const firmName = 'KUMARAN FINANCE';
        const officeAddress =
          data.branchAddress || '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052';
        const sanctionNo = data.sanctionOrderNumber || 'ROC/ERD/REG/PENDING';

        // Header
        doc.font(boldFont).fontSize(11).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10.5).text('FORM — V', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('(See Section 9(1) and Rule 10)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);
        doc.font(boldFont).fontSize(9.5).text(
          'DECLARATION OF 100% SUBSCRIPTION TO ALL TICKETS IN CHIT AGREEMENT',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(45, doc.y + 4).lineTo(550, doc.y + 4).stroke();
        doc.moveDown(0.8);

        // Place & Date
        const topY = doc.y;
        doc.font(boldFont).fontSize(8.5).text('To:', 45, topY);
        doc.font(regularFont).fontSize(8.5);
        doc.text('The Registrar of Chits,', 45, topY + 12);
        doc.text('Perundurai / Erode District,', 45, topY + 24);
        doc.text('Tamil Nadu.', 45, topY + 36);

        doc.font(boldFont).text('Place: Perundurai', 360, topY);
        doc.font(boldFont).text(`Date: ${declDate}`, 360, topY + 12);

        doc.y = topY + 65;
        doc.font(boldFont).fontSize(9).text('Dear Sir,', 45, doc.y);
        doc.moveDown(0.4);

        doc.font(regularFont).fontSize(8.5).text(
          `1. By your letter / certificate dated ${sancDate} (Registration / Sanction Reference: ${sanctionNo}), you were pleased to grant me / us certificate of registration to commence a new chit of a chit amount of Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)} (${chitValueWords}) and of a duration ${data.durationMonths} months.`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.5);

        doc.text(
          `2. I / We have subsequently enlisted the required number of members and we hereby declare in terms of sub-section (1) of Section 9 of the Chit Funds Act, 1982 (Central Act No. 40 of 1982) that all the ${data.totalTickets} tickets specified in the chit agreement have been fully subscribed (100% full enrollment: ${data.subscribedTicketsCount} of ${data.totalTickets} tickets allocated).`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.5);

        doc.text(
          `3. I / We remit herewith a sum of Rs. ${RupeeWordsHelper.formatWholeRupees(feeAmount)} (${feeWords} only) being the fees prescribed for the purpose of filing this declaration.`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.8);

        // Subscriber Roster Table Summary
        if (data.subscribers && data.subscribers.length > 0) {
          doc.font(boldFont).fontSize(8.5).text('SUBSCRIBER ENROLLMENT ROSTER (VERIFIED 100% SUBSCRIPTION):');
          doc.moveDown(0.2);

          const tableY = doc.y;
          const rowHeight = 14;
          const tableHeaderHeight = 16;
          doc.rect(45, tableY, pageWidth, tableHeaderHeight).fillAndStroke('#212529', '#212529');
          doc.fillColor('#fff').font(boldFont).fontSize(7.5);

          doc.text('Ticket #', 50, tableY + 4, { width: 50 });
          doc.text('Customer Code', 105, tableY + 4, { width: 85 });
          doc.text('Subscriber Name', 195, tableY + 4, { width: 195 });
          doc.text('Mobile Number', 400, tableY + 4, { width: 120, align: 'right' });

          doc.fillColor('#000');
          let curY = tableY + tableHeaderHeight;

          // Limit displayed rows if over 20 to fit A4 neatly or page-break
          for (let i = 0; i < data.subscribers.length; i++) {
            if (curY > 710) {
              doc.addPage();
              curY = 40;
            }
            const s = data.subscribers[i];
            const isEven = i % 2 === 0;
            if (isEven) {
              doc.rect(45, curY, pageWidth, rowHeight).fill('#f8f9fa');
              doc.fillColor('#000');
            }
            doc.font(boldFont).fontSize(7).text(`#${s.ticketNumber}`, 50, curY + 3, { width: 50 });
            doc.font(regularFont).fontSize(7).text(s.customerCode, 105, curY + 3, { width: 85 });
            doc.font(regularFont).fontSize(7).text(s.customerName, 195, curY + 3, { width: 195 });
            doc.font(regularFont).fontSize(7).text(s.phone, 400, curY + 3, { width: 120, align: 'right' });
            curY += rowHeight;
          }
          doc.y = curY + 10;
        }

        doc.moveDown(1);
        const sigY = doc.y;
        doc.font(boldFont).fontSize(8.5).text('Yours faithfully,', 360, sigY);
        doc.moveDown(2);
        doc.text(`For and on behalf of Foreman:`, 360, sigY + 35);
        doc.text(firmName, 360, sigY + 47);
        doc.font(regularFont).text(managingPartner, 360, sigY + 60);
        doc.text('(Managing Partner / Foreman)', 360, sigY + 72);

        doc.font(boldFont).fontSize(8).text('Office / Scheme Details:', 45, sigY + 35);
        doc.font(regularFont).fontSize(8);
        doc.text(`Firm: ${firmName}`, 45, sigY + 47);
        doc.text(`Scheme Code: ${data.groupCode}`, 45, sigY + 59);
        doc.text(`Place of Business: ${officeAddress}`, 45, sigY + 71, { width: 260 });

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
