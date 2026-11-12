// ==============================================================================
// Kumaran Chits — Direct Presigned S3 Upload & Component Regression Tests (DEF-FE-07)
// Covers Cloud S3/R2 PUT, AWS SSE header forwarding, Local Driver PUT fallback,
// compression-before-presign ordering, 120s timeout diagnostics, and BFF guards.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { uploadDirectToStorage } from '../src/lib/direct-upload.ts';

function createFakeFile(name: string, type: string, size: number): File {
  return {
    name,
    type,
    size,
  } as unknown as File;
}

test('DEF-FE-07 Cloud R2/S3 Topology: compresses image BEFORE presigning and PUTs directly without cookies/Bearer', async () => {
  const callOrder: string[] = [];
  let capturedPresignPayload: any = null;
  let capturedFetchUrl: string | null = null;
  let capturedFetchInit: RequestInit | undefined;

  const rawCameraFile = createFakeFile('camera_scan.png', 'image/png', 4 * 1024 * 1024);
  const compressedJpeg = createFakeFile('camera_scan.jpg', 'image/jpeg', 650 * 1024);

  const result = await uploadDirectToStorage(
    {
      purpose: 'KYC',
      entityId: 'cust-001',
      docType: 'AADHAAR_FRONT',
      file: rawCameraFile,
    },
    {
      compressFn: async (f) => {
        callOrder.push('compress');
        assert.equal(f, rawCameraFile);
        return compressedJpeg;
      },
      requestPresignFn: async (payload) => {
        callOrder.push('presign');
        capturedPresignPayload = payload;
        return {
          uploadUrl: 'https://r2.kumaranfinance.com/kyc/cust-001/AADHAAR_FRONT-1234.jpg?sig=abc',
          key: 'kyc/cust-001/AADHAAR_FRONT-1234.jpg',
          method: 'PUT',
          expiresInSeconds: 300,
          headers: {
            'Content-Type': 'image/jpeg',
            'x-amz-server-side-encryption': 'AES256',
          },
        };
      },
      fetchFn: (async (url: string | URL | Request, init?: RequestInit) => {
        callOrder.push('put');
        capturedFetchUrl = String(url);
        capturedFetchInit = init;
        return new Response(null, { status: 200 });
      }) as typeof fetch,
    },
  );

  assert.deepEqual(callOrder, ['compress', 'presign', 'put']);
  assert.equal(capturedPresignPayload.fileName, 'camera_scan.jpg');
  assert.equal(capturedPresignPayload.mimeType, 'image/jpeg');
  assert.equal(capturedPresignPayload.customerId, 'cust-001');
  assert.equal(
    capturedFetchUrl,
    'https://r2.kumaranfinance.com/kyc/cust-001/AADHAAR_FRONT-1234.jpg?sig=abc',
  );
  assert.equal(capturedFetchInit?.method, 'PUT');
  assert.equal(capturedFetchInit?.credentials, 'omit');
  assert.deepEqual(capturedFetchInit?.headers, {
    'Content-Type': 'image/jpeg',
    'x-amz-server-side-encryption': 'AES256',
  });
  assert.ok(capturedFetchInit?.signal instanceof AbortSignal);
  assert.equal(result.compressed, true);
  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(result.fileName, 'camera_scan.jpg');
  assert.equal(result.sizeBytes, 650 * 1024);
});

test('DEF-FE-07 Local Driver Topology: relative /api/v1/storage/upload/* resolves via /bff with same-origin cookies', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const pdfFile = createFakeFile('signed_cheques.pdf', 'application/pdf', 900 * 1024);

  const result = await uploadDirectToStorage(
    {
      purpose: 'SAFETY_PROOF',
      entityId: 'auc-009',
      docType: 'SAFETY_PROOF',
      file: pdfFile,
    },
    {
      compressFn: async (f) => f,
      getBaseUrlFn: () => '/bff',
      requestPresignFn: async (payload) => {
        assert.equal(payload.auctionId, 'auc-009');
        return {
          uploadUrl: '/api/v1/storage/upload/safety-proof/auc-009/abcd-signed_cheques.pdf',
          key: 'safety-proof/auc-009/abcd-signed_cheques.pdf',
          method: 'PUT',
          expiresInSeconds: 300,
          headers: { 'Content-Type': 'application/pdf' },
        };
      },
      fetchFn: (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as typeof fetch,
    },
  );

  assert.equal(
    capturedUrl,
    '/bff/api/v1/storage/upload/safety-proof/auc-009/abcd-signed_cheques.pdf',
  );
  assert.equal(capturedInit?.credentials, 'same-origin');
  assert.equal(result.compressed, false);
  assert.equal(result.key, 'safety-proof/auc-009/abcd-signed_cheques.pdf');
});

