import PDFDocument from 'pdfkit';
import { FontResolverHelper } from '../helpers/font-resolver.helper';
import { RupeeWordsHelper } from '../helpers/rupee-words.helper';
import { StatutoryFormHelper } from '../helpers/statutory-form.helper';

export interface PayoutVoucherPdfData {
  voucherNumber: string;
  disbursedAt: Date;
  groupCode: string;
  chitValue: bigint;
  installmentMonth: number;
  auctionDate: Date;
  ticketNumber: number;
  winnerCode: string;
  winnerName: string;
  winnerNameTamil?: string | null;
  phone: string;
  bidDiscount: bigint;
  /** Gross prize money before arrears offset (V - D or Month N V - C_f). */
  grossPrizeMoney?: bigint;
  /** Total overdue arrears & final-month installment offset deducted from gross prize (FIN-A / FIN-B). */
  arrearsDeducted?: bigint;
  /** Frozen foreman commission rate from Auction/ChitGroup (ADR-04, Guardrail 3). */
  foremanCommissionRate?: string | number | { toString(): string } | null;
  /** Frozen foreman commission whole-rupee amount retained by company. */
  foremanCommissionAmount?: bigint;
  netPrizeMoney: bigint;
  disbursementMode: string;
  paymentReference: string;
  agreementSigned: boolean;
  nomineeSigned: boolean;
  isSecurityRequired: boolean;
  securityType?: string | null;
  blankChequeDetails?: string | null;
  verifiedByUserName: string;
  authorizedByUserName: string;
  branchName?: string | null;
  branchAddress?: string | null;
  isBlank?: boolean;
}

export class PayoutVoucherTemplate {
  private static formatSecuritySummary(data: PayoutVoucherPdfData): string {
    if (data.blankChequeDetails) {
      return `காசோலை / Cheques (${data.blankChequeDetails})`;
    }
    if (data.isSecurityRequired && data.securityType) {
      const normalized = data.securityType.trim().toUpperCase();
      const map: Record<string, string> = {
        BLANK_CHEQUE: 'கையொப்பமிட்ட வெற்று காசோலை / Blank Cheque',
        PROMISSORY_NOTE: 'கடன் உறுதிப்பத்திரம் / Promissory Note',
        SIGNED_AGREEMENT: 'கையொப்பமிட்ட ஒப்பந்தம் / Signed Agreement',
        PERSONAL_GUARANTEE: 'தனிப்பட்ட உத்தரவாதம் / Personal Guarantee',
        OTHER: 'நிறுவன பாதுகாப்பு சான்று / Company Safety Proof',
      };
      return map[normalized] || 'நிறுவன பாதுகாப்பு சான்று / Company Safety Proof';
    }
    return data.isSecurityRequired
      ? 'சரிபார்க்கப்பட்டது / Verified'
      : 'தேவையில்லை / N/A';
  }

