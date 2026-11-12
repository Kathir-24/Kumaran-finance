// ==============================================================================
// Kumaran Chits — DEF-FE-05 Web Typed SDK Migration & Regression Tests
// Covers N1-N5: Blob unwrapping, KumaranApiError propagation, pdf-download,
// static source guards against raw /api/v1 fetch() and getStoredAccessToken,
// AbortSignal cancellation, and AuthorizePayoutDto clean body invariants.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KumaranApiError, unwrapApiResponse } from '../src/lib/api-client.ts';
import {
  downloadReceiptPdf,
  downloadVoucherPdf,
  triggerBlobDownload,
} from '../src/lib/pdf-download.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_SRC_DIR = path.resolve(__dirname, '../src');

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

test('DEF-FE-05 (N1): unwrapApiResponse unwraps JSON envelopes, preserves Blob binaries, and throws KumaranApiError', async () => {
  // 1. Standard NestJS JSON envelope
  const jsonResult = await unwrapApiResponse<{ id: string }>({
    then: undefined,
    data: { success: true, statusCode: 200, data: { id: 'pay-001' } },
    response: new Response(null, { status: 200 }),
  } as any);
  assert.deepEqual(jsonResult, { id: 'pay-001' });

  // 2. Binary Blob response (parseAs: 'blob')
  const sampleBlob = new Blob(['%PDF-1.4 sample receipt'], { type: 'application/pdf' });
  const blobResult = await unwrapApiResponse<Blob>(
    Promise.resolve({
      data: sampleBlob,
      response: new Response(sampleBlob, { status: 200 }),
    }),
  );
  assert.equal(blobResult instanceof Blob, true);
  assert.equal(await blobResult.text(), '%PDF-1.4 sample receipt');

  // 3. Error payload -> typed KumaranApiError
  await assert.rejects(
    async () => {
      await unwrapApiResponse(
        Promise.resolve({
          error: { code: 'MAKER_CHECKER_VIOLATION', message: 'Maker cannot approve own reversal' },
          response: new Response(null, { status: 403, statusText: 'Forbidden' }),
        }),
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof KumaranApiError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'MAKER_CHECKER_VIOLATION');
      assert.equal(err.message, 'Maker cannot approve own reversal');
      return true;
    },
  );
});