test('DEF-FE-07 Fail-Closed: rejects oversized/invalid files before presigning and surfaces S3 PUT failures clearly', async () => {
  let presignCalled = false;

  await assert.rejects(
    () =>
      uploadDirectToStorage(
        {
          purpose: 'KYC',
          entityId: 'cust-001',
          docType: 'PAN',
          file: createFakeFile('malware.zip', 'application/zip', 1024),
        },
        {
          requestPresignFn: async () => {
            presignCalled = true;
            throw new Error('Should not presign');
          },
        },
      ),
    /Unsupported file format/i,
  );

  await assert.rejects(
    () =>
      uploadDirectToStorage(
        {
          purpose: 'KYC',
          entityId: 'cust-001',
          docType: 'PAN',
          file: createFakeFile('huge.pdf', 'application/pdf', 11 * 1024 * 1024),
        },
        {
          requestPresignFn: async () => {
            presignCalled = true;
            throw new Error('Should not presign');
          },
        },
      ),
    /exceeds 10MB limit/i,
  );
  assert.equal(presignCalled, false);

  await assert.rejects(
    () =>
      uploadDirectToStorage(
        {
          purpose: 'SAFETY_PROOF',
          entityId: 'auc-001',
          docType: 'SAFETY_PROOF',
          file: createFakeFile('scan.jpg', 'image/jpeg', 2048),
        },
        {
          compressFn: async (f) => f,
          requestPresignFn: async () => ({
            uploadUrl: 'https://r2.kumaranfinance.com/safety-proof/auc-001/scan.jpg?sig=bad',
            key: 'safety-proof/auc-001/scan.jpg',
            method: 'PUT',
            expiresInSeconds: 300,
            headers: { 'Content-Type': 'image/jpeg' },
          }),
          fetchFn: (async () => new Response('SignatureDoesNotMatch', { status: 403 })) as typeof fetch,
        },
      ),
    /HTTP 403/i,
  );

  await assert.rejects(
    () =>
      uploadDirectToStorage(
        {
          purpose: 'SAFETY_PROOF',
          entityId: 'auc-001',
          docType: 'SAFETY_PROOF',
          file: createFakeFile('scan.jpg', 'image/jpeg', 2048),
        },
        {
          compressFn: async (f) => f,
          timeoutMs: 15,
          requestPresignFn: async () => ({
            uploadUrl: 'https://r2.kumaranfinance.com/safety-proof/auc-001/slow.jpg',
            key: 'safety-proof/auc-001/slow.jpg',
            method: 'PUT',
            expiresInSeconds: 300,
            headers: { 'Content-Type': 'image/jpeg' },
          }),
          fetchFn: ((_url: string | URL | Request, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
              });
            })) as typeof fetch,
        },
      ),
    /timed out/i,
  );
});

test('DEF-FE-07 Regression Guard: Web KYC & Safety Proof components contain zero FormData/getStoredAccessToken and Nginx supports local PUT', () => {
  const webRoot = path.resolve(import.meta.dirname, '..');
  const kycCard = fs.readFileSync(
    path.join(webRoot, 'src/components/customers/customer-documents-card.tsx'),
    'utf8',
  );
  const safetyBox = fs.readFileSync(
    path.join(webRoot, 'src/components/disbursements/safety-proof-upload-box.tsx'),
    'utf8',
  );
  const safetyChecklist = fs.readFileSync(
    path.join(webRoot, 'src/components/disbursements/safety-proof-checklist.tsx'),
    'utf8',
  );
  const nginxConf = fs.readFileSync(
    path.resolve(webRoot, '../../infra/docker/nginx/conf.d/chitflow.conf'),
    'utf8',
  );

  for (const [name, src] of [
    ['customer-documents-card.tsx', kycCard],
    ['safety-proof-upload-box.tsx', safetyBox],
    ['safety-proof-checklist.tsx', safetyChecklist],
  ]) {
    assert.equal(
      src.includes('getStoredAccessToken'),
      false,
      `${name} must not call deprecated getStoredAccessToken()`,
    );
    assert.equal(
      src.includes('new FormData'),
      false,
      `${name} must not send FormData through NestJS`,
    );
  }

  assert.ok(kycCard.includes('uploadDirectToStorage'));
  assert.ok(kycCard.includes('/api/v1/customers/{id}/documents/confirm'));
  assert.ok(safetyBox.includes('uploadDirectToStorage'));
  assert.ok(safetyBox.includes('/api/v1/disbursements/auction/{auctionId}/confirm-safety-proof'));
  assert.ok(nginxConf.includes('storage/upload/'));
});
