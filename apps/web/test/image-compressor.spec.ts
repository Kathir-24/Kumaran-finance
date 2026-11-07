// ==============================================================================
// Kumaran Chits — Client-Side Image Compressor Unit Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/document-and-storage-architecture.md
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAspectRatioFit,
  compressImageIfNeeded,
} from '../src/lib/image-compressor.ts';

test('1. calculateAspectRatioFit: preserves exact dimensions when image is within bounds', () => {
  const result = calculateAspectRatioFit(1200, 800, 1920, 1080);
  assert.equal(result.width, 1200);
  assert.equal(result.height, 800);
  assert.equal(result.scale, 1);
});

test('2. calculateAspectRatioFit: scales down high-resolution landscape photos to fit 1920x1080', () => {
  // 4K photo: 3840 x 2160
  const result = calculateAspectRatioFit(3840, 2160, 1920, 1080);
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  assert.equal(result.scale, 0.5);
});

test('3. calculateAspectRatioFit: scales down portrait camera photos preserving aspect ratio', () => {
  // 12MP portrait photo: 3000 x 4000
  const result = calculateAspectRatioFit(3000, 4000, 1920, 1080);
  assert.equal(result.height, 1080);
  assert.equal(result.width, 810);
  assert.equal(result.scale, 0.27);
});

test('4. calculateAspectRatioFit: safely handles edge-case 0 or negative dimensions', () => {
  const result = calculateAspectRatioFit(0, 0, 1920, 1080);
  assert.equal(result.width, 0);
  assert.equal(result.height, 0);
  assert.equal(result.scale, 1);
});

test('5. compressImageIfNeeded: completely bypasses PDF documents without touching them', async () => {
  // Mock File-like object
  const pdfFile = {
    name: 'aadhaar_document.pdf',
    type: 'application/pdf',
    size: 5 * 1024 * 1024,
  } as unknown as File;

  const processed = await compressImageIfNeeded(pdfFile);
  assert.equal(processed, pdfFile);
});

test('6. compressImageIfNeeded: safely returns original file in SSR or non-DOM environments', async () => {
  const imgFile = {
    name: 'camera_aadhaar.jpg',
    type: 'image/jpeg',
    size: 6 * 1024 * 1024,
  } as unknown as File;

  // In Node.js testing environment where `window` is not set, it gracefully returns file
  const processed = await compressImageIfNeeded(imgFile);
  assert.equal(processed, imgFile);
});