test('DEF-FE-05 (N2): pdf-download downloads authenticated PDF blobs via apiClient and always revokes ObjectURL', async () => {
  const calls: Array<{ url: string; opts: any }> = [];
  const downloads: Array<{ blob: Blob; filename: string }> = [];
  const pdfBlob = new Blob(['%PDF-1.4-mock'], { type: 'application/pdf' });

  const mockClient = {
    GET: async (url: string, opts: any) => {
      calls.push({ url, opts });
      return { data: pdfBlob, response: new Response(pdfBlob, { status: 200 }) };
    },
  } as any;

  await downloadReceiptPdf('pay-123', 'receipt-KC-REC-001.pdf', {
    getClient: () => mockClient,
    triggerDownload: (blob, filename) => downloads.push({ blob, filename }),
  });

  await downloadVoucherPdf('auc-456', 'prize-voucher-auc-456.pdf', {
    getClient: () => mockClient,
    triggerDownload: (blob, filename) => downloads.push({ blob, filename }),
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/api/v1/pdf/receipt/{paymentId}');
  assert.deepEqual(calls[0].opts, { params: { path: { paymentId: 'pay-123' } }, parseAs: 'blob' });
  assert.equal(calls[1].url, '/api/v1/pdf/voucher/{auctionId}');
  assert.deepEqual(calls[1].opts, { params: { path: { auctionId: 'auc-456' } }, parseAs: 'blob' });
  assert.deepEqual(
    downloads.map((d) => d.filename),
    ['receipt-KC-REC-001.pdf', 'prize-voucher-auc-456.pdf'],
  );

  // Verify triggerBlobDownload revokes object URL and removes anchor even when click throws
  const origWindow = (globalThis as any).window;
  const origDocument = (globalThis as any).document;
  let revokedUrl: string | null = null;
  let removedChild = false;
  const fakeAnchor: any = {
    href: '',
    download: '',
    parentNode: null,
    click: () => {
      throw new Error('Synthetic DOM click failure');
    },
  };
  (globalThis as any).window = {
    URL: {
      createObjectURL: () => 'blob:http://localhost/pdf-1',
      revokeObjectURL: (u: string) => {
        revokedUrl = u;
      },
    },
  };
  (globalThis as any).document = {
    createElement: () => fakeAnchor,
    body: {
      appendChild: (node: any) => {
        node.parentNode = {
          removeChild: () => {
            removedChild = true;
          },
        };
      },
    },
  };

  try {
    assert.throws(() => triggerBlobDownload(pdfBlob, 'test.pdf'), /Synthetic DOM click failure/);
    assert.equal(removedChild, true, 'Anchor element must always be removed in finally block');
    assert.equal(revokedUrl, 'blob:http://localhost/pdf-1', 'ObjectURL must always be revoked in finally block');
  } finally {
    (globalThis as any).window = origWindow;
    (globalThis as any).document = origDocument;
  }

  // Verify non-OK PDF download propagates KumaranApiError
  const failingClient = {
    GET: async () => ({
      error: { code: 'NOT_FOUND', message: 'PDF unavailable' },
      response: new Response(null, { status: 404 }),
    }),
  } as any;
  await assert.rejects(
    async () =>
      downloadReceiptPdf('pay-missing', 'missing.pdf', {
        getClient: () => failingClient,
        triggerDownload: () => assert.fail('Must not trigger browser download on error'),
      }),
    (err: unknown) => err instanceof KumaranApiError && err.statusCode === 404,
  );
});

test('DEF-FE-05 (N3): Static Guard — zero raw fetch(/api/v1/...) calls remain across Web UI pages and components', () => {
  const uiFiles = [
    ...collectTsFiles(path.join(WEB_SRC_DIR, 'app')),
    ...collectTsFiles(path.join(WEB_SRC_DIR, 'components')),
  ];

  assert.ok(uiFiles.length >= 20, 'Expected Web UI source files to be scanned');

  const violations: string[] = [];
  for (const filePath of uiFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Only Next.js /api/auth/* local BFF cookie endpoints in components/auth/ may use raw fetch
    if (/\bfetch\s*\(/.test(content)) {
      const normalizedRel = path.relative(WEB_SRC_DIR, filePath).replace(/\\/g, '/');
      const isAllowedAuthBffCaller =
        normalizedRel.startsWith('components/auth/') && !content.includes('/api/v1/');
      if (!isAllowedAuthBffCaller) {
        violations.push(normalizedRel);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found forbidden raw fetch() calls in UI modules: ${violations.join(', ')}`,
  );
});

test('DEF-FE-05 (N4): Static Guard — zero deprecated getStoredAccessToken imports in UI/hooks/stores and zero dead /api/v1/chit-groups references', () => {
  const allSrcFiles = collectTsFiles(WEB_SRC_DIR);
  const tokenViolations: string[] = [];
  const deadEndpointViolations: string[] = [];

  for (const filePath of allSrcFiles) {
    const normalizedRel = path.relative(WEB_SRC_DIR, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf-8');

    if (
      normalizedRel !== 'lib/api-client.ts' &&
      (/getStoredAccessToken/.test(content) || /getStoredRefreshToken/.test(content))
    ) {
      tokenViolations.push(normalizedRel);
    }

    if (/\/api\/v1\/chit-groups\b/.test(content)) {
      deadEndpointViolations.push(normalizedRel);
    }
  }

  assert.deepEqual(
    tokenViolations,
    [],
    `Found deprecated token getter usage in: ${tokenViolations.join(', ')}`,
  );
  assert.deepEqual(
    deadEndpointViolations,
    [],
    `Found dead /api/v1/chit-groups URL references in: ${deadEndpointViolations.join(', ')}`,
  );

  const counterModalContent = fs.readFileSync(
    path.join(WEB_SRC_DIR, 'components/collections/counter-payment-modal.tsx'),
    'utf-8',
  );
  assert.match(counterModalContent, /apiClient\.GET\('\/api\/v1\/chits'/);
});

test('DEF-FE-05 (N5): AbortSignal forwarding across migrated queryFns & clean AuthorizePayoutDto payload', () => {
  const signalExpectedFiles = [
    'app/(dashboard)/collections/page.tsx',
    'app/(dashboard)/collections/handover/page.tsx',
    'app/(dashboard)/disbursements/page.tsx',
    'app/(dashboard)/disbursements/[id]/voucher/page.tsx',
    'app/(dashboard)/reversals/page.tsx',
    'app/print/voucher/[id]/page.tsx',
    'components/collections/bilingual-receipt-modal.tsx',
    'components/collections/counter-payment-modal.tsx',
    'components/collections/counter-upi-qr.tsx',
    'components/disbursements/bilingual-voucher-dialog.tsx',
  ];

  for (const relPath of signalExpectedFiles) {
    const content = fs.readFileSync(path.join(WEB_SRC_DIR, relPath), 'utf-8');
    assert.match(
      content,
      /queryFn:\s*async\s*\(\{\s*signal\s*\}\)/,
      `${relPath} queryFn must destructure AbortSignal ({ signal })`,
    );
    assert.match(content, /\bsignal\s*,/, `${relPath} must pass signal to apiClient.GET`);
  }

  const notebookGrid = fs.readFileSync(
    path.join(WEB_SRC_DIR, 'components/schemes/notebook-entry-grid.tsx'),
    'utf-8',
  );
  assert.match(notebookGrid, /new AbortController\(\)/);
  assert.match(notebookGrid, /controller\.abort\(\)/);
  assert.match(notebookGrid, /signal:\s*controller\.signal/);

  const authModal = fs.readFileSync(
    path.join(WEB_SRC_DIR, 'components/disbursements/disbursement-auth-modal.tsx'),
    'utf-8',
  );
  assert.match(authModal, /headers:\s*\{\s*'Idempotency-Key':\s*idempotencyKey\s*\}/);
  // Ensure idempotencyKey is no longer stuffed inside AuthorizePayoutDto JSON body
  assert.doesNotMatch(authModal, /body:\s*\{[^}]*idempotencyKey/);
});
