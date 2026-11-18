import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export class FontResolverHelper {
  private static readonly logger = new Logger(FontResolverHelper.name);
  private static readonly IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  private static regularFontPath: string | null = null;
  private static boldFontPath: string | null = null;

  private static isValidFontFile(filePath: string): boolean {
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
      const stat = fs.statSync(filePath);
      return stat.isFile() && stat.size > 0;
    } catch {
      return false;
    }
  }

  static getTamilRegularFont(): string {
    if (this.regularFontPath && this.isValidFontFile(this.regularFontPath)) {
      return this.regularFontPath;
    }

    const candidatePaths = [
      path.resolve(__dirname, '../../assets/fonts/NotoSansTamil-Regular.ttf'),
      path.resolve(__dirname, '../../../src/assets/fonts/NotoSansTamil-Regular.ttf'),
      path.resolve(process.cwd(), 'src/assets/fonts/NotoSansTamil-Regular.ttf'),
      path.resolve(process.cwd(), 'dist/assets/fonts/NotoSansTamil-Regular.ttf'),
      path.resolve(process.cwd(), 'apps/api/src/assets/fonts/NotoSansTamil-Regular.ttf'),
    ];

    for (const p of candidatePaths) {
      if (this.isValidFontFile(p)) {
        this.regularFontPath = p;
        return p;
      }
    }

    this.logger.warn('NotoSansTamil-Regular.ttf not found; falling back to Helvetica');
    return 'Helvetica';
  }

  static getTamilBoldFont(): string {
    if (this.boldFontPath && this.isValidFontFile(this.boldFontPath)) {
      return this.boldFontPath;
    }

    const candidatePaths = [
      path.resolve(__dirname, '../../assets/fonts/NotoSansTamil-Bold.ttf'),
      path.resolve(__dirname, '../../../src/assets/fonts/NotoSansTamil-Bold.ttf'),
      path.resolve(process.cwd(), 'src/assets/fonts/NotoSansTamil-Bold.ttf'),
      path.resolve(process.cwd(), 'dist/assets/fonts/NotoSansTamil-Bold.ttf'),
      path.resolve(process.cwd(), 'apps/api/src/assets/fonts/NotoSansTamil-Bold.ttf'),
    ];

    for (const p of candidatePaths) {
      if (this.isValidFontFile(p)) {
        this.boldFontPath = p;
        return p;
      }
    }

    this.logger.warn('NotoSansTamil-Bold.ttf not found; falling back to Helvetica-Bold');
    return 'Helvetica-Bold';
  }

  /**
   * Safely validates and loads a font into a PDFKit document, falling back to a standard
   * built-in PDF font if a TTF asset is missing or corrupted on disk.
   */
  static resolveSafeFont(
    doc: { font: (src: string) => unknown },
    preferredFont: string,
    fallbackFont: 'Helvetica' | 'Helvetica-Bold',
  ): string {
    try {
      doc.font(preferredFont);
      return preferredFont;
    } catch (err: any) {
      this.logger.warn(
        `Failed to load PDF font "${preferredFont}" (${err?.message || 'unknown error'}); falling back to ${fallbackFont}`,
      );
      doc.font(fallbackFont);
      return fallbackFont;
    }
  }

  /**
   * Formats a Date (or ISO string) into YYYY-MM-DD in IST (Asia/Kolkata, UTC+05:30)
   * without throwing on malformed dates. Prevents 00:00–05:29 IST day drift vs Day Book / Form XXII.
   */
  static formatPdfDate(value: Date | string | null | undefined): string {
    if (!value) return '-';
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '-';
    }
    const istShifted = new Date(parsed.getTime() + this.IST_OFFSET_MS);
    return istShifted.toISOString().split('T')[0];
  }

  /**
   * Returns the 4-digit calendar year in IST (Asia/Kolkata, UTC+05:30) for storage keys & voucher numbers.
   */
  static getIstYear(value: Date | string | null | undefined): number {
    const parsed = value instanceof Date ? value : value ? new Date(value) : new Date();
    const validDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const istShifted = new Date(validDate.getTime() + this.IST_OFFSET_MS);
    return istShifted.getUTCFullYear();
  }

  /**
   * Strictly sanitizes a dynamic identifier segment for Content-Disposition filenames.
   * Eliminates CRLF/header injection, quotes, semicolons, slashes, path traversal (".."),
   * and control characters.
   */
  static sanitizeDispositionSegment(raw: string | null | undefined, fallback = 'document'): string {
    if (!raw || typeof raw !== 'string') {
      return fallback;
    }

    const sanitized = raw
      .replace(/[\r\n\0]/g, '')
      .replace(/\.\./g, '')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 100);

    return sanitized || fallback;
  }
}
