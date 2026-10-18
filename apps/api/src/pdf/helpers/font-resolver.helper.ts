import * as fs from 'fs';
import * as path from 'path';

export class FontResolverHelper {
  private static regularFontPath: string | null = null;
  private static boldFontPath: string | null = null;

  static getTamilRegularFont(): string {
    if (this.regularFontPath && fs.existsSync(this.regularFontPath)) {
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
      if (fs.existsSync(p)) {
        this.regularFontPath = p;
        return p;
      }
    }

    // Fallback to standard system font if file missing in headless test
    return 'Helvetica';
  }

  static getTamilBoldFont(): string {
    if (this.boldFontPath && fs.existsSync(this.boldFontPath)) {
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
      if (fs.existsSync(p)) {
        this.boldFontPath = p;
        return p;
      }
    }

    return 'Helvetica-Bold';
  }
}
