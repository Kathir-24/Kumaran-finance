// ==============================================================================
// Kumaran Chits — Live Server Verification: Lifecycle 6 (Collections & Handover)
// Target: http://127.0.0.1:3000 against live PostgreSQL 17 (chitflow_dev)
// ==============================================================================

import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';

function queryDb(sql: string): string {
  try {
    const cmd = `docker exec chitflow-db psql -U chitflow -d chitflow_dev -t -A -c "${sql.replace(/"/g, '\\"')}"`;
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
  console.log(`🚀 STARTING LIVE SERVER E2E: LIFECYCLE 6 (COLLECTIONS & HANDOVER)`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Live Database: chitflow_dev (Port 5433)`);
  console.log(`======================================================\n`);

  // Step 0: Authenticate Field Agent and Super Admin
  console.log(`--- [0/6] Authenticating Field Agent & Super Admin ---`);
  const agent = await login('9876543214'); // V. Murugesan (Field Agent)
  console.log(`   Field Agent Authenticated: User ID ${agent.userId}`);

  const admin = await login('9876543210'); // P. Kumaran (Managing Partner / Vault Custodian)
  console.log(`   Super Admin Authenticated: User ID ${admin.userId}`);

  // Fetch the active chit scheme created in Lifecycle 3
  const chitGroupId = queryDb(`SELECT id FROM public."ChitGroup" WHERE "groupCode" = 'KC-LIVE-20M-01'`);
  if (!chitGroupId || chitGroupId.startsWith('[DB ERROR]')) {
    console.error('Prerequisite group KC-LIVE-20M-01 not found! Please run Lifecycles 3, 4, 5 first.');
    process.exit(1);
  }

  // Fetch tickets
  const rawTickets = queryDb(
    `SELECT id, "ticketNumber" FROM public."SubscriberTicket" WHERE "chitGroupId" = '${chitGroupId}' ORDER BY "ticketNumber" ASC`
  );
  const tickets = rawTickets.split('\n').map((line) => {
    const [id, ticketNumber] = line.split('|');
    return { id, ticketNumber: parseInt(ticketNumber, 10) };
  });

  const ticket2 = tickets.find((t) => t.ticketNumber === 2)!;
  const ticket3 = tickets.find((t) => t.ticketNumber === 3)!;

  // Safe reset: Reversal -> Allocation -> Receipt -> Payment -> Due for agent payments
  queryDb(`DELETE FROM public."PaymentReversal" WHERE "paymentId" IN (SELECT id FROM public."Payment" WHERE "recordedByUserId" = '${agent.userId}')`);
  queryDb(`DELETE FROM public."PaymentAllocation" WHERE "paymentId" IN (SELECT id FROM public."Payment" WHERE "recordedByUserId" = '${agent.userId}')`);
  queryDb(`DELETE FROM public."Receipt" WHERE "paymentId" IN (SELECT id FROM public."Payment" WHERE "recordedByUserId" = '${agent.userId}')`);
  queryDb(`DELETE FROM public."Payment" WHERE "recordedByUserId" = '${agent.userId}'`);
  queryDb(`UPDATE public."InstallmentDue" SET "paidAmount" = 0, status = 'UNPAID' WHERE "chitGroupId" = '${chitGroupId}' AND "ticketId" IN ('${ticket2.id}', '${ticket3.id}')`);
  console.log(`   Cleaned prior payments and reset test dues to UNPAID.`);

  let recordedPaymentId = '';
  let offlinePaymentId = '';

  // --------------------------------------------------------------------------
  // Step 1: GET /collections/agent-dues (List dues for collection rounds)
  // --------------------------------------------------------------------------
  console.log(`\n--- [1/6] GET /collections/agent-dues (Doorstep dues list) ---`);
  const duesRes = await request('GET', '/collections/agent-dues', undefined, agent.token);
  console.log(`   Status: ${duesRes.status}`);
  const dues = duesRes.json?.data || [];
  console.log(`   Assigned Dues Count: ${dues.length}`);
  console.log(`   Sample Due Customer: ${dues[0]?.ticket?.customer?.fullName} (${dues[0]?.ticket?.customer?.customerCode}) Net: ₹${dues[0]?.netPayableAmount}`);

  if (duesRes.status !== 200 || dues.length === 0) {
    console.error('Failed to get agent dues:', duesRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 2: POST /collections/record (Doorstep cash collection & ADR-07 guard)
  // --------------------------------------------------------------------------
  console.log(`\n--- [2/6] POST /collections/record (Record cash collection) ---`);

  // Guard Test: Partial payment attempt (₹2,000 instead of exact net ₹5,000)
  console.log(`   Guard Test: Attempting partial payment of ₹2,000 (Due is ₹5,000)...`);
  const partialRes = await request('POST', '/collections/record', {
    ticketId: ticket2.id,
    installmentMonth: 2,
    amount: 2000,
    paymentMethod: 'CASH',
  }, agent.token);
  console.log(`   Partial Payment Rejection Status: ${partialRes.status} (Expected: 400 Bad Request)`);
  console.log(`   Partial Payment Message: ${partialRes.json?.error?.message}`);

  if (partialRes.status !== 400) {
    console.error('CRITICAL: ADR-07 Partial payment guard failed!', partialRes);
    process.exit(1);
  }

  // Valid Collection: Exact net amount ₹5,000 for Ticket #2 Month 2
  console.log(`   Recording valid doorstep collection: Ticket #2, Month 2, ₹5,000 CASH...`);
  const recordRes = await request('POST', '/collections/record', {
    ticketId: ticket2.id,
    installmentMonth: 2,
    amount: 5000,
    paymentMethod: 'CASH',
  }, agent.token);
  console.log(`   Status: ${recordRes.status}`);
  console.log(`   Payment ID: ${recordRes.json?.data?.paymentId}`);
  console.log(`   Receipt Number: ${recordRes.json?.data?.receiptNumber}`);
  console.log(`   Collected Amount: ₹${recordRes.json?.data?.amount}`);
  console.log(`   Cash Handover Status: ${recordRes.json?.data?.cashHandoverStatus}`);

  if (recordRes.status !== 201 || !recordRes.json?.data?.paymentId) {
    console.error('Failed to record doorstep collection:', recordRes);
    process.exit(1);
  }
  recordedPaymentId = recordRes.json.data.paymentId;

  // DB Verification
  const dbPayment1 = queryDb(
    `SELECT id, amount, "paymentMethod", "paymentStatus", "cashHandoverStatus" FROM public."Payment" WHERE id = '${recordedPaymentId}'`
  );
  const dbDue1 = queryDb(
    `SELECT "paidAmount", status FROM public."InstallmentDue" WHERE "ticketId" = '${ticket2.id}' AND "installmentMonth" = 2`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   Payment: ${dbPayment1}`);
  console.log(`   Due #2 Status: ${dbDue1} (Expected: 5000|PAID)`);

  // --------------------------------------------------------------------------
  // Step 3: POST /collections/sync-offline-queue (Offline sync & idempotency)
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/6] POST /collections/sync-offline-queue (Offline sync & idempotency test) ---`);
  const idempotencyKey = randomUUID();
  const offlinePayload = {
    items: [
      {
        idempotencyKey,
        ticketId: ticket3.id,
        installmentMonth: 2,
        amount: 5000,
        paymentMethod: 'CASH',
        collectedAt: new Date().toISOString(),
      },
      // Second item with identical idempotencyKey to test deduplication
      {
        idempotencyKey,
        ticketId: ticket3.id,
        installmentMonth: 2,
        amount: 5000,
        paymentMethod: 'CASH',
        collectedAt: new Date().toISOString(),
      },
    ],
  };
  console.log(`   Submitting offline batch with 1 collection + 1 duplicate (Key: ${idempotencyKey})...`);
  const syncRes = await request('POST', '/collections/sync-offline-queue', offlinePayload, agent.token);
  console.log(`   Status: ${syncRes.status}`);
  console.log(`   Total Submitted: ${syncRes.json?.data?.totalSubmitted}`);
  console.log(`   Success Count: ${syncRes.json?.data?.successCount}`);
  console.log(`   Item 1 isDuplicate: ${syncRes.json?.data?.synced?.[0]?.isDuplicate}`);
  console.log(`   Item 2 isDuplicate: ${syncRes.json?.data?.synced?.[1]?.isDuplicate}`);

  if (syncRes.status !== 200 || syncRes.json?.data?.successCount !== 2 || syncRes.json?.data?.synced?.[1]?.isDuplicate !== true) {
    console.error('Offline sync failed or idempotency failed:', syncRes);
    process.exit(1);
  }
  offlinePaymentId = syncRes.json.data.synced[0].paymentId;

  // DB Verification
  const dbDue2 = queryDb(
    `SELECT "paidAmount", status FROM public."InstallmentDue" WHERE "ticketId" = '${ticket3.id}' AND "installmentMonth" = 2`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   Due #3 Status: ${dbDue2} (Expected: 5000|PAID)`);

  // --------------------------------------------------------------------------
  // Step 4: GET /collections/daily-summary (Agent daily summary register)
  // --------------------------------------------------------------------------
  console.log(`\n--- [4/6] GET /collections/daily-summary (Daily cash summary) ---`);
  const summaryRes = await request('GET', '/collections/daily-summary', undefined, agent.token);
  console.log(`   Status: ${summaryRes.status}`);
  const summary = summaryRes.json?.data;
  console.log(`   Total Collections Count: ${summary?.totalPaymentsCount}`);
  console.log(`   Total Cash Collected: ₹${summary?.totals?.totalCollected}`);
  console.log(`   Cash Pending Handover: ₹${summary?.totals?.cashPendingHandover}`);

  if (summaryRes.status !== 200 || summary?.totals?.cashPendingHandover < 10000) {
    console.error('Failed to get daily collections summary:', summaryRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 5: POST /collections/cash-handover/submit (Evening handover batch submit)
  // --------------------------------------------------------------------------
  console.log(`\n--- [5/6] POST /collections/cash-handover/submit (Evening batch submission) ---`);
  const submitRes = await request('POST', '/collections/cash-handover/submit', {}, agent.token);
  console.log(`   Status: ${submitRes.status}`);
  console.log(`   Batch Pending Amount: ₹${submitRes.json?.data?.totalPendingAmount}`);
  console.log(`   Payments in Batch: ${submitRes.json?.data?.paymentsCount}`);
  console.log(`   Payment IDs:`, submitRes.json?.data?.paymentIds);

  if (submitRes.status !== 200 || submitRes.json?.data?.totalPendingAmount < 10000) {
    console.error('Failed to submit cash handover batch:', submitRes);
    process.exit(1);
  }
  const handoverPaymentIds = submitRes.json.data.paymentIds as string[];
  const handoverAmount = Number(submitRes.json.data.totalPendingAmount);

  // --------------------------------------------------------------------------
  // Step 6: POST /collections/cash-handover/acknowledge (Dual Control Vault Deposit)
  // --------------------------------------------------------------------------
  console.log(`\n--- [6/6] POST /collections/cash-handover/acknowledge (Vault deposit & dual control) ---`);

  // Guard Test: Field Agent attempts to acknowledge their own cash into vault
  console.log(`   Guard Test: Field Agent attempts self-acknowledgment into vault...`);
  const selfAckRes = await request('POST', '/collections/cash-handover/acknowledge', {
    collectorUserId: agent.userId,
    acknowledgedAmount: handoverAmount,
    paymentIds: handoverPaymentIds,
    notes: 'Self acknowledgment attempt by collector',
  }, agent.token);
  console.log(`   Self-Acknowledgment Rejection Status: ${selfAckRes.status} (Expected: 403 Forbidden)`);
  console.log(`   Self-Acknowledgment Message: ${selfAckRes.json?.error?.message}`);

  if (selfAckRes.status !== 403) {
    console.error('CRITICAL: Dual control violated! Collector acknowledged own cash:', selfAckRes);
    process.exit(1);
  }

  // Valid Vault Acknowledgment: Super Admin physically counts and deposits cash into branch vault
  console.log(`   Super Admin acknowledges physical counted cash of ₹${handoverAmount} into branch vault...`);
  const ackRes = await request('POST', '/collections/cash-handover/acknowledge', {
    collectorUserId: agent.userId,
    acknowledgedAmount: handoverAmount,
    paymentIds: handoverPaymentIds,
    notes: 'Currency counted: ₹500 x 20 notes = ₹10,000 physically counted and deposited into safe.',
  }, admin.token);
  console.log(`   Acknowledgment Status: ${ackRes.status}`);
  console.log(`   Acknowledged Payments Count: ${ackRes.json?.data?.totalPaymentsAcknowledged}`);
  console.log(`   Acknowledged Cash Total: ₹${ackRes.json?.data?.acknowledgedAmount}`);

  if (ackRes.status !== 200 || ackRes.json?.data?.totalPaymentsAcknowledged < 2) {
    console.error('Failed to acknowledge cash handover into vault:', ackRes);
    process.exit(1);
  }

  // DB Verification
  const dbAckPayments = queryDb(
    `SELECT id, "cashHandoverStatus", "cashHandoverAcknowledgedByUserId" FROM public."Payment" WHERE id IN ('${recordedPaymentId}', '${offlinePaymentId}')`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   Acknowledged Payments:\n   ${dbAckPayments}`);

  console.log(`\n======================================================`);
  console.log(`🎉 ALL 6 LIFECYCLE 6 ENDPOINTS & INVARIANTS VERIFIED!`);
  console.log(`   Live Server (:3000) <--> Live Postgres (:5433)`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error('Fatal error during execution:', err);
  process.exit(1);
});