  static async generate(data: PayoutVoucherPdfData): Promise<Buffer> {
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

        // Standard A5 landscape (595.28 x 419.53 pt)
        const doc = new PDFDocument({
          size: 'A5',
          layout: 'landscape',
          margins: { top: 20, bottom: 20, left: 25, right: 25 },
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

        const pageWidth = 595.28 - 50; // 545.28 pt printable
        const grossPrizeMoney = data.grossPrizeMoney ?? (data.chitValue - data.bidDiscount);
        const arrearsDeducted =
          data.arrearsDeducted !== undefined
            ? data.arrearsDeducted
            : grossPrizeMoney > data.netPrizeMoney
              ? grossPrizeMoney - data.netPrizeMoney
              : 0n;
        const hasArrearsOffset = arrearsDeducted > 0n;
        const hasCommission =
          data.foremanCommissionAmount !== undefined && data.foremanCommissionAmount > 0n;
        const commissionRateLabel = RupeeWordsHelper.formatCommissionRatePercent(
          data.foremanCommissionRate,
        );
        const isBlank = Boolean(data.isBlank);

        // Company Header
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        doc.font(boldFont).fontSize(14).text('KUMARAN FINANCE / குமரன் பைனான்ஸ்', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(9).text(
          data.branchAddress || 'Head Office: Perundurai, Erode / தலைமை கிளை: பெருந்துறை, ஈரோடு',
          { align: 'center', width: pageWidth },
        );
        doc.moveDown(0.2);

        doc.font(boldFont).fontSize(9.5).text('TAMIL NADU CHIT FUNDS RULES, 1984', { align: 'center', width: pageWidth });
        doc.font(boldFont).fontSize(11).text('பரிசு தொகை பட்டுவாடா வவுச்சர் / PRIZE DISBURSEMENT VOUCHER', { align: 'center', width: pageWidth });
        doc.font(regularFont).fontSize(8).text(
          '(Under Section 23, Rule 25(7) & Rule 27 of Tamil Nadu Chit Funds Rules, 1984)',
          { align: 'center', width: pageWidth },
        );
        doc.moveTo(25, doc.y + 3).lineTo(570, doc.y + 3).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.5);

        // Metadata Row
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(9);
        const voucherDate = FontResolverHelper.formatPdfDate(data.disbursedAt);
        doc.text('வவுச்சர் எண் / Voucher No: ', 25, doc.y, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.voucherNumber, '____________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, '    |    தேதி / Date: ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : voucherDate, '____________________', { lineGap: 3.5 });
        doc.moveDown(0.35);

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        doc.text('சீட்டு குழு / Chit Group: ', 25, doc.y, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.groupCode, '____________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | மாதம் / Month: ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `#${data.installmentMonth}`, '____', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | டிக்கெட் / Ticket: ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `#${data.ticketNumber}`, '____', { lineGap: 3.5 });
        doc.moveDown(0.35);

        const winnerTamil = data.winnerNameTamil ? ` / ${data.winnerNameTamil}` : '';
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont);
        doc.text('வெற்றியாளர் / Winner: ', 25, doc.y, { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : `${data.winnerName}${winnerTamil} (${data.winnerCode})`, '________________________________________', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderStatic(doc, regularFont, ' | தொலைபேசி: ', { continued: true, lineGap: 3.5 });
        StatutoryFormHelper.renderField(doc, boldFont, isBlank ? '' : data.phone, '____________________', { lineGap: 3.5 });
        doc.moveDown(0.4);

        // Financial Breakdown Box
        const boxY = doc.y;
        const boxHeight =
          hasArrearsOffset && hasCommission
            ? 94
            : hasArrearsOffset || hasCommission
              ? 78
              : 64;
        doc.rect(25, boxY, pageWidth, boxHeight).fillAndStroke('#f8f9fa', '#ced4da');
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);

        doc.font(boldFont).fontSize(9).text('நிதி விவரங்கள் / FINANCIAL DETAILS:', 35, boxY + 8);
        doc.font(regularFont).fontSize(8.5);
        doc.text('மொத்த சீட்டு மதிப்பு / Chit Value: ', 35, boxY + 25, { continued: true });
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`₹ ${RupeeWordsHelper.formatWholeRupees(data.chitValue)}`);

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).text('ஏல கழிவு / Bid Discount: ', 35, boxY + 41, { continued: true });
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).text(`₹ ${RupeeWordsHelper.formatWholeRupees(data.bidDiscount)}`);

        let nextLeftY = boxY + 57;
        if (hasCommission) {
          doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(regularFont).text(
            `முகவர் கழிவு / Commission (${commissionRateLabel}): ₹ ${RupeeWordsHelper.formatWholeRupees(data.foremanCommissionAmount!)}`,
            35,
            nextLeftY,
          );
          nextLeftY += 16;
        }
        if (hasArrearsOffset) {
          doc.fillColor('#b91c1c').font(regularFont).text(
            `நிலுவை கழிவு / Arrears Offset: - ₹ ${RupeeWordsHelper.formatWholeRupees(arrearsDeducted)}`,
            35,
            nextLeftY,
          );
          doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK);
        }

