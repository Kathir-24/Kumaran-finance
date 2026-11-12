// ==============================================================================
// Kumaran Chits — Live Server Verification: Lifecycle 10
// Target: Encrypted Storage & Bilingual PDF Canvas (5 Endpoints)
// Target Server: http://127.0.0.1:3000 against live PostgreSQL 17 & MinIO S3
// ==============================================================================

import { execFileSync } from 'child_process';

const ORIGIN = (process.env.API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const BASE_URL = ORIGIN.endsWith('/api/v1') ? ORIGIN : `${ORIGIN}/api/v1`;
const TARGET_DB = process.env.TARGET_DB || 'chitflow_dev';

function queryDb(sql: string): string {
  try {
    return execFileSync(
      'docker',
      ['exec', 'chitflow-db', 'psql', '-U', 'chitflow', '-d', TARGET_DB, '-t', '-A', '-c', sql],
      { encoding: 'utf-8' }
    ).trim();
  } catch (err: any) {
    return `[DB ERROR]: ${err.message}`;
  }
}

async function request(method: string, path: string, body?: any, token?: string, headers?: Record<string, string>) {
  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  let buffer: Buffer | null = null;

  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
    const arrayBuffer = await res.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    data = await res.text().catch(() => null);
  }

  return { status: res.status, contentType, data, buffer, headers: res.headers };
}

