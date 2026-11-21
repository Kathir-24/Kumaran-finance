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
          margins: { top: 40, bottom: 40, left: 45, right: 45 },
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

        // ================= PAGE 1: FORM I APPLICATION (GAZETTE PAGE 43) =================
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(11).text('APPENDIX –', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(11.5).text('FORM I', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(9.5).text('(See Section 4(2) and Rule 3)', { align: 'center', width: pageWidth });
        doc.moveDown(0.4);
        doc.font(boldFont).fontSize(10).text(
          'FORM OF APPLICATION TO BE USED BY A FOREMAN FOR OBTAINING\nPREVIOUS SANCTION TO COMMENCE OR CONDUCT A CHIT',
          { align: 'center', width: pageWidth, lineGap: 3 },
        );
        doc.moveTo(45, doc.y + 4).lineTo(550, doc.y + 4).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(1.0);

        // From / Place / Date
        const metaY = doc.y;
        doc.font(regularFont).fontSize(10).text('From', 45, metaY);

        doc.font(regularFont).fontSize(10).text('Place: ', 360, metaY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________');

        doc.font(regularFont).fontSize(10).text('Date: ', 360, metaY + 22, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : appDate, '____________________');

        doc.y = metaY + 48;
        doc.font(regularFont).fontSize(10).text('To', 45, doc.y);
        doc.moveDown(0.25);
        doc.text('The Secretary to the Govt.', 45);
        doc.moveDown(0.25);
        doc.text('of ', 45, doc.y, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Tamil Nadu (Authorised Officer / Registrar of Chits, Erode)', '________________________________________');
        doc.moveDown(0.3);
        doc.font(regularFont).fontSize(8.5).text('(The Authorised officer by designation)', 45);
        doc.moveDown(0.8);

        doc.font(regularFont).fontSize(10.5).text('Sir,', 45);
        doc.moveDown(0.7);

        // Para 1 matching Gazette Page 43
        doc.font(regularFont).fontSize(10).text('I ', 45, doc.y, { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'P. Kumaran', '____________________', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' Son / Wife / Daughter ', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'K. Periasamy', '____________________', { lineGap: 7.5 });
        doc.moveDown(0.3);

        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Business Executive', '____________________', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (here state profession or occupation) residing at ', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '__________', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' I / We, the Chairman and Secretary respectively* on behalf of (name of the firm, Company, Corporation, Coop-Society etc.) situated at having its registered office at', { lineGap: 7.5 });
        doc.moveDown(0.3);

        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${firmName}, ${officeAddress}`, '________________________________________________________', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' desire to commence and conduct a chit as foreman at ', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : officeAddress, '________________________________________', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (here specify the place with postal address in detail). Full particulars in this regard are given in the Annexure hereto.', { lineGap: 7.5 });
        doc.moveDown(1.2);

        // Para 2
        doc.font(regularFont).fontSize(10).text('2. A certified true copy of the resolution passed by the Managing Committee / Board of Directors at its meeting held on the ', 45, doc.y, { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : resDate, '____________________', { lineGap: 7.5 });
        doc.moveDown(0.3);
        StatutoryFormHelper.renderStatic(doc, regularFont, 'for commencing and conducting the chit in question is enclosed.', { lineGap: 7.5 });
        doc.moveDown(1.2);

        // Para 3
        doc.font(regularFont).fontSize(10).text('3. I / We remit herewith a sum of Rs ', 45, doc.y, { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(feeAmount), '__________', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees in words)', { lineGap: 7.5 });
        doc.moveDown(0.3);
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : feeWords, '________________________________________', { continued: true, lineGap: 7.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' only) being the fees prescribed for the purpose.', { lineGap: 7.5 });

        // Page 1 Footer / Continuation indicator
        doc.y = 715;
        doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.4);
        doc.font(regularFont).fontSize(8).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          '[Form I Continued on Page 2 / படிவம் 1 தொடர்ச்சி பக்கம் 2-ல்]',
          45,
          doc.y,
          { width: pageWidth, align: 'center' },
        );

        // ================= PAGE 2: FORM I APPLICATION CONTINUED (GAZETTE PAGE 44) =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);

        // Para 4
        doc.font(regularFont).fontSize(10).text('4. I / We hereby certify that the aggregate chit amount of the chits run by me / us is Rs ', 45, 50, { continued: true, lineGap: 7 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : RupeeWordsHelper.formatWholeRupees(aggAmount), '__________', { continued: true, lineGap: 7 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' (Rupees ', { continued: true, lineGap: 7 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : aggWords, '________________________________________', { continued: true, lineGap: 7 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' only) on the date of this application and does not exceed the aggregate chit amount prescribed by Section 13 of the Chit Funds Act, 1982 (Central Act No. 40 of 1982).', { lineGap: 7 });
        doc.moveDown(1.2);

        // Para 5
        doc.font(regularFont).fontSize(10).text(
          '5. I / We request you to accord your sanction for commencing and conducting the Chit. On receipt of such sanction further steps for registration etc., of the chit will be taken.',
          45,
          doc.y,
          { align: 'justify', lineGap: 7 },
        );
        doc.moveDown(1.2);

        // Para 6
        doc.font(regularFont).fontSize(10).text(
          '6. We further undertake in register the chit within 12 months from the date of sanction by the State Government as per Section 4(1).',
          45,
          doc.y,
          { align: 'justify', lineGap: 7 },
        );
        doc.moveDown(1.5);

        doc.font(regularFont).fontSize(10).text(
          'We have read the provisions of the Chit Fund Act, 1982 (Central Chit Fund Act No. 40 of 1982) and the Rules framed thereunder and agree to abide by the same in the conduct of the chit business.',
          45,
          doc.y,
          { align: 'justify', lineGap: 7 },
        );
        doc.moveDown(2.5);

        // Signatures block matching Gazette Page 44
        const sigY = doc.y;
        doc.font(regularFont).fontSize(10).text('Yours faithfully,', 360, sigY);
        doc.text('Chairman : ', 360, sigY + 30, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________');
        doc.text('Secretary : ', 360, sigY + 60, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Partner / Authorised Signatory', '____________________');

        doc.text('Encl: Sheets', 45, sigY + 90);

        doc.text('for or on behalf of ', 360, sigY + 90, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '____________________');

        // Footnote matching Gazette Page 44 verbatim
        doc.y = 695;
        doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.5);
        doc.font(regularFont).fontSize(8).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          '----------------------------------------------------------------------------------------------------------------\n' +
          'Strike out or delete whatever is not applicable.\n* Insert the designation as may be appropriate to the applicant. @ Here enter the name of the applicant institution, if any.',
          45,
          doc.y,
          { width: pageWidth, lineGap: 3 },
        );

        // ================= PAGE 3: ANNEXURE STATEMENT OF PARTICULARS - PART 1 (GAZETTE PAGE 45) =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(11).text('ANNEXURE', { align: 'center', width: pageWidth });
        doc.moveDown(0.2);
        doc.font(boldFont).fontSize(10.5).text('STATEMENT OF PARTICULARS', { align: 'center', width: pageWidth });
        doc.moveDown(1.5);

        // Two-column layout matching Gazette Page 45 (Items 1 to 7 on left, particulars on right)
        const col1Width = 225;
        const col2X = 285;
        const col2Width = 265;

        // Gazette Page 45 Items 1 to 7 (NO underlines in Gazette blank form!)
        const annexurePart1: Array<{ item: string; label: string; value: string }> = [
          {
            item: '1',
            label: 'Name and address of the company association of individuals / coop. Society, partnership / sole proprietorship (address of the registered as well as the Head Office / administrative office, if any, should be given).',
            value: `${firmName}, ${officeAddress} (Phone: ${data.branchPhone || '+91 98765 43210'})`,
          },
          {
            item: '2',
            label: 'Constitution i.e., whether incorporated as company / co-op. Society or registered / un-registered association of individuals / partnership / sole proprietorship (also specify the provision of the Act under which incorporated / registered along with the date of incorporation / registration.',
            value: 'Partnership Firm registered under the Indian Partnership Act, 1932 (Firm Reg No: TN-ERD-PF-2018-042).',
          },
          {
            item: '3',
            label: 'Name and addresses of the branches / Offices if any.',
            value: `Single Head Office Branch: ${data.branchName || 'Head Office - Perundurai'}, ${officeAddress}.`,
          },
          {
            item: '4',
            label: 'Main objects of the institution (enclose a copy of the memorandum and Articles of Association or as the case may be of the Byelaws or rules regulating the activities of the institution).',
            value: 'To promote thrift, savings, and mutual financial assistance among subscribers through regulated chit fund operations under the Chit Funds Act, 1982.',
          },
          {
            item: '5',
            label: 'Names, occupations and residential address of the directors or as the case may be, of the promoters / members of the committee of management / partners etc.',
            value: '1. P. Kumaran, Managing Partner, Business, Perundurai.\n2. K. Senthil, Partner, Business, Perundurai.\n3. A. Velusamy, Partner, Business, Perundurai.\n4. R. Selvaraj, Partner, Business, Perundurai.',
          },
          {
            item: '6',
            label: 'Name and residential address of the Chief Executive Officer and two other officers immediately next to him, in the managerial setup.',
            value: '1. P. Kumaran, Managing Partner / CEO, Perundurai.\n2. M. Rajendran, Branch Manager, Perundurai.\n3. S. Priya, Desk Accountant, Perundurai.',
          },
          {
            item: '7',
            label: 'Names of the Bankers and their addresses.',
            value: 'Indian Overseas Bank, Perundurai Branch, Erode - 638052; State Bank of India, Perundurai Branch, Perundurai - 638052.',
          },
        ];

        for (const p of annexurePart1) {
          const itemStartY = doc.y;
          // Left Column: Item number and description
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK)
            .font(regularFont)
            .fontSize(9)
            .text(`${p.item}. ${p.label}`, 45, itemStartY, { width: col1Width, lineGap: 3.5 });
          const col1EndY = doc.y;

          if (!isBlank) {
            // Right Column: Entered data / particulars in bold blue
            doc.fillColor(StatutoryFormHelper.DATA_BLUE)
              .font(boldFont)
              .fontSize(8.5)
              .text(p.value, col2X, itemStartY, { width: col2Width, lineGap: 2.5 });
            const col2EndY = doc.y;
            doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
            doc.y = Math.max(col1EndY, col2EndY) + 32;
          } else {
            // In blank mode, space out items down the page matching Gazette distribution
            doc.y = col1EndY + 32;
          }
        }

        // ================= PAGE 4: ANNEXURE STATEMENT OF PARTICULARS - PART 2 (GAZETTE PAGE 46) =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);

        // Gazette Page 46 Items 8 to 12 (NO underlines in Gazette blank form!)
        const annexurePart2: Array<{ item: string; label: string; value: string }> = [
          {
            item: '8',
            label: 'Names of the auditors and their addresses.',
            value: 'CA V. Natarajan, B.Com., FCA, Chartered Accountant, M.No: 028452, Erode - 638001.',
          },
          {
            item: '9',
            label: 'Particulars of the chit(s) to be started (such as the chit amounts, duration of the chit, frequency of the draws, manner of draws, etc, also attach a copy of the draft of the chit agreement to be entered into with the subscribers).',
            value: `• Scheme Code: ${data.groupCode} (${data.groupName}) | Chit Amount: Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)} (${chitValueWords})\n` +
              `• Duration: ${data.durationMonths} Months | Total Tickets: ${data.totalTickets} | Base Installment: Rs. ${RupeeWordsHelper.formatWholeRupees(data.baseInstallment)} per month\n` +
              `• Maximum Discount: Rs. ${RupeeWordsHelper.formatWholeRupees(data.maxDiscountCeiling)} (One-fourth of total chit value) | Foreman Commission: ${commissionRateLabel} per cent\n` +
              `• Frequency & Manner of Draws: Monthly draw by reverse auction among eligible subscribers.`,
          },
          {
            item: '10',
            label: 'Places where the chit scheme(s) are proposed to be conducted.',
            value: `${firmName}, ${officeAddress}.`,
          },
          {
            item: '11',
            label: 'Names and addresses of the associates companies / cooperative societies / associations of individuals / partnerships / sole proprietorships.',
            value: 'Nil. The firm has no associate companies, cooperative societies or subsidiaries.',
          },
          {
            item: '12',
            label: 'Names, occupations and residential addresses of the directors or as the case may be of the promoters / members of the committee of management etc of the institutions referred to in item 11',
            value: 'Not Applicable (Nil associate entities).',
          },
        ];

        doc.y = 50;
        for (const p of annexurePart2) {
          const itemStartY = doc.y;
          // Left Column: Item number and description
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK)
            .font(regularFont)
            .fontSize(9)
            .text(`${p.item}. ${p.label}`, 45, itemStartY, { width: col1Width, lineGap: 3.5 });
          const col1EndY = doc.y;

          if (!isBlank) {
            // Right Column: Entered data / particulars in bold blue
            doc.fillColor(StatutoryFormHelper.DATA_BLUE)
              .font(boldFont)
              .fontSize(8.5)
              .text(p.value, col2X, itemStartY, { width: col2Width, lineGap: 2.5 });
            const col2EndY = doc.y;
            doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
            doc.y = Math.max(col1EndY, col2EndY) + 10;
          } else {
            // In blank mode, space out items down the page
            doc.y = col1EndY + 14;
          }
        }

        // Solemn declaration matching Gazette Page 46
        doc.moveDown(0.8);
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(9.5).text(
          'I / We* solemnly declare that the facts stated herein as also in the enclosures are true in the best of my / our knowledge, information and belief.',
          45,
          doc.y,
          { align: 'justify', lineGap: 4 },
        );
        doc.moveDown(1.0);

        // Date line matching Gazette Page 46 (HAS underlines in Gazette!)
        const declY = doc.y;
        doc.font(regularFont).fontSize(9.5).text('Dated this ', 45, declY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '15th', '_______', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' day of ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'January', '_______', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' 20', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '26', isBlank ? '____' : '26', { continued: true });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' at ', { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Perundurai', '____________________.');

        doc.moveDown(1.2);
        const sigRowY = doc.y;
        doc.font(regularFont).fontSize(9.5).text('Name (s) ', 45, sigRowY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : managingPartner, '____________________');

        doc.font(regularFont).fontSize(9.5).text('Signature (s) ', 360, sigRowY, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : '____________________', '____________________');

        doc.font(regularFont).fontSize(9.5).text('Designation (s) ', 45, sigRowY + 22, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'Managing Partner / Foreman', '____________________');

        doc.font(regularFont).fontSize(9.5).text('For and behalf of ', 45, sigRowY + 44, { continued: true });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : firmName, '________________________________________');

        // Official Gazette Footnotes matching Gazette Page 46 verbatim
        doc.y = 690;
        doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.5);
        doc.font(regularFont).fontSize(8).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          '* Here enter the name of the applicant institution, if any, strike out whatever is not applicable.\n' +
          'Note : (1) If the space against any items is inadequate for furnishing full particulars, the required information should be given in separate sheets indicating the cross reference against the relative item of this statement.\n' +
          '(2) A copy each of the latest available audited balance sheet and profit and loss account if any, should be attached.',
          45,
          doc.y,
          { width: pageWidth, lineGap: 2.8 },
        );

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
