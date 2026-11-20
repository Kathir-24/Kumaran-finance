import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormViiPdfData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  sanctionOrderNumber?: string | null;
  registrationNumber?: string | null;
  commencementCertificateDate?: Date | string | null;
  copiesFurnishedDate?: Date | string | null;
  firstDrawDate?: Date | string | null;
  certificateDate?: Date | string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  managingPartnerName?: string | null;
}

export class FormViiCertificateTemplate {
  static async generate(data: FormViiPdfData): Promise<Buffer> {
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
        const certDate = FontResolverHelper.formatPdfDate(data.certificateDate || new Date());
        const furnishedDate = FontResolverHelper.formatPdfDate(data.copiesFurnishedDate || new Date());
        const commencementDate = FontResolverHelper.formatPdfDate(data.commencementCertificateDate || new Date());
        const firstDrawDate = FontResolverHelper.formatPdfDate(data.firstDrawDate || new Date());
        const chitValueWords = RupeeWordsHelper.toEnglishWords(data.chitValue);
        const managingPartner = data.managingPartnerName || 'P. Kumaran (Managing Partner)';
        const firmName = 'KUMARAN FINANCE';
        const officeAddress =
          data.branchAddress || '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052';
        const regNo = data.registrationNumber || data.sanctionOrderNumber || 'ROC/ERD/REG/2026/042';

        // Header
        doc.font(boldFont).fontSize(11).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10.5).text('FORM — VII', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('(See Section 10(2) and Rule 12)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);
        doc.font(boldFont).fontSize(9.5).text(
          'CERTIFICATE OF FURNISHING COPY OF CHIT AGREEMENT TO EVERY SUBSCRIBER',
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
        doc.font(boldFont).text(`Date: ${certDate}`, 360, topY + 12);

        doc.y = topY + 65;
        doc.font(boldFont).fontSize(9).text('Dear Sir,', 45, doc.y);
        doc.moveDown(0.4);

        doc.font(boldFont).fontSize(8.5).text(
          'Re: The Chit Funds Act, 1982 (Central Act No. 40 of 1982) — Statutory Compliance Certificate under Section 10(2)',
        );
        doc.moveDown(0.4);

        doc.font(regularFont).fontSize(8.5).text(
          `I / We, the Foreman of the chit / Managing Partner on behalf of the Foreman Firm conducting the chit, the chit agreement bearing registration number ${regNo} of ${new Date().getFullYear()} having been registered in the office of the Registrar of Chits, do hereby certify that I / We have furnished to every subscriber of the chit a copy of the said chit agreement duly certified by me / us to be a true copy.`,
          { align: 'justify', lineGap: 2.5 },
        );
        doc.moveDown(0.6);

        // Summary of Facts Table
        const factsY = doc.y;
        doc.rect(45, factsY, pageWidth, 110).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor('#000');

        doc.font(boldFont).fontSize(8.5).text('STATUTORY VERIFICATION MILESTONES:', 55, factsY + 8);
        doc.font(regularFont).fontSize(8);

        doc.text(`1. Chit Scheme Reference:`, 55, factsY + 24);
        doc.font(boldFont).text(`${data.groupCode} (${data.groupName}) | Chit Value: Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)}`, 220, factsY + 24);

        doc.font(regularFont).text(`2. Total Number of Subscribers:`, 55, factsY + 38);
        doc.font(boldFont).text(`${data.totalTickets} Subscribers (100% Full Enrollment)`, 220, factsY + 38);

        doc.font(regularFont).text(`3. Date of Furnishing True Copies:`, 55, factsY + 52);
        doc.font(boldFont).text(`${furnishedDate} (Furnished to all ${data.totalTickets} members)`, 220, factsY + 52);

        doc.font(regularFont).text(`4. Commencement Certificate Date (Sec 9(2)):`, 55, factsY + 66);
        doc.font(boldFont).text(`${commencementDate}`, 220, factsY + 66);

        doc.font(regularFont).text(`5. Date of First Draw (Month 1):`, 55, factsY + 80);
        doc.font(boldFont).text(`${firstDrawDate} (Foreman Ticket Settled Without Auction)`, 220, factsY + 80);

        doc.font(regularFont).text(`6. Chit Value in Words:`, 55, factsY + 94);
        doc.font(boldFont).text(`${chitValueWords} Only`, 220, factsY + 94);

        doc.y = factsY + 120;
        doc.moveDown(0.6);

        doc.font(regularFont).fontSize(8.5).text(
          `The copies were furnished to each of the subscribers on ${furnishedDate} in physical form / acknowledged digital copy as required under Section 10(1) and 10(2) of the Act.\n\nThe date of obtaining the certificate of commencement of the said chit granted under sub-section (2) of Section 9 is ${commencementDate}.\n\nThe first draw of the said chit was held on ${firstDrawDate}.`,
          { align: 'justify', lineGap: 2.5 },
        );
        doc.moveDown(1.5);

        // Signatures
        const sigY = doc.y;
        doc.font(boldFont).fontSize(8.5).text('Yours faithfully,', 360, sigY);
        doc.moveDown(2);
        doc.text(`For and on behalf of Foreman:`, 360, sigY + 35);
        doc.text(firmName, 360, sigY + 47);
        doc.font(regularFont).text(managingPartner, 360, sigY + 60);
        doc.text('(Managing Partner / Foreman)', 360, sigY + 72);

        doc.font(boldFont).fontSize(8).text('Foreman Operating Office:', 45, sigY + 35);
        doc.font(regularFont).fontSize(8);
        doc.text(firmName, 45, sigY + 47);
        doc.text(officeAddress, 45, sigY + 59, { width: 260 });
        doc.text(`Phone: +91 98765 43210`, 45, sigY + 83);

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
