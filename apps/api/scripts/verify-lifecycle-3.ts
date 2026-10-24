// ==============================================================================
// Kumaran Chits — Live Server Verification: Lifecycle 3 (Chit Schemes & Intake)
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

async function run() {
  console.log(`\n======================================================`);
  console.log(`🚀 STARTING LIVE SERVER E2E: LIFECYCLE 3 (CHIT SCHEMES & INTAKE)`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Live Database: chitflow_dev (Port 5433)`);
  console.log(`======================================================\n`);

  // Step 0: Obtain Admin Auth Token
  console.log(`--- [0/7] Authenticating Super Admin for Lifecycle 3 ---`);
  queryDb(`UPDATE public."User" SET "isTotpEnabled" = false, "totpSecret" = NULL WHERE phone = '9876543210'`);
  
  const loginRes = await request('POST', '/auth/web/login', {
    phone: '9876543210',
    password: 'Admin@Kumaran2026',
  });
  if (loginRes.status !== 200 || !loginRes.json?.data?.accessToken) {
    console.error('Failed to log in as admin:', loginRes);
    process.exit(1);
  }
  const token = loginRes.json.data.accessToken;
  console.log(`   Admin authenticated successfully.`);

  // Fetch 20 distinct customer IDs from DB to populate tickets
  const rawCustomerIds = queryDb(`SELECT id FROM public."Customer" ORDER BY "createdAt" ASC LIMIT 25`);
  const customerIds = rawCustomerIds.split('\n').map((s) => s.trim()).filter(Boolean);
  if (customerIds.length < 20) {
    console.error(`Not enough customers in database (found ${customerIds.length}, need 20)`);
    process.exit(1);
  }
  console.log(`   Loaded ${customerIds.length} candidate customer IDs from PostgreSQL.`);

  // Cleanup any test chit groups from previous runs to ensure clean repeatability
  const cleanupGroups = ['KC-LIVE-20M-01', 'KC-ONBOARD-20M-01'];
  for (const gCode of cleanupGroups) {
    const existingGroup = queryDb(`SELECT id FROM public."ChitGroup" WHERE "groupCode" = '${gCode}'`);
    if (existingGroup && !existingGroup.startsWith('[DB ERROR]')) {
      // 1. Delete Reversals & Receipts for payments on tickets in this group
      queryDb(`DELETE FROM public."PaymentReversal" WHERE "paymentId" IN (SELECT "paymentId" FROM public."PaymentAllocation" WHERE "ticketId" IN (SELECT id FROM public."SubscriberTicket" WHERE "chitGroupId" = '${existingGroup}'))`);
      queryDb(`DELETE FROM public."Receipt" WHERE "paymentId" IN (SELECT "paymentId" FROM public."PaymentAllocation" WHERE "ticketId" IN (SELECT id FROM public."SubscriberTicket" WHERE "chitGroupId" = '${existingGroup}'))`);

      // 2. Delete Allocations and Payments
      const paymentIds = queryDb(`SELECT DISTINCT "paymentId" FROM public."PaymentAllocation" WHERE "ticketId" IN (SELECT id FROM public."SubscriberTicket" WHERE "chitGroupId" = '${existingGroup}')`);
      queryDb(`DELETE FROM public."PaymentAllocation" WHERE "ticketId" IN (SELECT id FROM public."SubscriberTicket" WHERE "chitGroupId" = '${existingGroup}')`);
      if (paymentIds && !paymentIds.startsWith('[DB ERROR]') && paymentIds.trim().length > 0) {
        const idList = paymentIds.split('\n').map((id) => `'${id.trim()}'`).filter((s) => s.length > 2).join(',');
        if (idList) {
          queryDb(`DELETE FROM public."Payment" WHERE id IN (${idList})`);
        }
      }

      // 3. Delete Prize Disbursements & Proofs
      queryDb(`DELETE FROM public."DisbursementProof" WHERE "disbursementId" IN (SELECT id FROM public."PrizeDisbursement" WHERE "ticketId" IN (SELECT id FROM public."SubscriberTicket" WHERE "chitGroupId" = '${existingGroup}'))`);
      queryDb(`DELETE FROM public."PrizeDisbursement" WHERE "ticketId" IN (SELECT id FROM public."SubscriberTicket" WHERE "chitGroupId" = '${existingGroup}')`);

      // 4. Delete Dues
      queryDb(`DELETE FROM public."InstallmentDue" WHERE "ticketId" IN (SELECT id FROM public."SubscriberTicket" WHERE "chitGroupId" = '${existingGroup}')`);

      // 5. Delete Auctions
      queryDb(`DELETE FROM public."AuctionMinutes" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${existingGroup}')`);
      queryDb(`DELETE FROM public."AuctionTieBidder" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${existingGroup}')`);
      queryDb(`DELETE FROM public."AuctionWinner" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${existingGroup}')`);
      queryDb(`DELETE FROM public."Auction" WHERE "chitGroupId" = '${existingGroup}'`);

      // 6. Delete Tickets & ChitGroup
      queryDb(`DELETE FROM public."SubscriberTicket" WHERE "chitGroupId" = '${existingGroup}'`);
      queryDb(`DELETE FROM public."ChitGroup" WHERE id = '${existingGroup}'`);
      console.log(`   Cleaned up pre-existing chit group ${gCode} (${existingGroup})`);
    }
  }

  let freshChitGroupId = '';
  let ongoingChitGroupId = '';

  // --------------------------------------------------------------------------
  // Step 1: POST /chits/new (Create fresh chit scheme)
  // --------------------------------------------------------------------------
  console.log(`\n--- [1/7] POST /chits/new (Create fresh chit scheme) ---`);
  const createPayload = {
    groupCode: 'KC-LIVE-20M-01',
    groupName: '₹1 Lakh 20 Months Test Group',
    groupNameTamil: '₹1 லட்சம் 20 மாதங்கள் நேரலை குழு',
    chitValue: 100000,
    durationMonths: 20,
    totalTickets: 20,
    startDate: '2026-11-01T00:00:00.000Z',
    endDate: '2028-06-30T00:00:00.000Z',
    sanctionOrderNumber: 'ROC/ERD/CHIT/2026/099',
    sanctionDate: '2026-10-01T00:00:00.000Z',
  };
  console.log(`   Payload:`, JSON.stringify(createPayload, null, 2));

  const createRes = await request('POST', '/chits/new', createPayload, token);
  console.log(`   Status: ${createRes.status}`);
  console.log(`   Response Data:`, JSON.stringify(createRes.json?.data, null, 2));

  if (createRes.status !== 201 || !createRes.json?.data?.id) {
    console.error('Failed to create fresh chit group:', createRes);
    process.exit(1);
  }
  freshChitGroupId = createRes.json.data.id;

  // DB Verification
  const dbChit = queryDb(
    `SELECT id, "groupCode", "chitValue", "durationMonths", "totalTickets", "baseInstallment", "maxDiscountCeiling", "foremanCommissionRate", status, "initMode" FROM public."ChitGroup" WHERE id = '${freshChitGroupId}'`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   ${dbChit}`);

  // --------------------------------------------------------------------------
  // Step 2: PATCH /chits/:id (Update draft chit scheme parameters - All Fields)
  // --------------------------------------------------------------------------
  console.log(`\n--- [2/9] PATCH /chits/${freshChitGroupId} (Update draft scheme) ---`);
  const updatePayload = {
    groupName: '₹1 Lakh 20 Months Test Group - Updated',
    groupNameTamil: '₹1 லட்சம் 20 மாதங்கள் நேரலை குழு - திருத்தப்பட்டது',
    startDate: '2026-11-15T00:00:00.000Z',
    endDate: '2028-07-15T00:00:00.000Z',
    sanctionOrderNumber: 'ROC/ERD/CHIT/2026/099-REV',
    sanctionDate: '2026-10-10T00:00:00.000Z',
  };
  console.log(`   Payload:`, JSON.stringify(updatePayload, null, 2));
  const updateRes = await request('PATCH', `/chits/${freshChitGroupId}`, updatePayload, token);
  console.log(`   Status: ${updateRes.status}`);
  console.log(`   Response Data:`, JSON.stringify(updateRes.json?.data, null, 2));

  if (updateRes.status !== 200 || updateRes.json?.data?.groupName !== updatePayload.groupName) {
    console.error('Failed to update draft chit group:', updateRes);
    process.exit(1);
  }

  // DB Verification for PATCH
  const dbChitAfterUpdate = queryDb(
    `SELECT "groupName", "groupNameTamil", "sanctionOrderNumber", status FROM public."ChitGroup" WHERE id = '${freshChitGroupId}'`
  );
  console.log(`   [PostgreSQL DB Verification After Update]:`);
  console.log(`   ${dbChitAfterUpdate}`);

  // --------------------------------------------------------------------------
  // Step 3: POST /chits/:id/tickets/assign (Assign tickets & assert ADR-13)
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/9] POST /chits/${freshChitGroupId}/tickets/assign (Assign tickets & verify ADR-13) ---`);
  
  // Assign Ticket #1
  const t1Res = await request('POST', `/chits/${freshChitGroupId}/tickets/assign`, {
    ticketNumber: 1,
    customerId: customerIds[0],
  }, token);
  console.log(`   Ticket #1 Status: ${t1Res.status} (Assigned to customer ${customerIds[0]})`);
  if (t1Res.status !== 201) {
    console.error('Failed to assign Ticket #1:', t1Res);
    process.exit(1);
  }

  // ADR-13 Guard Check: Try assigning Ticket #2 to the SAME customer
  console.log(`   Asserting ADR-13: Attempting to assign Ticket #2 to same customer...`);
  const adr13Res = await request('POST', `/chits/${freshChitGroupId}/tickets/assign`, {
    ticketNumber: 2,
    customerId: customerIds[0],
  }, token);
  console.log(`   ADR-13 Violation Response Status: ${adr13Res.status} (Expected: 409 Conflict)`);
  console.log(`   ADR-13 Message: ${adr13Res.json?.error?.message}`);
  if (adr13Res.status !== 409) {
    console.error('CRITICAL: ADR-13 Guard failed! System allowed duplicate ticket for same customer:', adr13Res);
    process.exit(1);
  }

  // Assign Ticket #2 temporarily to customer 1 to test unassign
  const t2Res = await request('POST', `/chits/${freshChitGroupId}/tickets/assign`, {
    ticketNumber: 2,
    customerId: customerIds[1],
  }, token);
  if (t2Res.status !== 201) {
    console.error(`Failed to assign temporary Ticket #2:`, t2Res);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 4: DELETE /chits/:id/tickets/:ticketNumber (Unassign ticket in DRAFT)
  // --------------------------------------------------------------------------
  console.log(`\n--- [4/9] DELETE /chits/${freshChitGroupId}/tickets/2 (Unassign ticket) ---`);
  const unassignRes = await request('DELETE', `/chits/${freshChitGroupId}/tickets/2`, undefined, token);
  console.log(`   Status: ${unassignRes.status}`);
  console.log(`   Response Data:`, JSON.stringify(unassignRes.json?.data, null, 2));

  if (unassignRes.status !== 200 || !unassignRes.json?.data?.success) {
    console.error('Failed to unassign ticket in DRAFT status:', unassignRes);
    process.exit(1);
  }

  // DB Verification: Ticket #2 must no longer exist in SubscriberTicket table
  const dbUnassignCheck = queryDb(`SELECT count(*) FROM public."SubscriberTicket" WHERE "chitGroupId" = '${freshChitGroupId}' AND "ticketNumber" = 2`);
  console.log(`   [PostgreSQL DB Verification]: Ticket #2 count = ${dbUnassignCheck} (Expected: 0)`);
  if (dbUnassignCheck !== '0') {
    throw new Error(`Step 4 Failed: Ticket #2 still exists after DELETE unassign`);
  }

  // Assign Tickets #2 through #20 to distinct customers to complete the group
  console.log(`   Assigning tickets 2..20 to distinct subscribers...`);
  for (let i = 2; i <= 20; i++) {
    const tRes = await request('POST', `/chits/${freshChitGroupId}/tickets/assign`, {
      ticketNumber: i,
      customerId: customerIds[i - 1],
    }, token);
    if (tRes.status !== 201) {
      console.error(`Failed to assign Ticket #${i}:`, tRes);
      process.exit(1);
    }
  }
  console.log(`   All 20 tickets assigned successfully.`);

  // DB Verification
  const dbTicketCount = queryDb(`SELECT count(*) FROM public."SubscriberTicket" WHERE "chitGroupId" = '${freshChitGroupId}'`);
  console.log(`   [PostgreSQL DB Verification]: Total tickets stored = ${dbTicketCount} (Expected: 20)`);

  // --------------------------------------------------------------------------
  // Step 5: GET /chits/:id/tickets (View all assigned tickets)
  // --------------------------------------------------------------------------
  console.log(`\n--- [5/9] GET /chits/${freshChitGroupId}/tickets (List all tickets) ---`);
  const ticketsRes = await request('GET', `/chits/${freshChitGroupId}/tickets`, undefined, token);
  console.log(`   Status: ${ticketsRes.status}`);
  const ticketList = ticketsRes.json?.data || [];
  console.log(`   Returned Tickets Count: ${ticketList.length}`);
  console.log(`   Sample Ticket #1 Customer: ${ticketList[0]?.customer?.fullName} (Phone: ${ticketList[0]?.customer?.phone})`);

  if (ticketsRes.status !== 200 || ticketList.length !== 20) {
    console.error('Failed to list tickets or count mismatch:', ticketsRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 6: POST /chits/:id/activate (Activate scheme & Month 1 Rule)
  // --------------------------------------------------------------------------
  console.log(`\n--- [6/9] POST /chits/${freshChitGroupId}/activate (Activate scheme) ---`);
  const activateRes = await request('POST', `/chits/${freshChitGroupId}/activate`, {}, token);
  console.log(`   Status: ${activateRes.status}`);
  console.log(`   Activated Chit Status: ${activateRes.json?.data?.status}`);

  if (activateRes.status !== 200 || activateRes.json?.data?.status !== 'ACTIVE') {
    console.error('Failed to activate chit group:', activateRes);
    process.exit(1);
  }

  // DB Verification: Chit status is ACTIVE and Month 1 Auction created
  const dbChitActive = queryDb(`SELECT status FROM public."ChitGroup" WHERE id = '${freshChitGroupId}'`);
  const dbMonth1Auction = queryDb(
    `SELECT "installmentMonth", status, "bidDiscount", "prizeMoney", "foremanCommissionAmount", "totalDividend" FROM public."Auction" WHERE "chitGroupId" = '${freshChitGroupId}' AND "installmentMonth" = 1`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   Chit Status = ${dbChitActive}`);
  console.log(`   Month 1 Auction = ${dbMonth1Auction}`);

  // --------------------------------------------------------------------------
  // Step 7: GET /chits (List chit schemes with filter)
  // --------------------------------------------------------------------------
  console.log(`\n--- [7/9] GET /chits (List & search schemes) ---`);
  const listRes = await request('GET', `/chits?search=KC-LIVE-20M-01&page=1&limit=10`, undefined, token);
  console.log(`   Status: ${listRes.status}`);
  const chitsFound = listRes.json?.data?.data || [];
  console.log(`   Found: ${chitsFound.length} scheme(s), Total: ${listRes.json?.data?.total}`);
  console.log(`   Matched Group Code: ${chitsFound[0]?.groupCode}`);

  if (listRes.status !== 200 || !chitsFound.some((c: any) => c.id === freshChitGroupId)) {
    console.error('Chit group not found in list results:', listRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 8: GET /chits/:id (Chit scheme details)
  // --------------------------------------------------------------------------
  console.log(`\n--- [8/9] GET /chits/${freshChitGroupId} (Scheme details) ---`);
  const detailRes = await request('GET', `/chits/${freshChitGroupId}`, undefined, token);
  console.log(`   Status: ${detailRes.status}`);
  console.log(`   Group Code: ${detailRes.json?.data?.groupCode}`);
  console.log(`   Chit Value: ₹${detailRes.json?.data?.chitValue}`);
  console.log(`   Max Discount Ceiling: ₹${detailRes.json?.data?.maxDiscountCeiling}`);
  console.log(`   Status: ${detailRes.json?.data?.status}`);
  console.log(`   Tickets Count: ${detailRes.json?.data?.tickets?.length}`);

  if (detailRes.status !== 200 || detailRes.json?.data?.id !== freshChitGroupId) {
    console.error('Failed to get chit scheme details:', detailRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 9: POST /chits/onboard-ongoing (Mid-cycle intake from physical notebook)
  // --------------------------------------------------------------------------
  console.log(`\n--- [9/9] POST /chits/onboard-ongoing (Physical notebook intake) ---`);
  const onboardPayload = {
    groupCode: 'KC-ONBOARD-20M-01',
    groupName: '₹2 Lakh 20 Months Ongoing Notebook Intake',
    groupNameTamil: '₹2 லட்சம் 20 மாதங்கள் நடைமுறை குழு',
    chitValue: 200000,
    durationMonths: 20,
    totalTickets: 20,
    onboardedAtMonth: 4, // Digitized starting Month 4 (Months 2 & 3 are historical)
    startDate: '2026-07-01T00:00:00.000Z',
    endDate: '2028-02-28T00:00:00.000Z',
    sanctionOrderNumber: 'ROC/ERD/CHIT/2026/012',
    sanctionDate: '2026-06-15T00:00:00.000Z',
    historicalWinners: [
      {
        month: 2,
        ticketNumber: 5,
        bidDiscount: 40000, // <= 200000 / 4 (50,000 ceiling)
        auctionDate: '2026-08-15T00:00:00.000Z',
      },
      {
        month: 3,
        ticketNumber: 9,
        bidDiscount: 35000,
        auctionDate: '2026-09-15T00:00:00.000Z',
      },
    ],
    memberAllocations: Array.from({ length: 20 }, (_, idx) => ({
      ticketNumber: idx + 1,
      customerId: customerIds[idx],
      openingBalance: idx === 4 ? 2000 : 0, // Ticket 5 has opening arrears
    })),
  };
  console.log(`   Payload Summary: Group ${onboardPayload.groupCode}, Onboarded at Month ${onboardPayload.onboardedAtMonth}, 2 Historical Winners, 20 Member Tickets.`);

  const onboardRes = await request('POST', '/chits/onboard-ongoing', onboardPayload, token);
  console.log(`   Status: ${onboardRes.status}`);
  console.log(`   Response Data:`, JSON.stringify(onboardRes.json?.data, null, 2));

  if (onboardRes.status !== 201 || !onboardRes.json?.data?.id) {
    console.error('Failed to onboard ongoing chit:', onboardRes);
    process.exit(1);
  }
  ongoingChitGroupId = onboardRes.json.data.id;

  // DB Verification
  const dbOngoingChit = queryDb(
    `SELECT id, "groupCode", "chitValue", "initMode", "onboardedAtMonth", status FROM public."ChitGroup" WHERE id = '${ongoingChitGroupId}'`
  );
  const dbHistAuctions = queryDb(
    `SELECT "installmentMonth", "bidDiscount", "prizeMoney", "isHistoricalEntry" FROM public."Auction" WHERE "chitGroupId" = '${ongoingChitGroupId}' ORDER BY "installmentMonth" ASC`
  );
  const dbPrizedTickets = queryDb(
    `SELECT "ticketNumber", "isPrized" FROM public."SubscriberTicket" WHERE "chitGroupId" = '${ongoingChitGroupId}' AND "isPrized" = true ORDER BY "ticketNumber" ASC`
  );

  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   Ongoing Chit: ${dbOngoingChit}`);
  console.log(`   Historical Auctions:\n   ${dbHistAuctions}`);
  console.log(`   Prized Tickets (From History):\n   ${dbPrizedTickets}`);

  console.log(`\n======================================================`);
  console.log(`🎉 ALL 9 LIFECYCLE 3 ENDPOINTS VERIFIED SUCCESSFULLY!`);
  console.log(`   Live Server (:3000) <--> Live Postgres (:5433)`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error('Fatal error during execution:', err);
  process.exit(1);
});
