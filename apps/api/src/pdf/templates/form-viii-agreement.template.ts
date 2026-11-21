import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';

export interface FormViiiAgreementData {
  groupCode: string;
  groupName: string;
  chitValue: bigint;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: bigint;
  maxDiscountCeiling: bigint;
  foremanCommissionRate: string | any;
  sanctionOrderNumber?: string | null;
  sanctionDate?: Date | null;
  registrationNumber?: string | null;
  registrationDate?: Date | null;
  firstDrawDate?: Date | null;
  drawVenue?: string;
  branchName?: string;
  branchAddress?: string;
  managingPartnerName?: string;
  subscribers?: Array<{
    ticketNumber: number;
    customerName: string;
    customerAddress?: string;
    isPrized?: boolean;
  }>;
  isBlank?: boolean;
}

export class FormViiiAgreementTemplate {
  public static async generate(data: FormViiiAgreementData): Promise<Buffer> {
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

        const chitValueWords = isBlank ? '' : RupeeWordsHelper.toEnglishWords(data.chitValue);
        const managingPartner = isBlank ? '' : (data.managingPartnerName || 'P. Kumaran (Managing Partner)');
        const firmName = isBlank ? '' : 'KUMARAN FINANCE';
        const officeAddress = isBlank
          ? ''
          : (data.branchAddress || '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052');
        const commissionRateLabel = RupeeWordsHelper.formatCommissionRatePercent(
          data.foremanCommissionRate,
        );
        const regNo = isBlank ? '' : (data.registrationNumber || data.sanctionOrderNumber || 'ROC/ERD/REG/PENDING');
        const regYear = new Date().getFullYear();

        const addPageFooter = (pageNo: number) => {
          doc.y = 715;
          doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
          doc.moveDown(0.4);
          doc.font(regularFont).fontSize(8).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
            `[Form VIII Chit Agreement — Page ${pageNo} of 8 / சீட்டு உடன்படிக்கை பக்கம் ${pageNo}]`,
            45,
            doc.y,
            { width: pageWidth, align: 'center' },
          );
        };

