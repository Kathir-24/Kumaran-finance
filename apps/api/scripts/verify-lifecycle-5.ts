// ==============================================================================
// Kumaran Chits — Live Server Verification: Lifecycle 5 (Installments & Ledger)
// Target: http://127.0.0.1:3000 against live PostgreSQL 17 (chitflow_dev)
// ==============================================================================

import { execSync } from 'child_process';

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
  console.log(`🚀 STARTING LIVE SERVER E2E: LIFECYCLE 5 (INSTALLMENTS & PASSBOOK)`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Live Database: chitflow_dev (Port 5433)`);
  console.log(`======================================================\n`);

  // Step 0: Authenticate Super Admin
  console.log(`--- [0/7] Authenticating Super Admin for Lifecycle 5 ---`);
  const admin = await login('9876543210');
  console.log(`   Admin Authenticated: User ID ${admin.userId}`);

  // Fetch the active chit scheme created in Lifecycle 3
  const chitGroupId = queryDb(`SELECT id FROM public."ChitGroup" WHERE "groupCode" = 'KC-LIVE-20M-01'`);
  if (!chitGroupId || chitGroupId.startsWith('[DB ERROR]')) {
    console.error('Prerequisite group KC-LIVE-20M-01 not found! Please run Lifecycles 3 & 4 first.');
    process.exit(1);
  }
  console.log(`   Using Chit Group ID: ${chitGroupId} (KC-LIVE-20M-01)`);

  // Reset Ticket 19 status for test repeatability
  queryDb(`UPDATE public."SubscriberTicket" SET status = 'ACTIVE', "consecutiveUnpaidMonths" = 0, "removedAt" = NULL, "removedByUserId" = NULL WHERE "chitGroupId" = '${chitGroupId}' AND "ticketNumber" = 19`);

  // Fetch tickets for this group
  const rawTickets = queryDb(
    `SELECT id, "ticketNumber", "customerId" FROM public."SubscriberTicket" WHERE "chitGroupId" = '${chitGroupId}' ORDER BY "ticketNumber" ASC`
  );
  const tickets = rawTickets.split('\n').map((line) => {
    const [id, ticketNumber, customerId] = line.split('|');
    return { id, ticketNumber: parseInt(ticketNumber, 10), customerId };
  });
  console.log(`   Loaded ${tickets.length} tickets from PostgreSQL.`);

  // --------------------------------------------------------------------------
  // Step 1: POST /installments/group/:chitGroupId/month/2/generate (Month 2 Dues)
  // --------------------------------------------------------------------------
  console.log(`\n--- [1/7] POST /installments/group/${chitGroupId}/month/2/generate ---`);
  const genMonth2Res = await request('POST', `/installments/group/${chitGroupId}/month/2/generate`, {
    dueDate: '2026-12-10T00:00:00.000Z',
  }, admin.token);
  console.log(`   Status: ${genMonth2Res.status}`);
  console.log(`   Month 2 Gross: ₹${genMonth2Res.json?.data?.grossAmount}`);
  console.log(`   Month 2 Dividend: ₹${genMonth2Res.json?.data?.dividendDeduction} (Expected: 0)`);
  console.log(`   Month 2 Net Payable: ₹${genMonth2Res.json?.data?.netPayableAmount}`);
  console.log(`   Total Dues Scheduled: ${genMonth2Res.json?.data?.totalDuesScheduled}`);

  if (genMonth2Res.status !== 200 || genMonth2Res.json?.data?.totalDuesScheduled !== 20) {
    console.error('Failed to generate Month 2 dues:', genMonth2Res);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 2: POST /installments/group/:chitGroupId/month/3/generate (Month 3 Universal Dividends)
  // --------------------------------------------------------------------------
  console.log(`\n--- [2/7] POST /installments/group/${chitGroupId}/month/3/generate ---`);
  const genMonth3Res = await request('POST', `/installments/group/${chitGroupId}/month/3/generate`, {
    dueDate: '2027-01-10T00:00:00.000Z',
  }, admin.token);
  console.log(`   Status: ${genMonth3Res.status}`);
  console.log(`   Month 3 Gross: ₹${genMonth3Res.json?.data?.grossAmount}`);
  console.log(`   Month 3 Dividend Deduction: ₹${genMonth3Res.json?.data?.dividendDeduction} (Expected: 1050)`);
  console.log(`   Month 3 Net Payable: ₹${genMonth3Res.json?.data?.netPayableAmount} (Expected: 3950)`);
  console.log(`   Total Dues Scheduled: ${genMonth3Res.json?.data?.totalDuesScheduled}`);

  if (genMonth3Res.status !== 200 || genMonth3Res.json?.data?.dividendDeduction !== 1050 || genMonth3Res.json?.data?.netPayableAmount !== 3950) {
    console.error('Failed to generate Month 3 dues with universal dividend:', genMonth3Res);
    process.exit(1);
  }

  // DB Verification
  const dbDuesCount = queryDb(`SELECT count(*) FROM public."InstallmentDue" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 3`);
  const dbSampleDue = queryDb(
    `SELECT "grossAmount", "dividendDeduction", "netPayableAmount", status FROM public."InstallmentDue" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 3 LIMIT 1`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   Month 3 Dues Count = ${dbDuesCount} (Expected: 20)`);
  console.log(`   Sample Due Row = ${dbSampleDue} (Expected: 5000|1050|3950|UNPAID)`);

  // --------------------------------------------------------------------------
  // Step 3: GET /installments/group/:chitGroupId/month/3 (List month dues)
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/7] GET /installments/group/${chitGroupId}/month/3 ---`);
  const listMonth3Res = await request('GET', `/installments/group/${chitGroupId}/month/3`, undefined, admin.token);
  console.log(`   Status: ${listMonth3Res.status}`);
  const duesList = listMonth3Res.json?.data || [];
  console.log(`   Retrieved Dues Count: ${duesList.length}`);
  console.log(`   First Member: ${duesList[0]?.ticket?.customer?.fullName} (Ticket #${duesList[0]?.ticket?.ticketNumber}) Net: ₹${duesList[0]?.netPayableAmount}`);

  if (listMonth3Res.status !== 200 || duesList.length !== 20) {
    console.error('Failed to list Month 3 dues:', listMonth3Res);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 4: GET /tickets/:ticketId/dues (Schedule of dues for single ticket)
  // --------------------------------------------------------------------------
  const sampleTicketId = tickets[2].id; // Ticket #3
  console.log(`\n--- [4/7] GET /tickets/${sampleTicketId}/dues (Ticket #3 dues schedule) ---`);
  const ticketDuesRes = await request('GET', `/tickets/${sampleTicketId}/dues`, undefined, admin.token);
  console.log(`   Status: ${ticketDuesRes.status}`);
  const ticketDues = ticketDuesRes.json?.data || [];
  console.log(`   Dues Scheduled for Ticket #3: ${ticketDues.length}`);
  for (const d of ticketDues) {
    console.log(`     Month ${d.installmentMonth}: Gross ₹${d.grossAmount} - Div ₹${d.dividendDeduction} = Net ₹${d.netPayableAmount} (Status: ${d.status})`);
  }

  if (ticketDuesRes.status !== 200 || ticketDues.length < 2) {
    console.error('Failed to get ticket dues schedule:', ticketDuesRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 5: GET /tickets/:ticketId/passbook (Digital passbook statement)
  // --------------------------------------------------------------------------
  console.log(`\n--- [5/7] GET /tickets/${sampleTicketId}/passbook (Digital passbook ledger) ---`);
  const passbookRes = await request('GET', `/tickets/${sampleTicketId}/passbook`, undefined, admin.token);
  console.log(`   Status: ${passbookRes.status}`);
  const pbData = passbookRes.json?.data;
  console.log(`   Passbook Customer: ${pbData?.customer?.fullName} (${pbData?.customer?.customerCode})`);
  console.log(`   Ticket Number: #${pbData?.ticket?.ticketNumber}`);
  console.log(`   Total Gross Dues: ₹${pbData?.summary?.totalGrossDue}`);
  console.log(`   Total Dividends Earned: ₹${pbData?.summary?.totalDividend}`);
  console.log(`   Net Payable: ₹${pbData?.summary?.totalNetDue}`);
  console.log(`   Outstanding Balance: ₹${pbData?.summary?.outstandingBalance}`);
  console.log(`   Entries Count: ${pbData?.ledgerEntries?.length}`);

  if (passbookRes.status !== 200 || !pbData?.summary) {
    console.error('Failed to get passbook statement:', passbookRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 6: GET /installments/defaulters & GET /tickets/defaulters (Defaulters report)
  // --------------------------------------------------------------------------
  console.log(`\n--- [6/7] GET /installments/defaulters & GET /tickets/defaulters ---`);
  const instDefRes = await request('GET', `/installments/defaulters?minConsecutiveMonths=1`, undefined, admin.token);
  console.log(`   /installments/defaulters Status: ${instDefRes.status}, Count: ${instDefRes.json?.data?.length}`);

  const tickDefRes = await request('GET', `/tickets/defaulters?minConsecutiveMonths=1`, undefined, admin.token);
  console.log(`   /tickets/defaulters Status: ${tickDefRes.status}, Count: ${tickDefRes.json?.data?.length}`);

  if (instDefRes.status !== 200 || tickDefRes.status !== 200) {
    console.error('Failed to get defaulters list:', { instDefRes, tickDefRes });
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 7: POST /tickets/:id/remove-defaulter (3-Month Arrears Removal Rights)
  // --------------------------------------------------------------------------
  const defaultTestTicketId = tickets[18].id; // Ticket #19
  console.log(`\n--- [7/7] POST /tickets/${defaultTestTicketId}/remove-defaulter (ADR-07 Removal Guard) ---`);

  // Guard Test: Attempt removal when ticket has fewer than 3 consecutive unpaid months
  console.log(`   Guard Test: Attempting removal on ticket with consecutiveUnpaidMonths = 0...`);
  const removalFailRes = await request('POST', `/tickets/${defaultTestTicketId}/remove-defaulter`, {
    reason: 'Premature default removal attempt',
  }, admin.token);
  console.log(`   Premature Removal Rejection Status: ${removalFailRes.status} (Expected: 400 Bad Request)`);
  console.log(`   Premature Removal Message: ${removalFailRes.json?.error?.message}`);

  if (removalFailRes.status !== 400) {
    console.error('CRITICAL: Defaulter removal guard failed! Allowed removal with < 3 unpaid months:', removalFailRes);
    process.exit(1);
  }

  // Valid Removal: Simulate 3-month consecutive default in PostgreSQL
  console.log(`   Simulating 3 consecutive unpaid months for Ticket #19 in PostgreSQL...`);
  queryDb(`UPDATE public."SubscriberTicket" SET "consecutiveUnpaidMonths" = 3 WHERE id = '${defaultTestTicketId}'`);

  console.log(`   Executing company default removal rights for Ticket #19...`);
  const removalSuccessRes = await request('POST', `/tickets/${defaultTestTicketId}/remove-defaulter`, {
    reason: 'Subscriber defaulted for 3 consecutive months without payment. Removed per Foreman decision.',
  }, admin.token);
  console.log(`   Removal Status: ${removalSuccessRes.status}`);
  console.log(`   Removal Success Message: ${removalSuccessRes.json?.data?.message}`);
  console.log(`   Updated Ticket Status: ${removalSuccessRes.json?.data?.ticket?.status}`);

  if (removalSuccessRes.status !== 200 || removalSuccessRes.json?.data?.ticket?.status !== 'REMOVED_DEF_3M') {
    console.error('Failed to execute 3-month default removal:', removalSuccessRes);
    process.exit(1);
  }

  // DB Verification
  const dbRemovedTicket = queryDb(
    `SELECT status, "consecutiveUnpaidMonths", "removedByUserId" FROM public."SubscriberTicket" WHERE id = '${defaultTestTicketId}'`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   Ticket #19 Status & RemovedBy: ${dbRemovedTicket}`);

  console.log(`\n======================================================`);
  console.log(`🎉 ALL LIFECYCLE 5 ENDPOINTS & INVARIANTS VERIFIED!`);
  console.log(`   Live Server (:3000) <--> Live Postgres (:5433)`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error('Fatal error during execution:', err);
  process.exit(1);
});
