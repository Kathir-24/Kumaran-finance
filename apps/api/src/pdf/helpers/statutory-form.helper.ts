import PDFDocument from 'pdfkit';

/**
 * Statutory Form Helper for Tamil Nadu Chit Funds Rules, 1984 forms.
 *
 * Provides:
 * 1. Standard color constants:
 *    - `DATA_BLUE` (#003399): Bold legal blue for user and scheme entered data.
 *    - `TEMPLATE_BLACK` (#000000): Standard black for statutory printed text and official blank underlines.
 *    - `BOLD_LINE_WIDTH` (1.2): Standard bold line thickness for official Gazette fill-in blanks.
 * 2. `patchDocumentUnderline`: Monkey-patches the PDFDocument prototype so that any text rendered
 *    with `statutoryUnderline: true` draws a bold black underline (`lineWidth: 1.2`) strictly under
 *    the text fragment without leaking into subsequent text fragments.
 * 3. `renderField`: Renders a fill-in-the-blank field:
 *    - If value is present: renders in bold blue (#003399) with a bold black underline (#000000, 1.2pt).
 *    - If value is absent (blank form / underscores): renders fallback bold black underscores.
 * 4. `renderStatic`: Renders normal static text following an inline field, resetting the underline.
 */
export class StatutoryFormHelper {
  // Official Tamil Nadu Government Legal Blue for entered subscriber & scheme details
  static readonly DATA_BLUE = '#003399';
  // Standard statutory black for printed Gazette template text and form underlines
  static readonly TEMPLATE_BLACK = '#000000';
  // Standard bold black line width for Gazette fill-in blanks
  static readonly BOLD_LINE_WIDTH = 1.2;

  private static isPatched = false;

  /**
   * Patches the PDFKit document prototype so that options.statutoryUnderline
   * renders a custom bold black underline under bold blue text, with exact
   * segment width and zero leakage to subsequent continued text fragments.
   */
  static patchDocumentUnderline(): void {
    if (this.isPatched) {
      return;
    }
    this.isPatched = true;

    const proto = PDFDocument.prototype as any;
    const origFragment = proto._fragment;

    proto._fragment = function (text: string, x: number, y: number, options: any = {}) {
      if (options && options.statutoryUnderline) {
        this.save();
        this.strokeColor(options.underlineColor || StatutoryFormHelper.TEMPLATE_BLACK);
        this.lineWidth(options.underlineWidth || StatutoryFormHelper.BOLD_LINE_WIDTH);
        const textW = options.textWidth ?? this.widthOfString(text, options);
        const w = Math.max(options.minUnderlineWidth || 0, textW);
        const lineY = y + this.currentLineHeight() - 1;
        this.moveTo(x, lineY).lineTo(x + w, lineY).stroke();
        this.restore();
      }
      return origFragment.call(this, text, x, y, options);
    };
  }

  /**
   * Renders a statutory form fill-in-the-blank field:
   * - If value is present: prints value in bold blue with a bold black underline.
   * - If value is absent: prints fallback underscores in bold black.
   */
  static renderField(
    doc: any,
    boldFont: string,
    value: string | number | bigint | null | undefined,
    blankFallback: string,
    options: any = {},
  ): void {
    const strVal = value !== null && value !== undefined ? String(value).trim() : '';
    const isUnderlineOnly = /^_+$/.test(strVal);
    const hasValue = strVal.length > 0 && strVal !== '-' && !isUnderlineOnly;

    if (hasValue) {
      doc
        .fillColor(StatutoryFormHelper.DATA_BLUE)
        .font(boldFont)
        .text(strVal, {
          ...options,
          statutoryUnderline: true,
          underlineColor: StatutoryFormHelper.TEMPLATE_BLACK,
          underlineWidth: StatutoryFormHelper.BOLD_LINE_WIDTH,
        });
    } else {
      doc
        .fillColor(StatutoryFormHelper.TEMPLATE_BLACK)
        .font(boldFont)
        .text(blankFallback, {
          ...options,
          statutoryUnderline: false,
        });
    }
  }

  /**
   * Renders normal static text following an inline field, ensuring the statutoryUnderline
   * option is turned off so underline does not leak into the rest of the sentence.
   */
  static renderStatic(
    doc: any,
    regularFont: string,
    text: string,
    options: any = {},
  ): void {
    doc
      .fillColor(StatutoryFormHelper.TEMPLATE_BLACK)
      .font(regularFont)
      .text(text, {
        ...options,
        statutoryUnderline: false,
      });
  }
}
