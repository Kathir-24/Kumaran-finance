// ==============================================================================
// Kumaran Chits — Client-Side Image Compressor & Optimization Utility
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/document-and-storage-architecture.md
// ==============================================================================

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeThresholdBytes?: number;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.82,
  maxSizeThresholdBytes: 1.2 * 1024 * 1024, // 1.2 MB
};

/**
 * Calculates new dimensions preserving aspect ratio.
 */
export function calculateAspectRatioFit(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number; scale: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { width: srcWidth, height: srcHeight, scale: 1 };
  }
  const scale = Math.min(maxWidth / srcWidth, maxHeight / srcHeight, 1);
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
    scale,
  };
}

/**
 * Compresses and downscales client camera photos prior to uploading to S3,
 * drastically reducing upload times and timeouts on rural 3G/4G cellular connections.
 * Safely passes through non-image documents (PDFs) without alteration.
 */
export async function compressImageIfNeeded(
  file: File,
  customOptions?: CompressionOptions,
): Promise<File> {
  // 1. Bypass non-images (e.g. PDF documents)
  if (!file || !file.type || !file.type.startsWith('image/')) {
    return file;
  }

  // 2. Bypass SSR / non-browser environments safely
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return file;
  }

  const options: Required<CompressionOptions> = {
    ...DEFAULT_OPTIONS,
    ...customOptions,
  };

  // 3. If file is already lightweight (e.g. small icon or web photo <= 800KB), return as-is
  if (file.size <= 800 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onerror = () => resolve(file); // Safe fallback on read failure
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = () => resolve(file); // Safe fallback on image decode failure
        img.onload = () => {
          try {
            const { width, height } = calculateAspectRatioFit(
              img.width,
              img.height,
              options.maxWidth,
              options.maxHeight,
            );

            // If dimensions are within bounds and file is under threshold, no recompression needed
            if (img.width === width && img.height === height && file.size <= options.maxSizeThresholdBytes) {
              resolve(file);
              return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(file);
              return;
            }

            // High-quality canvas image downsampling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
              (blob) => {
                if (!blob || blob.size >= file.size) {
                  // If compression produced a larger output than original, keep original
                  resolve(file);
                  return;
                }

                // Preserve original filename, normalize extension to .jpg if compressed
                const baseName = file.name.replace(/\.[^/.]+$/, '');
                const compressedFile = new File([blob], `${baseName}.jpg`, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });

                resolve(compressedFile);
              },
              'image/jpeg',
              options.quality,
            );
          } catch {
            resolve(file);
          }
        };

        if (event.target?.result) {
          img.src = event.target.result as string;
        } else {
          resolve(file);
        }
      };

      reader.readAsDataURL(file);
    } catch {
      resolve(file);
    }
  });
}
