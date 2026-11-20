import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';

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
  isBlank?: boolean;
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
        StatutoryFormHelper.patchDocumentUnderline();

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
        const isBlank = Boolean(
          data.isBlank ||
          data.groupCode.startsWith('___') ||
          data.chitValue === 0n,
        );

        const appDate = isBlank ? '' : FontResolverHelper.formatPdfDate(data.applicationDate || new Date());
        const resDate = isBlank ? '' : FontResolverHelper.formatPdfDate(data.resolutionDate || new Date());
        const feeAmount = data.statutoryFeeAmount ?? 500n;
        const feeWords = isBlank ? '' : RupeeWordsHelper.toEnglishWords(feeAmount);
        const aggAmount = data.aggregateRunningChitsAmount ?? data.chitValue;
        const aggWords = isBlank ? '' : RupeeWordsHelper.toEnglishWords(aggAmount);
        const chitValueWords = isBlank ? '' : RupeeWordsHelper.toEnglishWords(data.chitValue);
        const managingPartner = isBlank ? '' : (data.managingPartnerName || 'P. Kumaran (Managing Partner)');
        const firmName = isBlank ? '' : 'KUMARAN FINANCE';
        const officeAddress = isBlank
          ? ''
          : (data.branchAddress || '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052');
        const commissionRateLabel = RupeeWordsHelper.formatCommissionRatePercent(
          data.foremanCommissionRate,
        );

        // ================= PAGE 1: FORM I APPLICATION =================
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(11).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10).text('APPENDIX — FORM I', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('(See Section 4(2) and Rule 3)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);
        doc.font(boldFont).fontSize(9.5).text(
          'FORM OF APPLICATION TO BE USED BY A FOREMAN FOR OBTAINING PREVIOUS SANCTION TO COMMENCE OR CONDUCT A CHIT',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(40, doc.y + 4).lineTo(555, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.8);

        // From / To layout matching Gazette Page 43
        const metaY = doc.y;
        doc.font(regularFont).fontSize(8.5).text('From', 40, metaY);

        doc.font(regularFont).fontSize(8.5).text('Place: ', 360, metaY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.font(regularFont).fontSize(8.5).text('Date: ', 360, metaY + 14, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : appDate, '____________________');

        doc.y = metaY + 30;
        doc.font(regularFont).fontSize(8.5).text('To', 40, doc.y);
        doc.text('The Secretary to the Govt.', 40, doc.y + 12);
        doc.text('of ', 40, doc.y + 24, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Tamil Nadu (Authorised Officer / Registrar of Chits, Erode)', '________________________________________');
        doc.font(regularFont).fontSize(7.5).text('(The Authorised officer by designation)', 40, doc.y + 6);

        doc.y = metaY + 80;
        doc.font(regularFont).fontSize(9).text('Sir,', 40, doc.y);
        doc.moveDown(0.4);

        // Para 1(a) & 1(b) verbatim from Gazette Page 43
        doc.font(regularFont).fontSize(8.5).text('1. (a) I ', 40, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '____________________', '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' Son / Wife / Daughter ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '____________________', '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (here state profession or occupation) residing at ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '____________________', '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' I / We, the Chairman and Secretary respectively* on behalf of (name of the firm, Company, Corporation, Coop-Society etc.) situated at having its registered office at ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${firmName}, ${officeAddress}`, '________________________________________________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' desire to commence and conduct a chit as foreman at ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : officeAddress, '________________________________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (here specify the place with postal address in detail). Full particulars in this regard are given in the Annexure hereto.');
        doc.moveDown(0.4);

        // Para 2
        doc.font(regularFont).fontSize(8.5).text('2. A certified true copy of the resolution passed by the Managing Committee / Board of Directors at its meeting held on the ', 40, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : resDate, '____________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' for commencing and conducting the chit in question is enclosed.');
        doc.moveDown(0.4);

        // Para 3
        doc.font(regularFont).fontSize(8.5).text('3. I / We remit herewith a sum of Rs ', 40, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(feeAmount), '__________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees in words) ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${feeWords} only`, '________________________________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ') being the fees prescribed for the purpose.');
        doc.moveDown(0.4);

        // Para 4
        doc.font(regularFont).fontSize(8.5).text('4. I / We hereby certify that the aggregate chit amount of the chits run by me / us is Rs ', 40, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(aggAmount), '__________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${aggWords} only`, '________________________________________', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ') on the date of this application and does not exceed the aggregate chit amount prescribed by Section 13 of the Chit Funds Act, 1982 (Central Act No. 40 of 1982).');
        doc.moveDown(0.4);

        // Para 5
        doc.font(regularFont).fontSize(8.5).text(
          '5. I / We request you to accord your sanction for commencing and conducting the Chit. On receipt of such sanction further steps for registration etc., of the chit will be taken.',
          40,
          doc.y,
          { align: 'justify', lineGap: 1.5 },
        );
        doc.moveDown(0.4);

        // Para 6
        doc.font(regularFont).fontSize(8.5).text(
          '6. We further undertake in register the chit within 12 months from the date of sanction by the State Government as per Section 4(1).',
          40,
          doc.y,
          { align: 'justify', lineGap: 1.5 },
        );
        doc.moveDown(0.4);

        doc.font(regularFont).fontSize(8.5).text(
          'We have read the provisions of the Chit Fund Act, 1982 (Central Chit Fund Act No. 40 of 1982) and the Rules framed thereunder and agree to abide by the same in the conduct of the chit business.',
          40,
          doc.y,
          { align: 'justify', lineGap: 1.5 },
        );
        doc.moveDown(0.8);

        // Signatures block matching Gazette Page 44
        const sigY = doc.y;
        doc.font(regularFont).fontSize(8.5).text('Yours faithfully,', 360, sigY);
        doc.text('Chairman : ', 360, sigY + 16, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________');
        doc.text('Secretary : ', 360, sigY + 32, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Partner / Authorised Signatory', '____________________');

        doc.text('Encl: Sheets', 40, sigY + 48);

        doc.text('for or on behalf of ', 360, sigY + 48, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '____________________');

        doc.y = sigY + 72;
        doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor('#888888').stroke();
        doc.moveDown(0.2);
        doc.font(regularFont).fontSize(7.5).text('Strike out or delete whatever is not applicable.', 40, doc.y);
        doc.text('* Insert the designation as may be appropriate to the applicant. @ Here enter the name of the applicant institution, if any.', 40, doc.y + 10);

        // ================= PAGE 2: ANNEXURE STATEMENT OF PARTICULARS =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(10.5).text('ANNEXURE — STATEMENT OF PARTICULARS', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8.5).text('(To be submitted with Form I application under Rule 3)', { align: 'center', width: pageWidth });
        doc.moveTo(40, doc.y + 4).lineTo(555, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.8);

        const particulars: Array<{ item: string; label: string; value: string }> = [
          {
            item: '1',
            label: 'Name and address of the company association of individuals / coop. Society, partnership / sole proprietorship (address of the registered as well as the Head Office / administrative office, if any, should be given):',
            value: isBlank ? '________________________________________________________' : `${firmName}\n${officeAddress}\nPhone: ${data.branchPhone || '+91 98765 43210'}`,
          },
          {
            item: '2',
            label: 'Constitution i.e., whether incorporated as company / co-op. Society or registered / un-registered association of individuals / partnership / sole proprietorship (also specify the provision of the Act under which incorporated / registered along with the date of incorporation / registration):',
            value: isBlank ? '________________________________________________________' : 'Partnership Firm registered under the Indian Partnership Act, 1932 (Firm Reg No: TN-ERD-PF-2018-042).',
          },
          {
            item: '3',
            label: 'Name and addresses of the branches / Offices if any:',
            value: isBlank ? '________________________________________________________' : `Single Head Office Branch: ${data.branchName || 'Head Office - Perundurai'}\nAddress: ${officeAddress}`,
          },
          {
            item: '4',
            label: 'Main objects of the institution (enclose a copy of the memorandum and Articles of Association or as the case may be of the Byelaws or rules regulating the activities of the institution):',
            value: isBlank ? '________________________________________________________' : 'To promote thrift, savings, and mutual financial assistance among subscribers through regulated chit fund operations under the Chit Funds Act, 1982.',
          },
          {
            item: '5',
            label: 'Names, occupations and residential address of the directors or as the case may be, of the promoters / members of the committee of management / partners etc.:',
            value: isBlank
              ? '________________________________________________________'
              : '1. P. Kumaran, Managing Partner, Business, Perundurai.\n' +
                '2. K. Senthil, Partner, Business, Perundurai.\n' +
                '3. A. Velusamy, Partner, Business, Perundurai.\n' +
                '4. R. Selvaraj, Partner, Business, Perundurai.',
          },
          {
            item: '6',
            label: 'Name and residential address of the Chief Executive Officer and two other officers immediately next to him, in the managerial setup:',
            value: isBlank
              ? '________________________________________________________'
              : '1. P. Kumaran, Managing Partner / CEO, Perundurai.\n' +
                '2. M. Rajendran, Branch Manager, Perundurai.\n' +
                '3. S. Priya, Desk Accountant, Perundurai.',
          },
          {
            item: '7',
            label: 'Names of the Bankers and their addresses:',
            value: isBlank ? '________________________________________________________' : 'Indian Overseas Bank, Perundurai Branch, Main Road, Perundurai, Erode - 638052.\nState Bank of India, Perundurai Branch, Perundurai - 638052.',
          },
          {
            item: '8',
            label: 'Names of the auditors and their addresses:',
            value: isBlank ? '________________________________________________________' : 'CA V. Natarajan, B.Com., FCA, Chartered Accountant, M.No: 028452, Erode - 638001.',
          },
          {
            item: '9',
            label: 'Particulars of the chit(s) to be started (such as the chit amounts, duration of the chit, frequency of the draws, manner of draws, etc, also attach a copy of the draft of the chit agreement to be entered into with the subscribers):',
            value: isBlank
              ? '________________________________________________________'
              : `• Scheme Code: ${data.groupCode} (${data.groupName})\n` +
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
            value: isBlank ? '________________________________________________________' : `${firmName}, ${officeAddress}.`,
          },
          {
            item: '11',
            label: 'Names and addresses of the associates companies / cooperative societies / associations of individuals / partnerships / sole proprietorships:',
            value: isBlank ? '________________________________________________________' : 'Nil. The firm has no associate companies, cooperative societies or subsidiaries.',
          },
          {
            item: '12',
            label: 'Names, occupations and residential addresses of the directors or as the case may be of the promoters / members of the committee of management etc of the institutions referred to in item 11:',
            value: isBlank ? '________________________________________________________' : 'Not Applicable (Nil associate entities).',
          },
        ];

        let curY = doc.y;
        for (const p of particulars) {
          if (curY > 710) {
            doc.addPage();
            curY = 40;
          }
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(8).text(`${p.item}. ${p.label}`, 40, curY, { width: pageWidth });
          const valFont = isBlank ? regularFont : boldFont;
          const valColor = isBlank ? StatutoryFormHelper.TEMPLATE_BLACK : StatutoryFormHelper.DATA_BLUE;
          doc.fillColor(valColor).font(valFont).fontSize(8).text(p.value, 55, doc.y + 2, { width: pageWidth - 15, lineGap: 1.5 });
          doc.moveDown(0.35);
          curY = doc.y;
        }

        // Solemn declaration matching Gazette Page 46
        doc.moveDown(0.4);
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(8).text(
          'I / We* solemnly declare that the facts stated herein as also in the enclosures are true in the best of my / our knowledge, information and belief.',
          40,
          doc.y,
          { align: 'justify', lineGap: 1.5 },
        );
        doc.moveDown(0.5);

        const declY = doc.y;
        doc.font(regularFont).fontSize(8).text('Dated this ', 40, declY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '15th', '_______', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' day of ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'January', '_______', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' 20', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '26', '26', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' at ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.moveDown(0.4);
        const sigRowY = doc.y;
        doc.font(regularFont).fontSize(8).text('Name (s) ', 40, sigRowY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________');

        doc.font(regularFont).fontSize(8).text('Signature (s) ', 360, sigRowY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '____________________', '____________________');

        doc.font(regularFont).fontSize(8).text('Designation (s) ', 40, sigRowY + 16, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Managing Partner / Foreman', '____________________');

        doc.font(regularFont).fontSize(8).text('For and behalf of ', 40, sigRowY + 32, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '________________________________________');

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