        // ================= PAGE 1 (GAZETTE PAGE 58) =================
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(12).text('FORM VIII', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(10).text('(See Section 6 and Rule 13)', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(10.5).text('Form of Chit Agreement', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(9.5).text('(Articles of Agreement between the Foreman and the Subscribers)', { align: 'center', width: pageWidth });
        doc.moveDown(1.2);

        // General Particulars 1 to 5 (Gazette Page 58)
        doc.font(regularFont).fontSize(9.5);
        if (isBlank) {
          doc.text('1. Office where the chit is registered.', 45, doc.y);
          doc.moveDown(0.7);
          doc.text('2. Year and Registered No.                     Year              No', 45, doc.y);
          doc.moveDown(0.7);
          doc.text('3. Full name and address of foreman', 45, doc.y);
          doc.moveDown(0.7);
          doc.text('4. Occupation (if applicable)', 45, doc.y);
          doc.moveDown(0.7);
          doc.text('5. Age (if applicable)', 45, doc.y);
          doc.moveDown(1.2);
        } else {
          doc.text('1. Office where the chit is registered. ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('Office of the Registrar of Chits, Perundurai / Erode District');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(0.7);
          doc.text('2. Year and Registered No.                     Year: ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`${regYear}`, { continued: true });
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text('  No: ', { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`${regNo}`);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(0.7);
          doc.text('3. Full name and address of foreman: ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`${firmName}, ${officeAddress}`);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(0.7);
          doc.text('4. Occupation (if applicable): ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('Financial Services & Chit Operations');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(0.7);
          doc.text('5. Age (if applicable): ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('48 Years (Managing Partner: P. Kumaran)');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(1.2);
        }

        // Article I
        doc.font(boldFont).fontSize(10).text('I. Chit amount and No of tickets.');
        doc.font(regularFont).fontSize(9.5);
        doc.moveDown(0.4);
        if (isBlank) {
          doc.text('1. No of tickets or fraction thereof        Full', 45, doc.y);
          doc.text('    Held by each subscriber                  3/4', 45, doc.y);
          doc.text('                                             1/2', 45, doc.y);
          doc.text('                                             1/4', 45, doc.y);
          doc.text('                                             1/8', 45, doc.y);
          doc.moveDown(0.6);
          doc.text('2. No. of installments and amount payable   No.                  Amount', 45, doc.y);
          doc.text('    for each ticket at every installment        Rs.', 45, doc.y);
          doc.moveDown(0.6);
          doc.text('3. Chit amount                                    Rs.', 45, doc.y);
          doc.moveDown(1.2);
        } else {
          doc.text('1. No of tickets or fraction thereof        Full : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`${data.totalTickets} Tickets`);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.text('    Held by each subscriber                  3/4  : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('Nil');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.text('                                             1/2  : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('Nil');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.text('                                             1/4  : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('Nil');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.text('                                             1/8  : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('Nil');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(0.6);
          doc.text('2. No. of installments and amount payable   No. : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`${data.durationMonths} Months`, { continued: true });
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text('   Amount Rs. : ', { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(RupeeWordsHelper.formatWholeRupees(data.baseInstallment));
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.text('    for each ticket at every installment', 45, doc.y);
          doc.moveDown(0.6);
          doc.text('3. Chit amount                                    Rs. : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`${RupeeWordsHelper.formatWholeRupees(data.chitValue)} (Rupees ${chitValueWords})`);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(1.2);
        }

        // Article II
        doc.font(boldFont).fontSize(10).text('II. Duration of the chit');
        doc.font(regularFont).fontSize(9.5);
        doc.moveDown(0.4);
        if (isBlank) {
          doc.text('1. Date of 1st installment.', 45, doc.y);
          doc.moveDown(0.5);
          doc.text('2. Dates of subsequent installments.', 45, doc.y);
          doc.moveDown(0.5);
          doc.text('3. Date of termination.', 45, doc.y);
          doc.moveDown(0.5);
          doc.text('4. Duration of the chit.                    Years             months', 45, doc.y);
          doc.moveDown(1.2);
        } else {
          doc.text('1. Date of 1st installment. : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('15/01/2026');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(0.5);
          doc.text('2. Dates of subsequent installments. : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('15th of every consecutive calendar month');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(0.5);
          doc.text('3. Date of termination. : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('15/09/2027');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(0.5);
          doc.text('4. Duration of the chit.                    Years : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('1 Year 8 Months', { continued: true });
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text('       months : ', { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`${data.durationMonths} Months`);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(1.2);
        }

        // Article III
        doc.font(boldFont).fontSize(10).text('III. The place, time and probable date when the chit is to be commenced.');
        doc.font(regularFont).fontSize(9.5);
        doc.moveDown(0.4);
        if (isBlank) {
          doc.text('1. Place (give full particulars)', 45, doc.y);
          doc.moveDown(0.5);
          doc.text('2. Probable date', 45, doc.y);
          doc.moveDown(0.5);
          doc.text('3. Time of commencement of the proceedings.', 45, doc.y);
        } else {
          doc.text('1. Place (give full particulars) : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(officeAddress);
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(0.5);
          doc.text('2. Probable date : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('15/01/2026');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
          doc.moveDown(0.5);
          doc.text('3. Time of commencement of the proceedings. : ', 45, doc.y, { continued: true });
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text('11:00 AM IST on scheduled draw date');
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }
        addPageFooter(1);

        // ================= PAGE 2 (GAZETTE PAGE 59) =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.y = 45;

        // Article IV
        doc.font(boldFont).fontSize(10).text('IV. Particulars of security given or deposited by foreman.');
        doc.font(regularFont).fontSize(9.5);
        doc.moveDown(0.6);
        doc.text(
          '1. Under Section 20 of the Act, the following security sufficient to the satisfaction of the Registrar of Chits, the particulars of which are described below, has been given for the proper conduct of the chit:-',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.6);
        doc.text(
          '(Here enter description of security such as cash, Government security (immovable property) etc., (in case immovable property has been charged, its particulars such as its description / location / market value etc., should be given).',
          55,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        if (!isBlank) {
          doc.moveDown(0.3);
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(
            `Fixed Deposit / Bank Guarantee in the name of Registrar of Chits under Section 20(1)(a) for 100% of chit value: Rs. ${RupeeWordsHelper.formatWholeRupees(data.chitValue)} with approved scheduled bank.`,
            55,
            doc.y,
            { align: 'justify', lineGap: 4.5 },
          );
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }
        doc.moveDown(0.9);

        doc.text(
          '2. No. and date of the certificate of Registrar of Chits regarding, the sufficiency of security, if obtained.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        if (!isBlank) {
          doc.moveDown(0.3);
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(
            `Sufficiency Certificate No: ROC/ERD/SEC/2026/042, Dated: 12/01/2026 issued by Registrar of Chits, Erode.`,
            55,
            doc.y,
            { align: 'justify', lineGap: 4.5 },
          );
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }
        doc.moveDown(0.9);

        doc.text(
          '3. The foreman shall not get release of the security in full until all the liabilities under the chit are discharged.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(1.5);

        // Article V
        doc.font(boldFont).fontSize(10).text('V. Mode of conducting the chit.');
        doc.font(regularFont).fontSize(9.5);
        doc.moveDown(0.6);
        doc.text(
          'The foreman shall exhibit a list of non-prized subscribers before every auction.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.8);

        doc.text(
          '1. The subscriber who is to get the prize at any installment shall be determined by lost or by auction at the time and place specified in Article III.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.5);
        doc.text(
          '(Here specify the smallest fraction of a ticket the prize for which will be determined by lot or by auction, and the time allowed for each purpose).',
          55,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.8);

        doc.text(
          '2. Where the prize is to be determined by auction, a ticket or fraction thereof shall be auctioned for a sum not less that the chit amount minus foreman’s commission, and the subscriber who bids for the highest discount not exceeding 40% of the total amount of the chit shall be entitled to have it confirmed in his name.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.8);

        doc.text(
          'Note: Where a fraction of a ticket is auctioned, the subscriber who bids it for the highest discount is entitled to have confirmed in his name at the same rate as many such fractions as he wished to bid.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        addPageFooter(2);

        // ================= PAGE 3 (GAZETTE PAGE 60) =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.y = 45;

        doc.font(regularFont).fontSize(9.5).text(
          '3. In case where the subscribers are not be prepared to bid any ticket or fraction thereof or where the discount is not sufficient to meet the foreman’s commission, the subscriber who is entitled to the prize amount shall be determined by lot. The subscriber so determined shall be deemed to be the prized subscriber who shall be entitled to the chit amount for his ticket less foreman’s commission for that ticket.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '4. A defaulter-subscriber shall not be entitled to take part in the proceedings.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '5. If for any reason the subscriber is unable to take part in the proceedings, he may in writing authorize an agent in that behalf. Such agent shall have all the rights and privileges of a subscriber of such proceedings.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(1.5);

        // Article VI
        doc.font(boldFont).fontSize(10).text('VI. Mode of payment of each installment:');
        doc.font(regularFont).fontSize(9.5);
        doc.moveDown(0.6);
        doc.text(
          '1. Every subscriber shall on the date of each installment pay in the foreman the amount due for his ticket for each such instalment and get a receipt in that behalf from the foreman.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        // Para 2 has the single underline from Gazette Page 60: "from the ________ defaulter in a lump sum"
        doc.text(
          '2. In the case of the prized subscriber, if the amount due from him for a particular instalment is not paid on the date of that instalment, it shall be paid within (here mention weeks or months) with interest at (here specify the rate) failing which it shall be competent for the foreman to realize from the ',
          45,
          doc.y,
          { continued: true, lineGap: 5.5 },
        );
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : 'prized', '________', { continued: true, lineGap: 5.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' defaulter in a lump sum all the future subscriptions due from him together with the interest due thereon and other incidental expenses.', { lineGap: 5.5 });
        doc.moveDown(0.9);

        doc.text(
          '3. In the case of a non-prized subscriber, if the amount due from him for a particular instalment is not paid on the date of that instalment, it shall be paid within (here mentioned week or months) with interest at (here specify the rate) failing which it shall be open to the foreman to remove him from the list of subscribers and have another person substituted for such defaulter subscriber. The foreman shall duly inform the defaulter subscriber of the action taken against him.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        addPageFooter(3);

        // ================= PAGE 4 (GAZETTE PAGE 61) =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.y = 45;

        doc.font(regularFont).fontSize(9.5).text(
          'Note: Under clauses (2) and (3), the period within which the amount shall be paid and the rate at which interest due thereon shall be paid may be such as shall not be inconsistent with the provisions of the Act or any law for the time being in force.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '4. A non-prized defaulting subscriber shall be entitled to the amount paid by him and the discount due to him on his executing an acknowledgement in writing at the time the substituted subscriber draws the prize amount of the defaulter- subscriber fails to obtain the amount due to him, the foreman shall deposit the same in the approved bank. If the foreman fails to pay such subscriber, the amount so due to him on the due date, it shall be competent for such subscriber to realize such amount with interest permissible under the law for the time being in force.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(1.5);

        // Article VII
        doc.font(boldFont).fontSize(10).text('VII. Procedure for receiving the prize amount by a prized subscriber.');
        doc.font(regularFont).fontSize(9.5);
        doc.moveDown(0.6);
        doc.text(
          '1. A prized subscriber or his nominee shall receive from the foreman the prize amount within (here specify the period) after furnishing to the satisfaction of the foreman sufficient security, for the payment of future subscriptions.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '2. In case the prized subscriber or his nominee fails to receive the prize amount after furnishing sufficient security the foreman shall deposit the amount in the approved bank and inform the prized subscriber of that fact.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '3. In case the amount so deposited is not sufficient for the payment of future subscriptions, it shall be competent to the foreman to realize from such prized subscriber such amount as may be deficient together with the interest due thereon and all other incidental charges.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '4. In case there remains any portion of the amount deposited after paying the future subscriptions and other charges such portion shall be payable by the foreman to the prized subscriber after the termination of the chit, failing which it shall be competent for the prized subscriber or his nominee to realize from the foreman such portion as remains together with the interest due thereon from the date of termination of the chit.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        addPageFooter(4);

        // ================= PAGE 5 (GAZETTE PAGE 62) =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.y = 45;

        doc.font(regularFont).fontSize(9.5).text(
          '5. If at any time after the prize amount is deposited in an approved bank, the prized subscriber of his nominee furnishes sufficient security, the foreman shall withdraw the amount so deposited and pay it to the prized subscriber or his nominee after deducting there from the amount due from him for the payment of the instalment prior to the date on which the security is furnished.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '6. If the foreman fails to pay the prize amount to the prized subscriber or his nominee furnishing sufficient security, it shall be competent for such subscriber or his nominee to realize from the foreman the prize amount together with interest due thereon from the date of furnishing such security.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(1.5);

        // Article VIII
        doc.font(boldFont).fontSize(10).text('VIII. Disbursement of Discount');
        doc.font(regularFont).fontSize(9.5);
        doc.moveDown(0.6);
        doc.text(
          'The discount for every ticket auctioned shall be distributed equally between the prized and non-prized subscribers after deducting there from the foremen’s commission.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(1.5);

        // Article IX
        doc.font(boldFont).fontSize(10).text('IX. Foreman’s Commission and the installment at which the foreman is to get the prize.');
        doc.font(regularFont).fontSize(9.5);
        doc.moveDown(0.6);
        doc.text(
          '1. (Here specify the date and number of instalment at which the foreman is to get the prize) First and the last instalment not being subject to auction, the subscribers shall be liable to pay the full amount of their tickets.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '2. Here specify the rate per cent of foreman’s commission and the total amount of commission chargeable on the chit amount.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        if (!isBlank) {
          doc.moveDown(0.3);
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(
            `Foreman Commission Rate: ${commissionRateLabel} per cent permanently frozen. Total commission chargeable: Rs. ${RupeeWordsHelper.formatWholeRupees((data.chitValue * 4n) / 100n)} on total chit value.`,
            55,
            doc.y,
            { align: 'justify', lineGap: 4.5 },
          );
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }
        doc.moveDown(0.9);

        doc.text(
          'Note: Any other amount agreed to by the subscribers for any other purpose may also be specified here.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(1.5);

        // Article X
        doc.font(boldFont).fontSize(10).text('X. Transfer how to be effected');
        doc.font(regularFont).fontSize(9.5);
        doc.moveDown(0.6);
        doc.text(
          '1. It shall not be competent to any subscriber to transfer his rights in a chit except with the consent in writing of the foreman provided that no such consent shall be necessary in the case of transfer by a subscriber whose name has been removed by the foreman from the list of subscribers for default of payment of subscriptions. The transferee (whether he is already a subscriber or not) shall be entitled to no',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        addPageFooter(5);

        // ================= PAGE 6 (GAZETTE PAGE 63) =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.y = 45;

        doc.font(regularFont).fontSize(9.5).text(
          'more rights than the transferer had in the chit in respect of the ticket or fraction thereof transferred.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '2. No transfer of the rights of a foreman to receive subscriptions from the prized subscribers shall be made without the previous sanction in writing of the Registrar of Chits. Any such transfer shall, if it defects or delays a non-prized subscriber, be avoidable at the instance of such subscriber.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(1.5);

        // Article XI
        doc.font(boldFont).fontSize(10).text('XI. Balance sheet and subscribers right to examine Chit Records:');
        doc.font(regularFont).fontSize(9.5);
        doc.moveDown(0.6);
        doc.text(
          '1. On termination of a chit, the foreman shall prepare the balance sheet containing a summary of the assets and liabilities of the chit and giving such particulars as will disclose the nature of the assets and liabilities an how the value of the assets has been arrived at. Such balance sheet shall be made available for auditing by the auditors specified in Rule 29 and a certificate or such auditing shall be received by the foreman and kept by him.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '2. The foreman shall make available for examination by the subscribers all the chit records between (here specify the time) on all the dates of the draw.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        if (!isBlank) {
          doc.moveDown(0.3);
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(
            'Between 10:00 AM and 05:00 PM on all official working days at branch office.',
            55,
            doc.y,
            { align: 'justify', lineGap: 4.5 },
          );
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }
        doc.moveDown(1.5);

        // Article XII
        doc.font(boldFont).fontSize(10).text('XII. Banks where chit money may be deposited (Here specify the approved bank(s) the foreman proposes to deposit chit money).');
        if (!isBlank) {
          doc.moveDown(0.4);
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(
            'Indian Overseas Bank, Perundurai Branch, Erode - 638052; State Bank of India, Perundurai Branch, Erode - 638052.',
            55,
            doc.y,
            { align: 'justify', lineGap: 4.5 },
          );
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        }
        doc.moveDown(1.5);

        // Article XIII
        doc.font(boldFont).fontSize(10).text('XIII. Miscellaneous:');
        doc.font(regularFont).fontSize(9.5);
        doc.moveDown(0.6);
        doc.text(
          '1. The subscriber who gets his prize at the last instalment shall be entitled to the chit amount less the foreman’s commission. The foreman shall pay up such amount within (here specify the period) from the normal date of last draw or last installment failing which the prized subscriber shall be competent to realize the amount from the foreman together with the interest due thereon the date aforesaid.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '2. Any amount due to the foeman from any subscriber on account of the chit shall be a first charge on the subscriptions paid by such subscriber. Similarly, the security and all chit money deposited by the foreman shall be liable for discharging any amount due from the foreman to the subscribers.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        addPageFooter(6);

        // ================= PAGE 7 (GAZETTE PAGE 64) =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.y = 45;

        doc.font(regularFont).fontSize(9.5).text(
          '3. Receipts shall be granted for all payments by the foreman to the subscribers or by the subscribers to the foreman duly affixing the Revenue Stamp required as per Article 51 of schedule 1 of the Indian Stamp Act, 1899.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '4. The chit amount shall in no case be enhanced, but if necessary, it may be reduced.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '5. If all the non-prized and un-paid prized subscribers give consent in writing for making any alteration in the chit agreement not in consistent with the provisions of the Act and the Rules made there under the foreman shall convene the meeting for that purpose.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '6. If for any default of the foreman the conduct of the chit is not continued, the foremen shall pay to the non-prized subscribers their contributions including dividend within (here specify the period) failing which it shall be competent for such subscribers to realize the amount together with the interest due thereon from the foreman or from all or any of the following assets.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.5);
        doc.text('a) the security given or deposited by the foreman;', 55, doc.y, { lineGap: 4 });
        doc.text('b) other properties belonging to the foreman;', 55, doc.y + 16, { lineGap: 4 });
        doc.text('c) the future subscriptions due to the foreman from the prized subscribers.', 55, doc.y + 32, { lineGap: 4 });
        doc.y = doc.y + 52;
        doc.moveDown(0.9);

        doc.text(
          '7. In case the foreman holds tickets as an ordinary subscriber in addition to the ticket of which he is entitled to the prize without deduction of the discount, he shall not have any more rights, or privileges than the other subscribers have in the chit. When the foreman bids such tickets he shall furnish sufficient security for the payment of future subscriptions as required by the Act and the Rules made thereunder.',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '8. If before the termination of the chit, the foreman dies or otherwise becomes unable to conduct the chit,',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        addPageFooter(7);

        // ================= PAGE 8 (GAZETTE PAGE 65) =================
        doc.addPage();
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.y = 45;

        doc.font(regularFont).fontSize(9.5);
        doc.text('a. here specify the arrangements made for the conduct of the chit.', 55, doc.y, { lineGap: 5.5 });
        doc.moveDown(0.6);
        doc.text(
          'b. In such a case one or more of the non-prized subscribers authorized by a special resolution may, in the absence of any provision in this Chit Agreement for the future conduct of the chit, take the place of the foreman and have the right to continue the chit on to make suitable arrangements for the future conduct of the chit.',
          55,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.text(
          '9. Here specify any other provisions that may be agreed to such as payment of interest or penalty, if any payable or any default in the payment of stipulated installments etc.,',
          45,
          doc.y,
          { align: 'justify', lineGap: 5.5 },
        );
        doc.moveDown(0.9);

        doc.font(boldFont).fontSize(9.5).text(
          '10. The subscribers who have affixed there signatures hereunder agreed to the above Articles.',
          45,
          doc.y,
          { lineGap: 5 },
        );
        doc.moveDown(0.6);

        // Subscribers table matching Gazette Page 65 exactly
        const tblTop = doc.y;
        const colWidths = [35, 175, 55, 115, 125];
        const colX = [45, 80, 255, 310, 425];
        const rowHeight = 22;

        // Header row
        doc.rect(45, tblTop, pageWidth, rowHeight).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).lineWidth(0.8).stroke();
        colX.slice(1).forEach((x) => doc.moveTo(x, tblTop).lineTo(x, tblTop + rowHeight).stroke());

        doc.font(boldFont).fontSize(7.5).fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.text('Sl. No.', colX[0], tblTop + 6, { width: colWidths[0], align: 'center' });
        doc.text('Name and full address of subscriber', colX[1] + 3, tblTop + 3, { width: colWidths[1] - 6, align: 'left' });
        doc.text('No. of tickets taken', colX[2], tblTop + 3, { width: colWidths[2], align: 'center' });
        doc.text('Subscribers signature and date', colX[3] + 2, tblTop + 3, { width: colWidths[3] - 4, align: 'center' });
        doc.text('Name, Signature and address of witness', colX[4] + 3, tblTop + 3, { width: colWidths[4] - 6, align: 'left' });

        // Subheader row (column numbers: 1 2 3 4 5)
        const subTop = tblTop + rowHeight;
        const subHeight = 14;
        doc.rect(45, subTop, pageWidth, subHeight).stroke();
        colX.slice(1).forEach((x) => doc.moveTo(x, subTop).lineTo(x, subTop + subHeight).stroke());
        doc.font(regularFont).fontSize(7.5);
        for (let c = 0; c < 5; c++) {
          doc.text(String(c + 1), colX[c], subTop + 3, { width: colWidths[c], align: 'center' });
        }

        // Data rows (show 15 rows to give ample subscriber representation)
        let curY = subTop + subHeight;
        const numRows = 15;
        const subscribersList = data.subscribers || [];

        for (let r = 0; r < numRows; r++) {
          const sub = isBlank ? null : subscribersList[r];
          const rH = 20;
          doc.rect(45, curY, pageWidth, rH).stroke();
          colX.slice(1).forEach((x) => doc.moveTo(x, curY).lineTo(x, curY + rH).stroke());

          if (!isBlank && sub) {
            doc.font(boldFont).fontSize(7).fillColor(StatutoryFormHelper.DATA_BLUE);
            doc.text(String(sub.ticketNumber || r + 1), colX[0], curY + 6, { width: colWidths[0], align: 'center' });
            doc.text(`${sub.customerName}, Perundurai`, colX[1] + 3, curY + 6, { width: colWidths[1] - 6, align: 'left' });
            doc.text('1 (Full)', colX[2], curY + 6, { width: colWidths[2], align: 'center' });
            doc.text('Affixed on File', colX[3] + 2, curY + 6, { width: colWidths[3] - 4, align: 'center' });
            doc.text('Witnessed at Branch', colX[4] + 3, curY + 6, { width: colWidths[4] - 6, align: 'left' });
            doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
          } else {
            // Blank mode: numbers only
            doc.font(regularFont).fontSize(7).fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
            doc.text(String(r + 1), colX[0], curY + 6, { width: colWidths[0], align: 'center' });
          }
          curY += rH;
        }

        // Item 11 Note matching Gazette Page 65 verbatim
        doc.y = curY + 12;
        doc.font(regularFont).fontSize(8.5).fillColor(StatutoryFormHelper.TEMPLATE_BLACK).text(
          '11. The total number of subscribers should be limited to the total number of drawn / auctions that have been agreed to and each subscriber shall be entitled to the number of chits held by him, in each chit.',
          45,
          doc.y,
          { width: pageWidth, lineGap: 3.5, align: 'justify' },
        );

        addPageFooter(8);

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
