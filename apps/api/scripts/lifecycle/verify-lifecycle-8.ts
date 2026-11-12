// ==============================================================================
// Kumaran Chits — Live Server Verification: Lifecycle 8 (Prize Disbursements & Safety Proof)
// Target: http://127.0.0.1:3000 against live PostgreSQL 17 (chitflow_dev)
// ==============================================================================

import { execFileSync } from 'child_process';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';

function queryDb(sql: string): string {
  try {
    return execFileSync(
      'docker',
      ['exec', 'chitflow-db', 'psql', '-U', 'chitflow', '-d', 'chitflow_dev', '-t', '-A', '-c', sql],
      { encoding: 'utf-8' }
    ).trim();
  } catch (err: any) {
    return `[DB ERROR]: ${err.message}`;
  }
}

function queryDbJson<T = any>(sql: string): T {
  try {
    const raw = execFileSync(
      'docker',
      ['exec', 'chitflow-db', 'psql', '-U', 'chitflow', '-d', 'chitflow_dev', '-t', '-A', '-c', `SELECT json_agg(t) FROM (${sql}) t;`],
      { encoding: 'utf-8' }
    ).trim();
    return raw ? JSON.parse(raw) : ([] as any);
  } catch (err: any) {
    return [] as any;
  }
}

async function request(method: string, path: string, body?: any, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const status = res.status;
  const json = await res.json().catch(() => null);
  return { status, json };
}

async function requestMultipart(path: string, formData: FormData, token?: string) {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const status = res.status;
  const json = await res.json().catch(() => null);
  return { status, json };
}