        const rightBoxX = 295;
        const rightBoxWidth = pageWidth - (rightBoxX - 25) - 10;
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).fontSize(9.5);
        doc.text(
          `நிகர பரிசு தொகை / NET PRIZE: ₹ ${RupeeWordsHelper.formatWholeRupees(data.netPrizeMoney)}`,
          rightBoxX,
          boxY + 8,
          {
            width: rightBoxWidth,
            statutoryUnderline: true,
            underlineColor: StatutoryFormHelper.TEMPLATE_BLACK,
            underlineWidth: StatutoryFormHelper.BOLD_LINE_WIDTH,
          } as any,
        );

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(8.5);
        doc.text(`முறை / Mode: ${data.disbursementMode}`, rightBoxX, boxY + 25, { width: rightBoxWidth });
        doc.text(`குறிப்பு எண் / Ref: ${data.paymentReference}`, rightBoxX, boxY + 41, { width: rightBoxWidth });
        if (hasArrearsOffset) {
          doc.text(
            `மொத்த பரிசு / Gross Prize: ₹ ${RupeeWordsHelper.formatWholeRupees(grossPrizeMoney)}`,
            rightBoxX,
            boxY + 57,
            { width: rightBoxWidth },
          );
        }

        doc.x = 25;
        doc.y = boxY + boxHeight + 8;

        // Words
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(8.5);
        doc.text(`தொகை (சொற்களில்): ${RupeeWordsHelper.toTamilWords(data.netPrizeMoney)}`, 25, doc.y, { width: pageWidth, lineGap: 3 });
        doc.moveDown(0.2);
        doc.text(`In Words: ${RupeeWordsHelper.toEnglishWords(data.netPrizeMoney)}`, 25, doc.y, { width: pageWidth, lineGap: 3 });
        doc.moveDown(0.35);

        // Safety Proof Checklist Stamp (ADR-15)
        doc.font(boldFont).fontSize(8.5).text('நிறுவன பாதுகாப்பு சரிபார்ப்பு / COMPANY SAFETY PROOF CHECKLIST (ADR-15):', 25, doc.y, { width: pageWidth });
        doc.font(regularFont).fontSize(8);
        const agr = data.agreementSigned ? 'சரி / YES' : 'இல்லை / NO';
        const nom = data.nomineeSigned ? 'சரி / YES' : 'இல்லை / NO';
        const secSummary = this.formatSecuritySummary(data);
        doc.text(`• ஒப்பந்தம் / Agreement Signed: [ ${agr} ]   • வாரிசு கையொப்பம் / Nominee Signed: [ ${nom} ]   • பாதுகாப்பு / Security: [ ${secSummary} ]`, 25, doc.y + 2, { width: pageWidth });
        doc.moveDown(0.7);

        // Signature Blocks (Dual Control)
        const sigY = doc.y;
        doc.moveTo(25, sigY).lineTo(570, sigY).lineWidth(1).strokeColor(StatutoryFormHelper.TEMPLATE_BLACK).stroke();
        doc.moveDown(0.5);

        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(8);
        doc.text('சரிபார்த்தவர் (தயாரிப்பாளர் / Maker):', 35, sigY + 8);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).fontSize(8.5).text(data.verifiedByUserName, 35, sigY + 20);
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).text('____________________', 35, sigY + 32);

        doc.font(regularFont).fontSize(8).text('அனுமதித்தவர் (சரிபார்ப்பாளர் / Checker):', 215, sigY + 8);
        doc.fillColor(StatutoryFormHelper.DATA_BLUE).font(boldFont).fontSize(8.5).text(data.authorizedByUserName, 215, sigY + 20);
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(boldFont).text('____________________', 215, sigY + 32);

        doc.font(regularFont).fontSize(8).text('வெற்றியாளர் / Winner:', 395, sigY + 8, { width: 175 });
        doc.fillColor(StatutoryFormHelper.TEMPLATE_BLACK).font(regularFont).fontSize(7.5).text('(கையொப்பம் / Signature)', 395, sigY + 20, { width: 175 });
        doc.font(boldFont).text('____________________', 395, sigY + 34);

        doc.end();
      } catch (err) {
        safeReject(err);
      }
    });
  }
}
