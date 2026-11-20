import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormISanctionData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  maxDiscountCeiling: bigint;
  foremanCommissionRate: string | any;
  branchName?: string;
  branchAddress?: string;
  branchPhone?: string;
  managingPartnerName?: string;
  resolutionDate?: Date | null;
  applicationDate?: Date | null;
  statutoryFeeAmount?: bigint;
  aggregateRunningChitsAmount?: bigint;
  runningChitsCount?: number;
  isBlank?: boolean;
}

export class FormISanctionTemplate {
  public static async generate(data: FormISanctionData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let isSettled = false;
      const safeResolve = (val: Buffer) => {
        if (!isSettled) {
          isSettled = true;
          resolve(val);
        }
      };
      const safeReject = (err: any) => {
        if (!isSettled) {
          isSettled = true;
          reject(err);
        }
      };

      try {
        StatutoryFormHelper.patchDocumentUnderline();

        // Standard A4 portrait (595.28 x 841.89 pt)
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 32, bottom: 32, left: 40, right: 40 },
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
        doc.font(boldFont).fontSize(11.5).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(11).text('APPENDIX — FORM I', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(9).text('(See Section 4(2) and Rule 3)', { align: 'center', width: pageWidth });
        doc.moveDown(0.3);
        doc.font(boldFont).fontSize(10).text(
          'FORM OF APPLICATION TO BE USED BY A FOREMAN FOR OBTAINING PREVIOUS SANCTION TO COMMENCE OR CONDUCT A CHIT',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(40, doc.y + 4).lineTo(555, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.7);

        // From / To layout matching Gazette Page 43
        const metaY = doc.y;
        doc.font(regularFont).fontSize(9).text('From', 40, metaY);

        doc.font(regularFont).fontSize(9).text('Place: ', 360, metaY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.font(regularFont).fontSize(9).text('Date: ', 360, metaY + 18, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : appDate, '____________________');

        doc.y = metaY + 38;
        doc.font(regularFont).fontSize(9).text('To', 40, doc.y);
        doc.moveDown(0.15);
        doc.text('The Secretary to the Govt.', 40);
        doc.moveDown(0.15);
        doc.text('of ', 40, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Tamil Nadu (Authorised Officer / Registrar of Chits, Erode)', '________________________________________');
        doc.moveDown(0.2);
        doc.font(regularFont).fontSize(7.5).text('(The Authorised officer by designation)', 40);
        doc.moveDown(0.5);

        doc.font(regularFont).fontSize(9.5).text('Sir,', 40);
        doc.moveDown(0.4);

        // Para 1(a) & 1(b) verbatim from Gazette Page 43
        doc.font(regularFont).fontSize(9.5).text('1. (a) I ', 40, doc.y, { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '____________________', '____________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' Son / Wife / Daughter ', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '____________________', '____________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (here state profession or occupation) residing at ', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '____________________', '____________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' I / We, the Chairman and Secretary respectively* on behalf of (name of the firm, Company, Corporation, Coop-Society etc.) situated at having its registered office at ', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${firmName}, ${officeAddress}`, '________________________________________________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' desire to commence and conduct a chit as foreman at ', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : officeAddress, '________________________________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (here specify the place with postal address in detail). Full particulars in this regard are given in the Annexure hereto.', { lineGap: 5.5 });
        doc.moveDown(0.6);

        // Para 2
        doc.font(regularFont).fontSize(9.5).text('2. A certified true copy of the resolution passed by the Managing Committee / Board of Directors at its meeting held on the ', 40, doc.y, { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : resDate, '____________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' for commencing and conducting the chit in question is enclosed.', { lineGap: 5.5 });
        doc.moveDown(0.6);

        // Para 3
        doc.font(regularFont).fontSize(9.5).text('3. I / We remit herewith a sum of Rs ', 40, doc.y, { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(feeAmount), '__________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees in words) ', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${feeWords} only`, '________________________________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ') being the fees prescribed for the purpose.', { lineGap: 5.5 });
        doc.moveDown(0.6);

        // Para 4
        doc.font(regularFont).fontSize(9.5).text('4. I / We hereby certify that the aggregate chit amount of the chits run by me / us is Rs ', 40, doc.y, { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(aggAmount), '__________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees ', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${aggWords} only`, '________________________________________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ') on the date of this application and does not exceed the aggregate chit amount prescribed by Section 13 of the Chit Funds Act, 1982 (Central Act No. 40 of 1982).', { lineGap: 5.5 });
        doc.moveDown(0.6);

        // Para 5
        doc.font(regularFont).fontSize(9.5).text(
          '5. I / We request you to accord your sanction for commencing and conducting the Chit. On receipt of such sanction further steps for registration etc., of the chit will be taken.',
          40,
          doc.y,
          { align: 'justify', lineGap: 5 },
        );
        doc.moveDown(0.5);

        // Para 6
        doc.font(regularFont).fontSize(9.5).text(
          '6. We further undertake in register the chit within 12 months from the date of sanction by the State Government as per Section 4(1).',
          40,
          doc.y,
          { align: 'justify', lineGap: 5 },
        );
        doc.moveDown(0.5);

        doc.font(regularFont).fontSize(9.5).text(
          'We have read the provisions of the Chit Fund Act, 1982 (Central Chit Fund Act No. 40 of 1982) and the Rules framed thereunder and agree to abide by the same in the conduct of the chit business.',
          40,
          doc.y,
          { align: 'justify', lineGap: 5 },
        );
        doc.moveDown(0.8);

        // Signatures block matching Gazette Page 44
        const sigY = doc.y;
        doc.font(regularFont).fontSize(9.5).text('Yours faithfully,', 360, sigY);
        doc.text('Chairman : ', 360, sigY + 20, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________');
        doc.text('Secretary : ', 360, sigY + 40, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Partner / Authorised Signatory', '____________________');

        doc.text('Encl: Sheets', 40, sigY + 60);

        doc.text('for or on behalf of ', 360, sigY + 60, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '____________________');

        // Footnote matching Gazette Page 44 verbatim
        doc.y = sigY + 84;
        doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.4);
        doc.font(regularFont).fontSize(7.5).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          'Strike out or delete whatever is not applicable.\n* Insert the designation as may be appropriate to the applicant. @ Here enter the name of the applicant institution, if any.',
          40,
          doc.y,
          { width: pageWidth, lineGap: 2.2 },
        );

        // ================= PAGE 2: ANNEXURE STATEMENT OF PARTICULARS =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(11).text('ANNEXURE — STATEMENT OF PARTICULARS', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(9).text('(To be submitted with Form I application under Rule 3)', { align: 'center', width: pageWidth });
        doc.moveTo(40, doc.y + 4).lineTo(555, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.5);

        const fullLine = '____________________________________________________________________________________________________';
        const particulars: Array<{ item: string; label: string; value: string }> = [
          {
            item: '1',
            label: 'Name and address of the company association of individuals / coop. Society, partnership / sole proprietorship (address of the registered as well as the Head Office / administrative office, if any, should be given):',
            value: isBlank
              ? `${fullLine}\n${fullLine}`
              : `${firmName}, ${officeAddress} (Phone: ${data.branchPhone || '+91 98765 43210'})`,
          },
          {
            item: '2',
            label: 'Constitution i.e., whether incorporated as company / co-op. Society or registered / un-registered association of individuals / partnership / sole proprietorship (also specify the provision of the Act under which incorporated / registered along with the date of incorporation / registration):',
            value: isBlank
              ? `${fullLine}`
              : 'Partnership Firm registered under the Indian Partnership Act, 1932 (Firm Reg No: TN-ERD-PF-2018-042).',
          },
          {
            item: '3',
            label: 'Name and addresses of the branches / Offices if any:',
            value: isBlank
              ? `${fullLine}`
              : `Single Head Office Branch: ${data.branchName || 'Head Office - Perundurai'}, ${officeAddress}.`,
          },
          {
            item: '4',
            label: 'Main objects of the institution (enclose a copy of the memorandum and Articles of Association or as the case may be of the Byelaws or rules regulating the activities of the institution):',
            value: isBlank
              ? `${fullLine}`
              : 'To promote thrift, savings, and mutual financial assistance among subscribers through regulated chit fund operations under the Chit Funds Act, 1982.',
          },
          {
            item: '5',
            label: 'Names, occupations and residential address of the directors or as the case may be, of the promoters / members of the committee of management / partners etc.:',
            value: isBlank
              ? `1. ${fullLine}\n2. ${fullLine}\n3. ${fullLine}\n4. ${fullLine}`
              : '1. P. Kumaran, Managing Partner, Business, Perundurai.   2. K. Senthil, Partner, Business, Perundurai.\n3. A. Velusamy, Partner, Business, Perundurai.   4. R. Selvaraj, Partner, Business, Perundurai.',
          },
          {
            item: '6',
            label: 'Name and residential address of the Chief Executive Officer and two other officers immediately next to him, in the managerial setup:',
            value: isBlank
              ? `1. ${fullLine}\n2. ${fullLine}\n3. ${fullLine}`
              : '1. P. Kumaran, Managing Partner / CEO, Perundurai.   2. M. Rajendran, Branch Manager, Perundurai.   3. S. Priya, Desk Accountant, Perundurai.',
          },
          {
            item: '7',
            label: 'Names of the Bankers and their addresses:',
            value: isBlank
              ? `${fullLine}`
              : 'Indian Overseas Bank, Perundurai Branch, Erode - 638052; State Bank of India, Perundurai Branch, Perundurai - 638052.',
          },
          {
            item: '8',
            label: 'Names of the auditors and their addresses:',
            value: isBlank
              ? `${fullLine}`
              : 'CA V. Natarajan, B.Com., FCA, Chartered Accountant, M.No: 028452, Erode - 638001.',
          },
          {
            item: '9',
            label: 'Particulars of the chit(s) to be started (such as the chit amounts, duration of the chit, frequency of the draws, manner of draws, etc, also attach a copy of the draft of the chit agreement to be entered into with the subscribers):',
            value: isBlank
              ? `• Scheme Code: ____________________ | Chit Amount: Rs. ____________________ | Duration: _____ Months | Tickets: _____\n• Monthly Installment: Rs. __________ | Max Discount: Rs. __________ (25% Ceiling) | Commission: ____ %\n• Frequency & Manner of Draws: Monthly draw by reverse auction among eligible subscribers.`
              : `• Scheme Code: ${data.groupCode} (${data.groupName}) | Chit Amount: Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)} (${chitValueWords})\n` +
                `• Duration: ${data.durationMonths} Months | Total Tickets: ${data.totalTickets} | Base Installment: Rs. ${RupeeWordsHelper.formatWholeRupees(data.baseInstallment)} per month\n` +
                `• Maximum Discount: Rs. ${RupeeWordsHelper.formatWholeRupees(data.maxDiscountCeiling)} (One-fourth of total chit value) | Foreman Commission: ${commissionRateLabel} per cent\n` +
                `• Frequency & Manner of Draws: Monthly draw by reverse auction among eligible subscribers.`,
          },
          {
            item: '10',
            label: 'Places where the chit scheme(s) are proposed to be conducted:',
            value: isBlank
              ? `${fullLine}`
              : `${firmName}, ${officeAddress}.`,
          },
          {
            item: '11',
            label: 'Names and addresses of the associates companies / cooperative societies / associations of individuals / partnerships / sole proprietorships:',
            value: isBlank
              ? `${fullLine}`
              : 'Nil. The firm has no associate companies, cooperative societies or subsidiaries.',
          },
          {
            item: '12',
            label: 'Names, occupations and residential addresses of the directors or as the case may be of the promoters / members of the committee of management etc of the institutions referred to in item 11:',
            value: isBlank
              ? `${fullLine}`
              : 'Not Applicable (Nil associate entities).',
          },
        ];

        let curY = doc.y;
        for (const p of particulars) {
          if (curY > 740) {
            doc.addPage();
            curY = 32;
          }
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).fontSize(8).text(`${p.item}. ${p.label}`, 40, curY, { width: pageWidth });
          const valFont = isBlank ? regularFont : boldFont;
          const valColor = isBlank ? StatutoryFormHelper.TEMPLATE_BLACK : StatutoryFormHelper.DATA_BLUE;
          doc.fillColor(valColor).font(valFont).fontSize(8).text(p.value, 55, doc.y + 2, { width: pageWidth - 15, lineGap: 2 });
          doc.moveDown(0.4);
          curY = doc.y;
        }

        // Solemn declaration matching Gazette Page 46
        doc.moveDown(0.4);
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(8.5).text(
          'I / We* solemnly declare that the facts stated herein as also in the enclosures are true in the best of my / our knowledge, information and belief.',
          40,
          doc.y,
          { align: 'justify', lineGap: 2 },
        );
        doc.moveDown(0.5);

        const declY = doc.y;
        doc.font(regularFont).fontSize(8.5).text('Dated this ', 40, declY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '15th', '_______', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' day of ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'January', '_______', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' 20', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '26', isBlank ? '____' : '26', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' at ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.moveDown(0.6);
        const sigRowY = doc.y;
        doc.font(regularFont).fontSize(8.5).text('Name (s) ', 40, sigRowY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________');

        doc.font(regularFont).fontSize(8.5).text('Signature (s) ', 360, sigRowY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '____________________', '____________________');

        doc.font(regularFont).fontSize(8.5).text('Designation (s) ', 40, sigRowY + 18, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Managing Partner / Foreman', '____________________');

        doc.font(regularFont).fontSize(8.5).text('For and behalf of ', 40, sigRowY + 36, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '________________________________________');

        // Official Gazette Footnotes matching Gazette Page 46
        doc.y = sigRowY + 58;
        doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.4);
        doc.font(regularFont).fontSize(7.5).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          '* Here enter the name of the applicant institution, if any, strike out whatever is not applicable.\n' +
          'Note : (1) If the space against any items is inadequate for furnishing full particulars, the required information should be given in separate sheets indicating the cross reference against the relative item of this statement.\n' +
          '(2) A copy each of the latest available audited balance sheet and profit and loss account if any, should be attached.',
          40,
          doc.y,
          { width: pageWidth, lineGap: 2 },
        );

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