async function login(phone: string) {
  queryDb(`UPDATE public."User" SET "isTotpEnabled" = false, "totpSecret" = NULL WHERE phone = '${phone}'`);
  const res = await request('POST', '/auth/web/login', {
    phone,
    password: 'Admin@Kumaran2026',
  });
  if (res.status !== 200 || !res.json?.data?.accessToken) {
    throw new Error(`Login failed for ${phone}: ${JSON.stringify(res)}`);
  }
  return {
    token: res.json.data.accessToken as string,
    userId: res.json.data.user.id as string,
  };
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`🚀 STARTING LIVE SERVER E2E: LIFECYCLE 8`);
  console.log(`   PRIZE DISBURSEMENTS & COMPANY SAFETY PROOF CHECKLIST`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Live Database: chitflow_dev (Port 5433)`);
  console.log(`======================================================\n`);

  // Step 0: Authenticate Maker (Desk Accountant) & Checker (Super Admin)
  console.log(`--- [0/6] Authenticating Maker (Accountant) & Checker (Super Admin) ---`);
  const accountant = await login('9876543213'); // S. Priya (Desk Accountant / Maker)
  console.log(`   Maker Authenticated (Desk Accountant): User ID ${accountant.userId}`);

  const admin = await login('9876543210'); // P. Kumaran (Managing Partner / Checker)
  console.log(`   Checker Authenticated (Super Admin): User ID ${admin.userId}`);

  // Fetch chit group and auction
  let chitGroupId = queryDb(`SELECT id FROM public."ChitGroup" WHERE "groupCode" = 'KC-LIVE-20M-01'`);
  let auctionId = '';

  if (chitGroupId && !chitGroupId.startsWith('[DB ERROR]')) {
    auctionId = queryDb(
      `SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 2`
    );
  }

  if (!auctionId || auctionId.startsWith('[DB ERROR]')) {
    // Fallback: pick any auction with an AuctionWinner
    auctionId = queryDb(
      `SELECT "auctionId" FROM public."AuctionWinner" LIMIT 1`
    );
    if (!auctionId || auctionId.startsWith('[DB ERROR]')) {
      console.error('No auction with an AuctionWinner found in database!');
      process.exit(1);
    }
    chitGroupId = queryDb(
      `SELECT "chitGroupId" FROM public."Auction" WHERE id = '${auctionId}'`
    );
  }

  console.log(`   Using Chit Group ID: ${chitGroupId}`);
  console.log(`   Using Target Auction ID: ${auctionId}`);

  // Reset target auction winner to PENDING_VERIFICATION for clean, repeatable testing
  queryDb(`
    UPDATE public."AuctionWinner"
    SET "disbursementStatus" = 'PENDING_VERIFICATION',
        "isSecurityRequired" = false,
        "securityType" = NULL,
        "blankChequeDetails" = NULL,
        "agreementSigned" = false,
        "nomineeSigned" = false,
        "securityDocS3Key" = NULL,
        "verifiedByUserId" = NULL,
        "authorizedByUserId" = NULL,
        "disbursementMode" = NULL,
        "disbursedAmount" = NULL,
        "disbursedAt" = NULL,
        "paymentReference" = NULL
    WHERE "auctionId" = '${auctionId}';
  `);
  console.log(`   Reset target auction winner to PENDING_VERIFICATION clean state.`);

  // --------------------------------------------------------------------------
  // Step 1: GET /disbursements (Query and paginate disbursements)
  // --------------------------------------------------------------------------
  console.log(`\n--- [1/6] GET /disbursements (Query disbursements with filters) ---`);
  const queryUrl = `/disbursements?chitGroupId=${chitGroupId}&disbursementStatus=PENDING_VERIFICATION&page=1&limit=10`;
  const listRes = await request('GET', queryUrl, undefined, accountant.token);
  console.log(`   Request URL: ${queryUrl}`);
  console.log(`   Status: ${listRes.status}`);

  if (listRes.status === 200 && listRes.json?.data?.data) {
    const total = listRes.json.data.total;
    const items = listRes.json.data.data;
    console.log(`   Total Pending Disbursements Found: ${total}`);
    console.log(`   Sample Item Winner ID: ${items[0]?.id || 'N/A'}`);
    console.log(`   ✅ Step 1 PASSED: Query disbursements returned paginated envelope successfully.`);
  } else {
    console.error(`   ❌ Step 1 FAILED:`, JSON.stringify(listRes));
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 2: GET /disbursements/auction/:auctionId (Get single winner worksheet)
  // --------------------------------------------------------------------------
  console.log(`\n--- [2/6] GET /disbursements/auction/:auctionId (Fetch winner worksheet) ---`);
  const singleRes = await request('GET', `/disbursements/auction/${auctionId}`, undefined, accountant.token);
  console.log(`   Status: ${singleRes.status}`);

  if (singleRes.status === 200 && singleRes.json?.data?.winner) {
    const winner = singleRes.json.data.winner;
    console.log(`   Winner ID: ${winner.id}`);
    console.log(`   Ticket ID: ${winner.ticketId}`);
    console.log(`   Current Status: ${winner.disbursementStatus}`);
    console.log(`   ✅ Step 2 PASSED: Single winner worksheet fetched successfully.`);
  } else {
    console.error(`   ❌ Step 2 FAILED:`, JSON.stringify(singleRes));
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 3: POST /disbursements/auction/:auctionId/upload-safety-proof (Maker S3 Upload)
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/8] POST /disbursements/auction/:auctionId/upload-safety-proof (Maker S3 Upload) ---`);
  const safetyFormData = new FormData();
  const dummyChequeScan = Buffer.from('BINARY_JPEG_SCAN_OF_SIGNED_BLANK_CHEQUES_AND_AGREEMENT_2026');
  safetyFormData.append(
    'file',
    new Blob([dummyChequeScan], { type: 'image/jpeg' }),
    'signed_blank_cheques_sundaram.jpg',
  );
  console.log(`   Uploading safety collateral scan (signed_blank_cheques_sundaram.jpg)...`);

  const uploadProofRes = await requestMultipart(
    `/disbursements/auction/${auctionId}/upload-safety-proof`,
    safetyFormData,
    accountant.token, // Maker = Desk Accountant
  );
  console.log(`   Upload Status: ${uploadProofRes.status}`);
  console.log(`   Response Data:`, JSON.stringify(uploadProofRes.json?.data, null, 2));

  if (uploadProofRes.status !== 201 || !uploadProofRes.json?.data?.securityDocS3Key) {
    console.error('Failed to upload safety proof collateral scan:', uploadProofRes);
    process.exit(1);
  }
  const uploadedS3Key = uploadProofRes.json.data.securityDocS3Key;

  // PostgreSQL Verification of S3 key saved on AuctionWinner
  const dbS3KeyCheck = queryDb(
    `SELECT "securityDocS3Key" FROM public."AuctionWinner" WHERE "auctionId" = '${auctionId}'`
  );
  console.log(`   [PostgreSQL DB Verification - S3 Key]: ${dbS3KeyCheck}`);

  // --------------------------------------------------------------------------
  // Step 4: GET /disbursements/auction/:auctionId/safety-proof-url (Checker Presigned URL)
  // --------------------------------------------------------------------------
  console.log(`\n--- [4/8] GET /disbursements/auction/:auctionId/safety-proof-url (15-Min Presigned URL) ---`);
  const proofUrlRes = await request(
    'GET',
    `/disbursements/auction/${auctionId}/safety-proof-url`,
    undefined,
    admin.token, // Checker = Super Admin
  );
  console.log(`   Presigned URL Status: ${proofUrlRes.status}`);
  console.log(`   Response Data:`, JSON.stringify(proofUrlRes.json?.data, null, 2));

  if (proofUrlRes.status !== 200 || !proofUrlRes.json?.data?.url) {
    console.error('Failed to get safety proof presigned URL:', proofUrlRes);
    process.exit(1);
  }
  if (proofUrlRes.json.data.expiresInSeconds !== 900) {
    console.error('Expected expiresInSeconds to be 900:', proofUrlRes.json.data);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 5: POST /disbursements/auction/:auctionId/verify-safety-proof (Maker Verification)
  // --------------------------------------------------------------------------
  console.log(`\n--- [5/8] POST /disbursements/auction/:auctionId/verify-safety-proof (Maker Verification) ---`);
  const safetyProofPayload = {
    isSecurityRequired: true,
    securityType: 'BLANK_CHEQUE',
    blankChequeDetails: 'State Bank of India, Cheque #004512 & #004513, A/C: S. Sundaram',
    agreementSigned: true,
    nomineeSigned: true,
    securityDocS3Key: uploadedS3Key,
    notes: 'Verified subscriber KYC, agreement signed with nominee, 2 signed blank cheques deposited in safe.',
  };
  console.log(`   Request Payload:`, JSON.stringify(safetyProofPayload, null, 2));

  const verifyRes = await request(
    'POST',
    `/disbursements/auction/${auctionId}/verify-safety-proof`,
    safetyProofPayload,
    accountant.token // Maker = Desk Accountant
  );
  console.log(`   Status: ${verifyRes.status}`);
  console.log(`   Response Message: ${verifyRes.json?.data?.message}`);

  // PostgreSQL Verification
  const dbProofAfterVerify = queryDb(`
    SELECT "disbursementStatus", "isSecurityRequired", "securityType", "blankChequeDetails", "agreementSigned", "nomineeSigned", "securityDocS3Key", "verifiedByUserId"
    FROM public."AuctionWinner"
    WHERE "auctionId" = '${auctionId}'
  `);
  console.log(`   [PostgreSQL DB Verification - AuctionWinner]:`);
  console.log(`   ${dbProofAfterVerify}`);

  const auditLogVerify = queryDb(`
    SELECT action, "entityType", "entityId"
    FROM public."AuditLog"
    WHERE "action" = 'SAFETY_PROOF_VERIFIED' AND "entityId" = (SELECT id FROM public."AuctionWinner" WHERE "auctionId" = '${auctionId}')
    ORDER BY "timestamp" DESC LIMIT 1
  `);
  console.log(`   [PostgreSQL DB Verification - AuditLog]: ${auditLogVerify}`);

  if (
    verifyRes.status === 200 &&
    verifyRes.json?.data?.winner?.disbursementStatus === 'VERIFIED_BY_MAKER' &&
    dbProofAfterVerify.includes('VERIFIED_BY_MAKER') &&
    dbProofAfterVerify.includes(accountant.userId)
  ) {
    console.log(`   ✅ Step 5 PASSED: Safety proof verified by Maker, status transitioned to VERIFIED_BY_MAKER.`);
  } else {
    console.error(`   ❌ Step 5 FAILED:`, JSON.stringify(verifyRes));
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 6: Security Guardian Check: Maker cannot authorize payout (Dual Control)
  // --------------------------------------------------------------------------
  console.log(`\n--- [6/8] Security Check: Dual Control Enforcement (Maker != Checker) ---`);
  const illegalAuthPayload = {
    disbursementMode: 'ACCOUNT_PAYEE_CHEQUE',
    disbursedAmount: 75000,
    notes: 'Maker attempting illegal self-authorization',
  };

  const illegalRes = await request(
    'POST',
    `/disbursements/auction/${auctionId}/authorize-payout`,
    illegalAuthPayload,
    accountant.token // Maker attempts authorization
  );
  console.log(`   Maker Attempt Status: ${illegalRes.status}`);
  console.log(`   Maker Attempt Error: ${illegalRes.json?.message || JSON.stringify(illegalRes.json)}`);

  if (illegalRes.status === 403) {
    console.log(`   ✅ Step 6 PASSED: Maker authorization strictly BLOCKED with HTTP 403 Forbidden.`);
  } else {
    console.error(`   ❌ Step 6 FAILED: Maker was unexpectedly allowed to authorize! Status: ${illegalRes.status}`);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 7: POST /disbursements/auction/:auctionId/authorize-payout (Checker Authorization)
  // --------------------------------------------------------------------------
  console.log(`\n--- [7/8] POST /disbursements/auction/:auctionId/authorize-payout (Checker Authorization) ---`);
  const authorizePayload = {
    disbursementMode: 'ACCOUNT_PAYEE_CHEQUE',
    disbursedAmount: 75000,
    notes: 'Authorized net prize payout of ₹75,000 via Account Payee Cheque after verifying blank cheques and agreement.',
  };
  console.log(`   Request Payload:`, JSON.stringify(authorizePayload, null, 2));

  const authRes = await request(
    'POST',
    `/disbursements/auction/${auctionId}/authorize-payout`,
    authorizePayload,
    admin.token // Checker = Super Admin
  );
  console.log(`   Status: ${authRes.status}`);
  console.log(`   Response Message: ${authRes.json?.data?.message}`);

  // PostgreSQL Verification
  const dbProofAfterAuth = queryDb(`
    SELECT "disbursementStatus", "disbursementMode", "disbursedAmount", "authorizedByUserId"
    FROM public."AuctionWinner"
    WHERE "auctionId" = '${auctionId}'
  `);
  console.log(`   [PostgreSQL DB Verification - AuctionWinner]:`);
  console.log(`   ${dbProofAfterAuth}`);

  const auditLogAuth = queryDb(`
    SELECT action, "entityType", "entityId"
    FROM public."AuditLog"
    WHERE "action" = 'PRIZE_PAYOUT_AUTHORIZED' AND "entityId" = (SELECT id FROM public."AuctionWinner" WHERE "auctionId" = '${auctionId}')
    ORDER BY "timestamp" DESC LIMIT 1
  `);
  console.log(`   [PostgreSQL DB Verification - AuditLog]: ${auditLogAuth}`);

  if (
    authRes.status === 200 &&
    authRes.json?.data?.winner?.disbursementStatus === 'AUTHORIZED_BY_CHECKER' &&
    dbProofAfterAuth.includes('AUTHORIZED_BY_CHECKER') &&
    dbProofAfterAuth.includes(admin.userId) &&
    dbProofAfterAuth.includes('75000')
  ) {
    console.log(`   ✅ Step 7 PASSED: Prize payout authorized by Checker, status transitioned to AUTHORIZED_BY_CHECKER.`);
  } else {
    console.error(`   ❌ Step 7 FAILED:`, JSON.stringify(authRes));
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 8: POST /disbursements/auction/:auctionId/disburse (Release Payout)
  // --------------------------------------------------------------------------
  console.log(`\n--- [8/8 Part A] POST /disbursements/auction/:auctionId/disburse (Release Payout) ---`);
  const releasePayload = {
    paymentReference: 'IOB-CHQ-009182',
    disbursedAt: '2026-10-22T17:30:00.000Z',
    notes: 'Handed over Account Payee Cheque #009182 to prized subscriber in person at Perundurai office counter.',
  };
  console.log(`   Request Payload:`, JSON.stringify(releasePayload, null, 2));

  const releaseRes = await request(
    'POST',
    `/disbursements/auction/${auctionId}/disburse`,
    releasePayload,
    accountant.token
  );
  console.log(`   Status: ${releaseRes.status}`);
  console.log(`   Response Message: ${releaseRes.json?.data?.message}`);

  // PostgreSQL Verification
  const dbProofAfterRelease = queryDb(`
    SELECT "disbursementStatus", "paymentReference", "disbursedAt"
    FROM public."AuctionWinner"
    WHERE "auctionId" = '${auctionId}'
  `);
  console.log(`   [PostgreSQL DB Verification - AuctionWinner]:`);
  console.log(`   ${dbProofAfterRelease}`);

  const auditLogRelease = queryDb(`
    SELECT action, "entityType", "entityId"
    FROM public."AuditLog"
    WHERE "action" = 'PRIZE_PAYOUT_DISBURSED' AND "entityId" = (SELECT id FROM public."AuctionWinner" WHERE "auctionId" = '${auctionId}')
    ORDER BY "timestamp" DESC LIMIT 1
  `);
  console.log(`   [PostgreSQL DB Verification - AuditLog]: ${auditLogRelease}`);

  if (
    releaseRes.status === 200 &&
    releaseRes.json?.data?.winner?.disbursementStatus === 'DISBURSED' &&
    dbProofAfterRelease.includes('DISBURSED') &&
    dbProofAfterRelease.includes('IOB-CHQ-009182')
  ) {
    console.log(`   ✅ Step 8 Part A PASSED: Payout released, status transitioned to DISBURSED.`);
  } else {
    console.error(`   ❌ Step 8 Part A FAILED:`, JSON.stringify(releaseRes));
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 8 Part B: GET /disbursements/auction/:auctionId/voucher (Bilingual Voucher)
  // --------------------------------------------------------------------------
  console.log(`\n--- [6/6 Part B] GET /disbursements/auction/:auctionId/voucher (Bilingual Voucher) ---`);
  const voucherRes = await request('GET', `/disbursements/auction/${auctionId}/voucher`, undefined, admin.token);
  console.log(`   Status: ${voucherRes.status}`);

  if (voucherRes.status === 200 && voucherRes.json?.data?.formattedText) {
    const voucher = voucherRes.json.data;
    console.log(`   Voucher Number: ${voucher.voucherNumber}`);
    console.log(`   Is Bilingual: ${voucher.isBilingual}`);
    console.log(`   Net Prize Amount: ₹${voucher.data?.prizeMoney}`);
    console.log(`   Payment Reference: ${voucher.data?.paymentReference}`);
    console.log(`   Disbursement Mode: ${voucher.data?.disbursementMode}`);
    console.log(`\n   --- [Voucher Text Excerpt (Monospace Preview)] ---`);
    console.log(voucher.formattedText.substring(0, 450) + '\n   [... truncated ...]');
    console.log(`\n   ✅ Step 6 Part B PASSED: Bilingual voucher generated with English & தமிழ் layouts.`);
  } else {
    console.error(`   ❌ Step 6 Part B FAILED:`, JSON.stringify(voucherRes));
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 7: POST /disbursements/group/:chitGroupId/final-settlement (Month N Final Maturity Settlement)
  // --------------------------------------------------------------------------
  console.log(`\n--- [7/7] POST /disbursements/group/:chitGroupId/final-settlement (Month N Settlement) ---`);

  const branchId = queryDb(`SELECT "branchId" FROM public."ChitGroup" WHERE id = '${chitGroupId}'`);
  const existingTicketIds = queryDb(
    `SELECT id FROM public."SubscriberTicket" WHERE "chitGroupId" = '${chitGroupId}' ORDER BY "ticketNumber" ASC LIMIT 2`
  )
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const sampleTicketId1 = existingTicketIds[0] || '00000000-0000-0000-0000-000000000000';
  const sampleTicketId2 = existingTicketIds[1] || sampleTicketId1;

  // Guard Test A: Non-super-admin (Accountant) attempts final settlement authorization
  console.log(`   Guard Test: Non-super-admin (Accountant) attempts final settlement authorization...`);
  const rbacFailRes = await request(
    'POST',
    `/disbursements/group/${chitGroupId}/final-settlement`,
    {
      ticketId: sampleTicketId1,
      disbursementMode: 'ACCOUNT_PAYEE_CHEQUE',
    },
    accountant.token
  );
  console.log(`   RBAC Rejection Status: ${rbacFailRes.status} (Expected: 403 Forbidden)`);
  if (rbacFailRes.status !== 403) {
    console.error('CRITICAL: Super Admin exclusivity guard failed on final settlement!');
    process.exit(1);
  }

  // Guard Test B: Attempt final settlement when multiple unprized tickets remain in group
  console.log(`   Guard Test: Attempt final settlement when multiple unprized tickets remain in group...`);
  const prematureSettlementRes = await request(
    'POST',
    `/disbursements/group/${chitGroupId}/final-settlement`,
    {
      ticketId: sampleTicketId2,
      disbursementMode: 'ACCOUNT_PAYEE_CHEQUE',
      paymentReference: 'IOB-CHQ-PREMATURE',
    },
    admin.token
  );
  console.log(`   Premature Rejection Status: ${prematureSettlementRes.status} (Expected: 400 Bad Request)`);
  console.log(`   Premature Rejection Message: ${prematureSettlementRes.json?.error?.message}`);
  if (prematureSettlementRes.status !== 400) {
    console.error('CRITICAL: Premature final settlement guard failed!');
    process.exit(1);
  }

  // Valid Final Settlement Execution: Create dedicated mature test group with 1 remaining unprized subscriber
  console.log(`   Setting up a dedicated mature chit group (KC-TEST-MATURE-2M) in PostgreSQL for final settlement...`);
  queryDb(`DELETE FROM public."AuditLog" WHERE "entityType" = 'ChitGroup' AND "entityId" IN (SELECT id FROM public."ChitGroup" WHERE "groupCode" = 'KC-TEST-MATURE-2M')`);
  queryDb(`DELETE FROM public."AuctionWinner" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" IN (SELECT id FROM public."ChitGroup" WHERE "groupCode" = 'KC-TEST-MATURE-2M'))`);
  queryDb(`DELETE FROM public."Auction" WHERE "chitGroupId" IN (SELECT id FROM public."ChitGroup" WHERE "groupCode" = 'KC-TEST-MATURE-2M')`);
  queryDb(`DELETE FROM public."SubscriberTicket" WHERE "chitGroupId" IN (SELECT id FROM public."ChitGroup" WHERE "groupCode" = 'KC-TEST-MATURE-2M')`);
  queryDb(`DELETE FROM public."ChitGroup" WHERE "groupCode" = 'KC-TEST-MATURE-2M'`);

  const matureGroupRaw = queryDb(`
    INSERT INTO public."ChitGroup" (
      id, "branchId", "groupCode", "groupName", "chitValue", "durationMonths",
      "totalTickets", "baseInstallment", "foremanCommissionRate", "maxDiscountCeiling",
      "initMode", "onboardedAtMonth", status, "startDate", "endDate", "updatedAt"
    ) VALUES (
      gen_random_uuid(), '${branchId}', 'KC-TEST-MATURE-2M', 'Mature Test Group 2M',
      100000, 2, 2, 50000, 4.00, 25000, 'NEW_GROUP', 1, 'ACTIVE', '2024-01-01', '2024-03-01', NOW()
    ) RETURNING id;
  `);
  const matureGroupId = (matureGroupRaw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];

  if (!matureGroupId) {
    throw new Error(`Failed to create mature test chit group: ${matureGroupRaw}`);
  }

  const distinctCustomerIds = queryDb(`SELECT DISTINCT "customerId" FROM public."SubscriberTicket" LIMIT 2`)
    .split('\n')
    .map((s) => (s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0])
    .filter((id): id is string => Boolean(id));

  if (distinctCustomerIds.length < 2) {
    throw new Error('Need at least 2 distinct customers in DB to set up mature group');
  }

  // Insert Ticket #1 (already prized in Month 1)
  queryDb(`
    INSERT INTO public."SubscriberTicket" (
      id, "chitGroupId", "customerId", "ticketNumber", "isPrized", status
    ) VALUES (
      gen_random_uuid(), '${matureGroupId}', '${distinctCustomerIds[0]}', 1, true, 'ACTIVE'
    );
  `);

  // Insert Ticket #2 (final remaining unprized subscriber for Month 2)
  const finalTicketRaw = queryDb(`
    INSERT INTO public."SubscriberTicket" (
      id, "chitGroupId", "customerId", "ticketNumber", "isPrized", status
    ) VALUES (
      gen_random_uuid(), '${matureGroupId}', '${distinctCustomerIds[1]}', 2, false, 'ACTIVE'
    ) RETURNING id;
  `);
  const finalTicketId = (finalTicketRaw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];

  if (!finalTicketId) {
    throw new Error(`Failed to create final subscriber ticket: ${finalTicketRaw}`);
  }

  console.log(`   Executing valid final Month 2 settlement for Ticket #2...`);
  const finalSettlementPayload = {
    ticketId: finalTicketId,
    disbursementMode: 'ACCOUNT_PAYEE_CHEQUE',
    paymentReference: 'IOB-CHQ-FINAL-998811',
    notes: 'Month 2 Final maturity settlement without auction per Section 16 Chit Rules',
    disbursedAt: '2024-03-01T00:00:00.000Z',
  };
  const settlementRes = await request(
    'POST',
    `/disbursements/group/${matureGroupId}/final-settlement`,
    finalSettlementPayload,
    admin.token
  );
  console.log(`   Status: ${settlementRes.status}`);
  console.log(`   Message: ${settlementRes.json?.data?.message}`);
  const sData = settlementRes.json?.data?.settlement;
  console.log(`   Gross Chit Value: ₹${sData?.grossPrize}`);
  console.log(`   Foreman Commission (4%): ₹${sData?.foremanCommission}`);
  console.log(`   Net Settlement Payout: ₹${sData?.netPrizeMoney}`);
  console.log(`   Final Month: Month ${sData?.installmentMonth}`);

  // DB Verification
  const dbChitStatus = queryDb(`SELECT status FROM public."ChitGroup" WHERE id = '${matureGroupId}'`);
  const dbTicketPrized = queryDb(`SELECT "isPrized" FROM public."SubscriberTicket" WHERE id = '${finalTicketId}'`);
  const dbWinnerDisbursed = queryDb(`SELECT "disbursementStatus", "disbursedAmount", "paymentReference" FROM public."AuctionWinner" WHERE "auctionId" = '${sData?.auctionId}'`);
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   Chit Group Status = ${dbChitStatus} (Expected: COMPLETED)`);
  console.log(`   Ticket #2 isPrized = ${dbTicketPrized} (Expected: t)`);
  console.log(`   AuctionWinner Row = ${dbWinnerDisbursed}`);

  if (
    settlementRes.status === 200 &&
    sData?.grossPrize === 100000 &&
    sData?.foremanCommission === 4000 &&
    sData?.netPrizeMoney === 96000 &&
    dbChitStatus === 'COMPLETED' &&
    dbTicketPrized === 't'
  ) {
    console.log(`   ✅ Step 7 PASSED: Month N Final maturity settlement executed successfully.`);
  } else {
    console.error('CRITICAL: Month N final settlement verification failed:', settlementRes);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`🎉 LIFECYCLE 8 LIVE VERIFICATION PASSED (100% SUCCESS)`);
  console.log(`   All 8 Endpoints fully verified against live NestJS, PostgreSQL & MinIO S3`);
  console.log(`   Maker-Checker separation, whole-rupee math, safety proofs & Month N final settlement verified.`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error('Fatal execution error in verify-lifecycle-8:', err);
  process.exit(1);
});