async function login(phone: string) {
  queryDb(`UPDATE public."User" SET "isTotpEnabled" = false, "totpSecret" = NULL WHERE phone = '${phone}'`);
  const res = await request('POST', '/auth/web/login', {
    phone,
    password: 'Admin@Kumaran2026',
  });
  if (res.status !== 200 || !res.data?.data?.accessToken) {
    throw new Error(`Login failed for ${phone}: ${JSON.stringify(res.data)}`);
  }
  return {
    token: res.data.data.accessToken as string,
    userId: res.data.data.user.id as string,
  };
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`🚀 STARTING LIVE SERVER E2E: LIFECYCLE 10`);
  console.log(`   ENCRYPTED STORAGE & BILINGUAL PDF CANVAS`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Storage Engine: MinIO S3 (Port 9000, kumaran-chits-private)`);
  console.log(`   Live Database: ${TARGET_DB} (Port 5433)`);
  console.log(`======================================================\n`);

  // Step 0: Authenticate Personas
  console.log(`--- [0/5] Authenticating Personas ---`);
  const admin = await login('9876543210'); // P. Kumaran (Super Admin)
  console.log(`   Super Admin Authenticated: User ID ${admin.userId}`);

  const accountant = await login('9876543213'); // S. Priya (Desk Accountant)
  console.log(`   Desk Accountant Authenticated: User ID ${accountant.userId}`);

  // Fetch test payment ID with receipt
  let paymentId = queryDb(`
    SELECT p.id
    FROM public."Payment" p
    JOIN public."Receipt" r ON r."paymentId" = p.id
    JOIN public."PaymentAllocation" a ON a."paymentId" = p.id
    WHERE p."paymentStatus" = 'SUCCESS'
    ORDER BY p."createdAt" DESC
    LIMIT 1;
  `);

  if (!paymentId || paymentId.startsWith('[DB ERROR]')) {
    // Pick any valid payment and attach a receipt if needed
    paymentId = queryDb(`SELECT id FROM public."Payment" WHERE "paymentStatus" = 'SUCCESS' LIMIT 1;`);
  }
  console.log(`   Using Target Payment ID: ${paymentId}`);

  // Fetch auction ID (Month 2 with winner in DISBURSED status)
  let auctionId = queryDb(`
    SELECT a.id
    FROM public."Auction" a
    JOIN public."AuctionWinner" w ON w."auctionId" = a.id
    WHERE w."disbursementStatus" = 'DISBURSED'
    LIMIT 1;
  `);
  if (!auctionId || auctionId.startsWith('[DB ERROR]')) {
    auctionId = queryDb(`SELECT id FROM public."Auction" LIMIT 1;`);
  }
  console.log(`   Using Target Auction ID: ${auctionId}`);

  // Fetch ticket ID (Ticket #5 of live chit group)
  let ticketId = queryDb(`
    SELECT t.id
    FROM public."SubscriberTicket" t
    JOIN public."ChitGroup" g ON g.id = t."chitGroupId"
    WHERE g."groupCode" = 'KC-LIVE-20M-01' AND t."ticketNumber" = 5
    LIMIT 1;
  `);
  if (!ticketId || ticketId.startsWith('[DB ERROR]')) {
    ticketId = queryDb(`SELECT id FROM public."SubscriberTicket" LIMIT 1;`);
  }
  console.log(`   Using Target Ticket ID: ${ticketId}`);

  let uploadedReceiptKey = '';

  // --------------------------------------------------------------------------
  // Step 1: GET /pdf/receipt/:paymentId (Subscription Receipt PDF)
  // --------------------------------------------------------------------------
  console.log(`\n--- [1/5] GET /pdf/receipt/:paymentId (Bilingual Subscription Receipt PDF) ---`);
  
  // 1A: Direct Binary Stream
  console.log(`   [1A: Binary PDF Stream] Requesting /pdf/receipt/${paymentId} ...`);
  const streamRes = await request('GET', `/pdf/receipt/${paymentId}`, undefined, admin.token);
  console.log(`   Status: ${streamRes.status}`);
  console.log(`   Content-Type: ${streamRes.contentType}`);
  console.log(`   Buffer Size: ${streamRes.buffer?.length} bytes`);

  const isPdfHeader = streamRes.buffer && streamRes.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  console.log(`   Magic Header starts with '%PDF-': ${isPdfHeader}`);

  if (streamRes.status === 200 && streamRes.contentType.includes('application/pdf') && isPdfHeader) {
    console.log(`   ✅ 1A PASSED: Bilingual digital subscription receipt PDF generated and streamed directly.`);
  } else {
    console.error(`   ❌ 1A FAILED:`, streamRes.data || streamRes.buffer);
    process.exit(1);
  }

  // 1B: Presigned Download JSON
  console.log(`\n   [1B: Presigned URL Download] Requesting /pdf/receipt/${paymentId}?download=true ...`);
  const downloadRes = await request('GET', `/pdf/receipt/${paymentId}?download=true`, undefined, admin.token);
  console.log(`   Status: ${downloadRes.status}`);
  console.log(`   S3 Key: ${downloadRes.data?.key}`);
  console.log(`   Presigned URL: ${downloadRes.data?.presignedUrl?.substring(0, 75)}...`);
  console.log(`   Expires In: ${downloadRes.data?.expiresInSeconds}s (15 minutes)`);

  if (downloadRes.status === 200 && downloadRes.data?.key && downloadRes.data?.presignedUrl) {
    uploadedReceiptKey = downloadRes.data.key;
    console.log(`   ✅ 1B PASSED: Presigned S3 download URL returned successfully.`);
  } else {
    console.error(`   ❌ 1B FAILED:`, downloadRes.data);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 2: GET /pdf/voucher/:auctionId (Prize Payout Voucher PDF)
  // --------------------------------------------------------------------------
  console.log(`\n--- [2/5] GET /pdf/voucher/:auctionId (Prize Payout Voucher PDF) ---`);

  // 2A: Direct Binary Stream
  console.log(`   [2A: Binary PDF Stream] Requesting /pdf/voucher/${auctionId} ...`);
  const voucherStream = await request('GET', `/pdf/voucher/${auctionId}`, undefined, admin.token);
  console.log(`   Status: ${voucherStream.status}`);
  console.log(`   Content-Type: ${voucherStream.contentType}`);
  console.log(`   Buffer Size: ${voucherStream.buffer?.length} bytes`);

  const isVoucherPdf = voucherStream.buffer && voucherStream.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  console.log(`   Magic Header starts with '%PDF-': ${isVoucherPdf}`);

  if (voucherStream.status === 200 && voucherStream.contentType.includes('application/pdf') && isVoucherPdf) {
    console.log(`   ✅ 2A PASSED: Bilingual prize payout voucher PDF generated and streamed.`);
  } else {
    console.error(`   ❌ 2A FAILED:`, voucherStream.data || voucherStream.buffer);
    process.exit(1);
  }

  // 2B: Presigned Download JSON
  console.log(`\n   [2B: Presigned URL Download] Requesting /pdf/voucher/${auctionId}?download=true ...`);
  const voucherDownload = await request('GET', `/pdf/voucher/${auctionId}?download=true`, undefined, admin.token);
  console.log(`   Status: ${voucherDownload.status}`);
  console.log(`   S3 Key: ${voucherDownload.data?.key}`);
  console.log(`   Presigned URL: ${voucherDownload.data?.presignedUrl?.substring(0, 75)}...`);

  if (voucherDownload.status === 200 && voucherDownload.data?.key && voucherDownload.data?.presignedUrl) {
    console.log(`   ✅ 2B PASSED: Voucher presigned S3 download URL returned successfully.`);
  } else {
    console.error(`   ❌ 2B FAILED:`, voucherDownload.data);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 3: GET /pdf/minutes/:auctionId (Form XVII Statutory Minutes PDF)
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/5] GET /pdf/minutes/:auctionId (Form XVII Auction Minutes PDF) ---`);

  // 3A: Direct Binary Stream
  console.log(`   [3A: Binary PDF Stream] Requesting /pdf/minutes/${auctionId} ...`);
  const minutesStream = await request('GET', `/pdf/minutes/${auctionId}`, undefined, admin.token);
  console.log(`   Status: ${minutesStream.status}`);
  console.log(`   Content-Type: ${minutesStream.contentType}`);
  console.log(`   Buffer Size: ${minutesStream.buffer?.length} bytes`);

  const isMinutesPdf = minutesStream.buffer && minutesStream.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  console.log(`   Magic Header starts with '%PDF-': ${isMinutesPdf}`);

  if (minutesStream.status === 200 && minutesStream.contentType.includes('application/pdf') && isMinutesPdf) {
    console.log(`   ✅ 3A PASSED: Form XVII statutory auction minutes PDF generated and streamed.`);
  } else {
    console.error(`   ❌ 3A FAILED:`, minutesStream.data || minutesStream.buffer);
    process.exit(1);
  }

  // 3B: Presigned Download JSON
  console.log(`\n   [3B: Presigned URL Download] Requesting /pdf/minutes/${auctionId}?download=true ...`);
  const minutesDownload = await request('GET', `/pdf/minutes/${auctionId}?download=true`, undefined, admin.token);
  console.log(`   Status: ${minutesDownload.status}`);
  console.log(`   S3 Key: ${minutesDownload.data?.key}`);
  console.log(`   Presigned URL: ${minutesDownload.data?.presignedUrl?.substring(0, 75)}...`);

  if (minutesDownload.status === 200 && minutesDownload.data?.key && minutesDownload.data?.presignedUrl) {
    console.log(`   ✅ 3B PASSED: Auction minutes presigned S3 URL returned successfully.`);
  } else {
    console.error(`   ❌ 3B FAILED:`, minutesDownload.data);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 4: GET /pdf/passbook/:ticketId (Form XXI Passbook Statement PDF)
  // --------------------------------------------------------------------------
  console.log(`\n--- [4/5] GET /pdf/passbook/:ticketId (Form XXI Passbook Statement PDF) ---`);

  // 4A: Direct Binary Stream
  console.log(`   [4A: Binary PDF Stream] Requesting /pdf/passbook/${ticketId} ...`);
  const passbookStream = await request('GET', `/pdf/passbook/${ticketId}`, undefined, admin.token);
  console.log(`   Status: ${passbookStream.status}`);
  console.log(`   Content-Type: ${passbookStream.contentType}`);
  console.log(`   Buffer Size: ${passbookStream.buffer?.length} bytes`);

  const isPassbookPdf = passbookStream.buffer && passbookStream.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  console.log(`   Magic Header starts with '%PDF-': ${isPassbookPdf}`);

  if (passbookStream.status === 200 && passbookStream.contentType.includes('application/pdf') && isPassbookPdf) {
    console.log(`   ✅ 4A PASSED: Form XXI continuous passbook statement PDF generated and streamed.`);
  } else {
    console.error(`   ❌ 4A FAILED:`, passbookStream.data || passbookStream.buffer);
    process.exit(1);
  }

  // 4B: Presigned Download JSON
  console.log(`\n   [4B: Presigned URL Download] Requesting /pdf/passbook/${ticketId}?download=true ...`);
  const passbookDownload = await request('GET', `/pdf/passbook/${ticketId}?download=true`, undefined, admin.token);
  console.log(`   Status: ${passbookDownload.status}`);
  console.log(`   S3 Key: ${passbookDownload.data?.key}`);
  console.log(`   Presigned URL: ${passbookDownload.data?.presignedUrl?.substring(0, 75)}...`);

  if (passbookDownload.status === 200 && passbookDownload.data?.key && passbookDownload.data?.presignedUrl) {
    console.log(`   ✅ 4B PASSED: Passbook presigned S3 URL returned successfully.`);
  } else {
    console.error(`   ❌ 4B FAILED:`, passbookDownload.data);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 5: GET /storage/file/*key (Streaming & Path Traversal Protection)
  // --------------------------------------------------------------------------
  console.log(`\n--- [5/5] GET /storage/file/*key (Encrypted File Streaming & Security) ---`);

  // 5A: Stream Real Stored S3 Document (?stream=true forces raw binary egress in S3 mode)
  if (uploadedReceiptKey) {
    console.log(`   [5A: Authenticated S3 Document Stream] Requesting /storage/file/${uploadedReceiptKey}?stream=true ...`);
    const fileRes = await request('GET', `/storage/file/${uploadedReceiptKey}?stream=true`, undefined, admin.token);
    console.log(`   Status: ${fileRes.status}`);
    console.log(`   Content-Type: ${fileRes.contentType}`);
    console.log(`   Buffer Size: ${fileRes.buffer?.length} bytes`);

    const isS3Pdf = fileRes.buffer && fileRes.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    console.log(`   Magic Header starts with '%PDF-': ${isS3Pdf}`);

    if (fileRes.status === 200 && isS3Pdf) {
      console.log(`   ✅ 5A PASSED: Stored S3 document binary stream downloaded and validated.`);
    } else {
      console.error(`   ❌ 5A FAILED:`, fileRes.data || fileRes.buffer);
      process.exit(1);
    }
  }

  // 5B: Security Check — Path Traversal Attack Defense
  console.log(`\n   [5B: Path Traversal Attack Defense] Requesting /storage/file/..%2F..%2Fetc%2Fpasswd ...`);
  const traversalRes = await request('GET', `/storage/file/..%2F..%2Fetc%2Fpasswd`, undefined, admin.token);
  console.log(`   Status: ${traversalRes.status}`);
  const errorMessage = traversalRes.data?.error?.message || traversalRes.data?.message || JSON.stringify(traversalRes.data);
  console.log(`   Error Message: ${errorMessage}`);

  if (traversalRes.status === 400 && String(errorMessage).includes('Path traversal detected')) {
    console.log(`   ✅ 5B PASSED: Path traversal attack strictly blocked with HTTP 400 Bad Request.`);
  } else {
    console.error(`   ❌ 5B FAILED: Path traversal was not properly blocked! Status: ${traversalRes.status}`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`🎉 LIFECYCLE 10 LIVE VERIFICATION PASSED (100% SUCCESS)`);
  console.log(`   All 5 Endpoints fully verified against live NestJS, MinIO S3 & PDFKit`);
  console.log(`   Digital receipts, vouchers, minutes, passbooks & anti-traversal verified.`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error('Fatal execution error in verify-lifecycle-10:', err);
  process.exit(1);
});
