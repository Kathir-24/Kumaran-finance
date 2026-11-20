import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormIPdfData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  maxDiscountCeiling: bigint;
  foremanCommissionRate?: string | number | { toString(): string } | null;
  branchName?: string | null;
  branchAddress?: string | null;
  branchPhone?: string | null;
  managingPartnerName?: string | null;
  partnersList?: Array<{ name: string; roleDescription?: string; address?: string }>;
  resolutionDate?: Date | string | null;
  applicationDate?: Date | string | null;
  statutoryFeeAmount?: bigint;
  aggregateRunningChitsAmount?: bigint;
  runningChitsCount?: number;
}

export class FormISanctionTemplate {
  static async generate(data: FormIPdfData): Promise<Buffer> {
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
          margins: { top: 35, bottom: 35, left: 40, right: 40 },
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

        const pageWidth = 595.28 - 80; // 515.28 pt printable
        const appDate = FontResolverHelper.formatPdfDate(data.applicationDate || new Date());
        const resDate = FontResolverHelper.formatPdfDate(data.resolutionDate || new Date());
        const feeAmount = data.statutoryFeeAmount ?? 500n;
        const feeWords = RupeeWordsHelper.toEnglishWords(feeAmount);
        const aggAmount = data.aggregateRunningChitsAmount ?? data.chitValue;
        const aggWords = RupeeWordsHelper.toEnglishWords(aggAmount);
        const chitValueWords = RupeeWordsHelper.toEnglishWords(data.chitValue);
        const managingPartner = data.managingPartnerName || 'P. Kumaran (Managing Partner)';
        const firmName = 'KUMARAN FINANCE';
        const officeAddress =
          data.branchAddress || '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052';
        const commissionRateLabel = RupeeWordsHelper.formatCommissionRatePercent(
          data.foremanCommissionRate,
        );

        // ================= PAGE 1: FORM I APPLICATION =================
        doc.font(boldFont).fontSize(11).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10).text('APPENDIX — FORM I', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('(See Section 4(2) and Rule 3)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);
        doc.font(boldFont).fontSize(9.5).text(
          'FORM OF APPLICATION TO BE USED BY A FOREMAN FOR OBTAINING PREVIOUS SANCTION TO COMMENCE OR CONDUCT A CHIT',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(40, doc.y + 4).lineTo(555, doc.y + 4).stroke();
        doc.moveDown(0.8);

        // From / To layout
        const metaY = doc.y;
        doc.font(boldFont).fontSize(8.5).text('From:', 40, metaY);
        doc.font(regularFont).fontSize(8.5);
        doc.text(managingPartner, 40, metaY + 12);
        doc.text(firmName, 40, metaY + 24);
        doc.text(officeAddress, 40, metaY + 36, { width: 230 });

        doc.font(boldFont).text('Place: Perundurai', 360, metaY);
        doc.font(boldFont).text(`Date: ${appDate}`, 360, metaY + 12);

        doc.y = metaY + 70;
        doc.font(boldFont).fontSize(8.5).text('To:', 40, doc.y);
        doc.font(regularFont).fontSize(8.5);
        doc.text('The Secretary to the Government of Tamil Nadu /', 40, doc.y + 12);
        doc.text('The Authorised Officer by designation (Registrar of Chits),', 40, doc.y + 24);
        doc.text('Erode District, Tamil Nadu.', 40, doc.y + 36);

        doc.moveDown(2);
        doc.font(boldFont).fontSize(9).text('Sir,', 40, doc.y);
        doc.moveDown(0.4);

        doc.font(regularFont).fontSize(8.5).text(
          `I, ${managingPartner}, on behalf of ${firmName}, situated at having its registered and head office at ${officeAddress}, desire to commence and conduct a chit as foreman at ${officeAddress}. Full particulars in this regard are given in the Annexure hereto.`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.5);

        doc.text(
          `2. A certified true copy of the resolution passed by the Managing Committee / Partners at its meeting held on ${resDate} for commencing and conducting the chit in question is enclosed.`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.5);

        doc.text(
          `3. I / We remit herewith a sum of Rs. ${RupeeWordsHelper.formatWholeRupees(feeAmount)} (${feeWords}) only being the fees prescribed for the purpose.`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.5);

        doc.text(
          `4. I / We hereby certify that the aggregate chit amount of the chits run by me / us is Rs. ${RupeeWordsHelper.formatWholeRupees(aggAmount)} (${aggWords}) on the date of this application and does not exceed the aggregate chit amount prescribed by Section 13 of the Chit Funds Act, 1982 (Central Act No. 40 of 1982).`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.5);

        doc.text(
          `5. I / We request you to accord your sanction for commencing and conducting the Chit. On receipt of such sanction further steps for registration etc., of the chit will be taken.`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.5);

        doc.text(
          `6. We further undertake to register the chit within 12 months from the date of sanction by the State Government as per Section 4(1).`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.5);

        doc.text(
          `7. We have read the provisions of the Chit Funds Act, 1982 (Central Act No. 40 of 1982) and the Rules framed thereunder and agree to abide by the same in the conduct of the chit business.`,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(1.5);

        // Signatures box
        const sigY = doc.y;
        doc.font(boldFont).fontSize(8.5).text('Yours faithfully,', 360, sigY);
        doc.moveDown(2);
        doc.text(`For and on behalf of ${firmName}`, 360, sigY + 35);
        doc.font(regularFont).text(managingPartner, 360, sigY + 50);
        doc.text('(Managing Partner / Foreman)', 360, sigY + 62);

        doc.text('Encl: 1. Board Resolution', 40, sigY + 35);
        doc.text('      2. Annexure Statement of Particulars', 40, sigY + 47);
        doc.text('      3. Draft Chit Agreement', 40, sigY + 59);

        // ================= PAGE 2: ANNEXURE STATEMENT OF PARTICULARS =================
        doc.addPage();
        doc.font(boldFont).fontSize(10.5).text('ANNEXURE — STATEMENT OF PARTICULARS', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('(To be submitted with Form I application under Rule 3)', { align: 'center', width: pageWidth });
        doc.moveTo(40, doc.y + 4).lineTo(555, doc.y + 4).stroke();
        doc.moveDown(0.8);

        const particulars: Array<{ item: string; label: string; value: string }> = [
          {
            item: '1',
            label: 'Name and address of the company / partnership / sole proprietorship (Registered & Head Office):',
            value: `${firmName}\n${officeAddress}\nPhone: ${data.branchPhone || '+91 98765 43210'}`,
          },
          {
            item: '2',
            label: 'Constitution and provisions of the Act under which incorporated / registered:',
            value: 'Partnership Firm registered under the Indian Partnership Act, 1932 (Firm Reg No: TN-ERD-PF-2018-042).',
          },
          {
            item: '3',
            label: 'Names and addresses of branches / offices:',
            value: `Single Head Office Branch: ${data.branchName || 'Head Office - Perundurai'}\nAddress: ${officeAddress}`,
          },
          {
            item: '4',
            label: 'Main objects of the institution:',
            value: 'To promote thrift, savings, and mutual financial assistance among subscribers through regulated chit fund operations under the Chit Funds Act, 1982.',
          },
          {
            item: '5',
            label: 'Names, occupations and residential addresses of the partners / promoters:',
            value:
              '1. P. Kumaran, Managing Partner, Business, Perundurai.\n' +
              '2. K. Senthil, Partner, Business, Perundurai.\n' +
              '3. A. Velusamy, Partner, Business, Perundurai.\n' +
              '4. R. Selvaraj, Partner, Business, Perundurai.',
          },
          {
            item: '6',
            label: 'Name and residential address of the Chief Executive Officer and managerial staff:',
            value:
              '1. P. Kumaran, Managing Partner / CEO, Perundurai.\n' +
              '2. M. Rajendran, Branch Manager, Perundurai.\n' +
              '3. S. Priya, Desk Accountant, Perundurai.',
          },
          {
            item: '7',
            label: 'Names of the Bankers and their addresses:',
            value: 'Indian Overseas Bank, Perundurai Branch, Main Road, Perundurai, Erode - 638052.\nState Bank of India, Perundurai Branch, Perundurai - 638052.',
          },
          {
            item: '8',
            label: 'Names of the auditors and their addresses:',
            value: 'CA V. Natarajan, B.Com., FCA, Chartered Accountant, M.No: 028452, Erode - 638001.',
          },
          {
            item: '9',
            label: 'Particulars of the chit(s) to be started:',
            value:
              `• Scheme Code: ${data.groupCode} (${data.groupName})\n` +
              `• Chit Value: Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)} (${chitValueWords})\n` +
              `• Duration: ${data.durationMonths} Months | Total Tickets: ${data.totalTickets}\n` +
              `• Base Installment: Rs. ${RupeeWordsHelper.formatWholeRupees(data.baseInstallment)} per month\n` +
              `• Max Discount Ceiling: Rs. ${RupeeWordsHelper.formatWholeRupees(data.maxDiscountCeiling)} (Strictly 25% / 1/4 ceiling per ADR-06)\n` +
              `• Foreman Commission: ${commissionRateLabel} (Frozen per ADR-04)\n` +
              `• Frequency & Manner of Draws: Monthly draw by reverse auction with physical paper token tie-break (ADR-06). Month 1 taken by Foreman; Month N settled directly.`,
          },
          {
            item: '10',
            label: 'Places where the chit scheme(s) are proposed to be conducted:',
            value: `${firmName}, ${officeAddress}.`,
          },
          {
            item: '11',
            label: 'Names and addresses of the associate companies / partnership firms:',
            value: 'Nil. The firm has no associate companies, cooperative societies or subsidiaries.',
          },
          {
            item: '12',
            label: 'Names, occupations and addresses of directors / partners of institutions in Item 11:',
            value: 'Not Applicable (Nil associate entities).',
          },
        ];

        let curY = doc.y;
        for (const p of particulars) {
          // Check page overflow
          if (curY > 720) {
            doc.addPage();
            curY = 40;
          }
          doc.font(boldFont).fontSize(8).text(`${p.item}. ${p.label}`, 40, curY, { width: pageWidth });
          doc.font(regularFont).fontSize(8).text(p.value, 55, doc.y + 2, { width: pageWidth - 15, lineGap: 1.5 });
          doc.moveDown(0.35);
          curY = doc.y;
        }

        doc.moveDown(0.6);
        doc.font(boldFont).fontSize(8.5).text('SOLEMN DECLARATION', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8).text(
          'I / We solemnly declare that the facts stated herein as also in the enclosures are true to the best of my / our knowledge, information and belief.',
          { align: 'justify', lineGap: 1.5 },
        );
        doc.moveDown(1);

        const declY = doc.y;
        doc.font(regularFont).fontSize(8).text(`Dated this ${appDate} at Perundurai.`, 40, declY);
        doc.font(boldFont).fontSize(8.5).text(`For and on behalf of ${firmName}`, 360, declY);
        doc.font(regularFont).fontSize(8).text(managingPartner, 360, declY + 15);
        doc.text('(Managing Partner / Foreman)', 360, declY + 27);

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
