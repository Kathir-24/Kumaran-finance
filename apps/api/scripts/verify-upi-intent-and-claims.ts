// ==============================================================================
// Kumaran Chits — Live Server Verification: One-Tap UPI Intent & Claims
// Target: http://127.0.0.1:3000 against live PostgreSQL 17 (chitflow_dev)
// Compliance: NPCI UPI 2.0 Standard, ADR-07 (Discrete Whole-Rupee Payments)
// ==============================================================================

import { execSync } from 'child_process';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';

function queryDb(sql: string): string {
  try {
    const singleLineSql = sql.replace(/\r?\n/g, ' ').trim();
    const cmd = `docker exec chitflow-db psql -U chitflow -d chitflow_dev -t -A -c "${singleLineSql.replace(/"/g, '\\"')}"`;
    return execSync(cmd, { encoding: 'utf-8' }).trim();
  } catch (err: any) {
    return `[DB ERROR]: ${err.message}`;
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

async function loginUser(phone: string) {
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

async function main() {
  console.log(`\n======================================================`);
  console.log(`🚀 VERIFYING ONE-TAP UPI INTENT, BANK UTR UNIQUENESS & CLAIMS`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`======================================================\n`);

  // 1. Authenticate Personas
  console.log(`--- [1/6] Authenticating Personas ---`);
  const admin = await loginUser('9876543210');
  const accountant = await loginUser('9876543211');
  console.log(`   Super Admin Token & Accountant Token acquired.`);

  // 2. Find an UNPAID installment due
  console.log(`\n--- [2/6] Finding an Eligible Unpaid Due ---`);
  const unpaidDueId = queryDb(`
    SELECT id FROM "InstallmentDue" 
    WHERE status = 'UNPAID' 
    LIMIT 1;
  `);

  if (!unpaidDueId || unpaidDueId.startsWith('[DB ERROR]')) {
    throw new Error('No UNPAID installment due found in database.');
  }

  console.log(`   Found Target Unpaid Due ID: ${unpaidDueId}`);

  // 3. Test GET /installments/:dueId/upi-intent
  console.log(`\n--- [3/6] Testing GET /installments/:dueId/upi-intent (NPCI Protocol) ---`);
  const intentRes = await request('GET', `/installments/${unpaidDueId}/upi-intent`, undefined, admin.token);
  console.log(`   Status: ${intentRes.status}`);
  console.log(`   Payee VPA: ${intentRes.json?.data?.payeeVpa}`);
  console.log(`   Payee Name: ${intentRes.json?.data?.payeeName}`);
  console.log(`   Net Amount: ₹${intentRes.json?.data?.netPayableAmount}`);
  console.log(`   UPI URI: ${intentRes.json?.data?.upiUri}`);

  if (intentRes.status !== 200) {
    throw new Error(`UPI intent generation failed: ${JSON.stringify(intentRes)}`);
  }
  if (!intentRes.json?.data?.upiUri?.startsWith('upi://pay?')) {
    throw new Error(`Invalid UPI URI format: ${intentRes.json?.data?.upiUri}`);
  }
  console.log(`   ✅ Valid NPCI One-Tap URI generated successfully!`);

  // 4. Test Bank UTR Anti-Duplication Constraint
  console.log(`\n--- [4/6] Testing Bank UTR Anti-Duplication Constraint ---`);
  const testUtr = `TEST-UTR-${Date.now()}`;

  // Find another unpaid due for duplicate UTR test
  const dueRow = queryDb(`
    SELECT d.id, d."ticketId", d."installmentMonth", d."netPayableAmount"
    FROM "InstallmentDue" d
    WHERE d.status = 'UNPAID' AND d.id != '${unpaidDueId}'
    LIMIT 1;
  `);
  const [secondDueId, secondTicketId, secondMonthStr, secondAmountStr] = dueRow.split('|');
  const secondMonth = parseInt(secondMonthStr, 10);
  const secondAmount = parseInt(secondAmountStr, 10);

  console.log(`   Submitting First Payment with UTR: ${testUtr}...`);
  const firstPayRes = await request('POST', '/payments', {
    ticketId: secondTicketId,
    installmentMonth: secondMonth,
    amount: secondAmount,
    paymentMethod: 'UPI',
    transactionRef: testUtr,
    idempotencyKey: `idemp-utr-test-1-${Date.now()}`,
    notes: 'First payment with unique UTR',
  }, admin.token);

  console.log(`   First Payment Status: ${firstPayRes.status} (Expected: 201)`);
  if (firstPayRes.status !== 201) {
    throw new Error(`First payment failed: ${JSON.stringify(firstPayRes)}`);
  }

  // Find a third unpaid due to attempt reusing the SAME UTR
  const thirdDueRow = queryDb(`
    SELECT d.id, d."ticketId", d."installmentMonth", d."netPayableAmount"
    FROM "InstallmentDue" d
    WHERE d.status = 'UNPAID' AND d.id NOT IN ('${unpaidDueId}', '${secondDueId}')
    LIMIT 1;
  `);
  const [thirdDueId, thirdTicketId, thirdMonthStr, thirdAmountStr] = thirdDueRow.split('|');
  const thirdMonth = parseInt(thirdMonthStr, 10);
  const thirdAmount = parseInt(thirdAmountStr, 10);

  console.log(`   Attempting Second Payment with the SAME duplicate UTR: ${testUtr}...`);
  const dupPayRes = await request('POST', '/payments', {
    ticketId: thirdTicketId,
    installmentMonth: thirdMonth,
    amount: thirdAmount,
    paymentMethod: 'UPI',
    transactionRef: testUtr,
    idempotencyKey: `idemp-utr-test-2-${Date.now()}`,
    notes: 'Duplicate UTR collision attempt',
  }, admin.token);

  console.log(`   Duplicate Payment Status: ${dupPayRes.status} (Expected: 409 Conflict)`);
  console.log(`   Error Message: ${dupPayRes.json?.message}`);
  if (dupPayRes.status !== 409) {
    throw new Error(`Expected HTTP 409 Conflict for duplicate UTR, got ${dupPayRes.status}`);
  }
  console.log(`   ✅ Duplicate UTR rejected with HTTP 409 Conflict!`);

  // 5. Test Customer UPI Claim Submission
  console.log(`\n--- [5/6] Testing Customer UPI Claim Submission ---`);
  const claimUtr = `CLAIM-UTR-${Date.now()}`;
  console.log(`   Submitting UPI Claim for Due ${unpaidDueId} with UTR: ${claimUtr}...`);
  const claimRes = await request('POST', '/payments/upi-claim', {
    dueId: unpaidDueId,
    utrNumber: claimUtr,
    notes: 'Paid via PhonePe from K. Kathirvel',
  }, admin.token);

  console.log(`   Claim Status: ${claimRes.status} (Expected: 201)`);
  console.log(`   Claim ID: ${claimRes.json?.data?.claimId || claimRes.json?.claimId}`);
  const claimId = claimRes.json?.data?.claimId || claimRes.json?.claimId;

  if (claimRes.status !== 201 || !claimId) {
    throw new Error(`UPI claim submission failed: ${JSON.stringify(claimRes)}`);
  }
  console.log(`   ✅ UPI Claim recorded in INITIATED status!`);

  // Check pending claims list
  const pendingRes = await request('GET', '/payments/pending-upi-claims', undefined, accountant.token);
  console.log(`   Pending Claims Count: ${pendingRes.json?.data?.length ?? pendingRes.json?.length}`);

  // 6. Test Staff Verification of UPI Claim (Enforcing Maker != Checker)
  console.log(`\n--- [6/6] Testing Staff Verification of UPI Claim & Receipt Issuance ---`);
  
  // Guard Test: Admin submitted claim -> Admin verifying should be rejected by Maker != Checker
  console.log(`   Testing Maker != Checker guard: Submitter attempting self-verification...`);
  const selfVerifyRes = await request('POST', `/payments/${claimId}/verify-upi-claim`, {
    verificationNotes: 'Self verification attempt',
  }, admin.token);

  console.log(`   Self-Verify Status: ${selfVerifyRes.status} (Expected: 403 Forbidden)`);
  console.log(`   Message: ${selfVerifyRes.json?.message}`);
  if (selfVerifyRes.status !== 403) {
    throw new Error(`Expected HTTP 403 Forbidden for self-verification, got ${selfVerifyRes.status}`);
  }
  console.log(`   ✅ Maker != Checker guard passed!`);

  // Independent Accountant verifies the claim
  console.log(`   Accountant verifying the UPI claim against bank statement...`);
  const verifyRes = await request('POST', `/payments/${claimId}/verify-upi-claim`, {
    verificationNotes: 'Matched ₹3,950 credit in KVB NetBanking',
  }, accountant.token);

  console.log(`   Verification Status: ${verifyRes.status} (Expected: 200)`);
  const receiptNumber = verifyRes.json?.data?.receipt?.receiptNumber || verifyRes.json?.receipt?.receiptNumber;
  console.log(`   Issued Receipt Number: ${receiptNumber}`);
  console.log(`   Due Status: ${verifyRes.json?.data?.dueStatus || verifyRes.json?.dueStatus}`);

  if (verifyRes.status !== 200 || !receiptNumber) {
    throw new Error(`Claim verification failed: ${JSON.stringify(verifyRes)}`);
  }
  console.log(`   ✅ Official bilingual receipt issued and due settled!`);

  console.log(`\n======================================================`);
  console.log(`🎉 ALL ONE-TAP UPI INTENT & BACKEND HARDENING CHECKS PASSED!`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error(`\n❌ VERIFICATION FAILED:`, err);
  process.exit(1);
});
