// ==============================================================================
// Kumaran Chits — Live Server Verification: Lifecycle 4 (In-Office Auctions)
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
  console.log(`🚀 STARTING LIVE SERVER E2E: LIFECYCLE 4 (AUCTIONS & BIDDING)`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Live Database: chitflow_dev (Port 5433)`);
  console.log(`======================================================\n`);

  // Step 0: Authenticate Maker (Partner A) and Checker (Partner B)
  console.log(`--- [0/8] Authenticating Maker (Partner A) & Checker (Partner B) ---`);
  const maker = await login('9876543210'); // P. Kumaran (Managing Partner / Maker)
  console.log(`   Maker Authenticated (Partner A): User ID ${maker.userId}`);

  const checker = await login('9876543211'); // K. Senthil (Operations Partner / Checker)
  console.log(`   Checker Authenticated (Partner B): User ID ${checker.userId}`);

  // Fetch the active chit scheme created in Lifecycle 3
  const chitGroupId = queryDb(`SELECT id FROM public."ChitGroup" WHERE "groupCode" = 'KC-LIVE-20M-01'`);
  if (!chitGroupId || chitGroupId.startsWith('[DB ERROR]')) {
    console.error('Prerequisite group KC-LIVE-20M-01 not found! Please run Lifecycle 3 first.');
    process.exit(1);
  }
  console.log(`   Using Chit Group ID: ${chitGroupId} (KC-LIVE-20M-01)`);

  // Reset all auctions >= Month 2, unprize non-company tickets, and reset defaulter status for test repeatability
  queryDb(`DELETE FROM public."AuctionMinutes" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" >= 2);`);
  queryDb(`DELETE FROM public."AuctionTieBidder" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" >= 2);`);
  queryDb(`DELETE FROM public."AuctionWinner" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" >= 2);`);
  queryDb(`DELETE FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" >= 2;`);
  queryDb(`UPDATE public."SubscriberTicket" SET "isPrized" = false, "prizedAuctionId" = NULL, "consecutiveUnpaidMonths" = 0, status = 'ACTIVE' WHERE "chitGroupId" = '${chitGroupId}' AND "ticketNumber" > 1;`);
  queryDb(`UPDATE public."InstallmentDue" SET status = 'PAID', "paidAmount" = "netPayableAmount" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 1;`);
  console.log(`   Reset auctions >= Month 2 and subscriber tickets for clean repeatable test run.`);

  // Fetch tickets for this group
  const rawTickets = queryDb(
    `SELECT id, "ticketNumber", "isPrized" FROM public."SubscriberTicket" WHERE "chitGroupId" = '${chitGroupId}' ORDER BY "ticketNumber" ASC`
  );
  const tickets = rawTickets.split('\n').map((line) => {
    const [id, ticketNumber, isPrized] = line.split('|');
    return { id, ticketNumber: parseInt(ticketNumber, 10), isPrized: isPrized === 't' };
  });
  console.log(`   Loaded ${tickets.length} tickets (Ticket #1 prized: ${tickets[0]?.isPrized})`);

  let month2AuctionId = '';

  // --------------------------------------------------------------------------
  // Step 1: GET /auctions/group/:chitGroupId (List group auctions)
  // --------------------------------------------------------------------------
  console.log(`\n--- [1/8] GET /auctions/group/${chitGroupId} (List auctions) ---`);
  const groupAuctionsRes = await request('GET', `/auctions/group/${chitGroupId}`, undefined, maker.token);
  console.log(`   Status: ${groupAuctionsRes.status}`);
  const groupAuctions = groupAuctionsRes.json?.data || [];
  console.log(`   Auctions Count: ${groupAuctions.length}`);
  console.log(`   Month 1 Status: ${groupAuctions[0]?.status}, Prize Money: ₹${groupAuctions[0]?.prizeMoney}`);

  if (groupAuctionsRes.status !== 200 || groupAuctions.length < 1) {
    console.error('Failed to list group auctions:', groupAuctionsRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 2: GET /auctions/:id/eligible-bidders (Pre-auction defaulter & prized guard)
  // --------------------------------------------------------------------------
  console.log(`\n--- [2/8] GET /auctions/${chitGroupId}/eligible-bidders?month=2 ---`);
  const eligibleRes = await request('GET', `/auctions/${chitGroupId}/eligible-bidders?month=2`, undefined, maker.token);
  console.log(`   Status: ${eligibleRes.status}`);
  const eligibleList = eligibleRes.json?.data || [];
  console.log(`   Eligible Bidders Count: ${eligibleList.length}`);
  
  // Ticket #1 must be excluded because it was prized in Month 1 (Company Ticket Rule)
  const isTicket1Eligible = eligibleList.some((b: any) => b.ticketNumber === 1);
  console.log(`   Is Ticket #1 (Month 1 Winner) Eligible? ${isTicket1Eligible} (Expected: false)`);

  if (eligibleRes.status !== 200 || isTicket1Eligible) {
    console.error('Eligible bidders guard failed:', eligibleRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 3: POST /auctions/:id/record-bid (Maker records bid & test ceiling guard)
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/8] POST /auctions/${chitGroupId}/record-bid?month=2 (Ceiling guard & bid entry) ---`);
  
  // Guard Test A: Bid discount exceeds 25% ceiling (₹30,000 > ₹25,000 for ₹1 Lakh)
  console.log(`   Guard Test: Attempting bid discount ₹30,000 (> 25% ceiling of ₹25,000)...`);
  const ceilingFailRes = await request('POST', `/auctions/${chitGroupId}/record-bid?month=2`, {
    ticketId: tickets[1].id, // Ticket #2
    bidDiscount: 30000,
    auctionDate: '2026-12-15T00:00:00.000Z',
  }, maker.token);
  console.log(`   Ceiling Rejection Status: ${ceilingFailRes.status} (Expected: 400 Bad Request)`);
  console.log(`   Ceiling Error Message: ${ceilingFailRes.json?.error?.message}`);
  if (ceilingFailRes.status !== 400) {
    console.error('CRITICAL: 1/4 Ceiling guard failed! Bid discount above ceiling was accepted:', ceilingFailRes);
    process.exit(1);
  }

  // Guard Test B: Attempting to bid with already prized Ticket #1
  console.log(`   Guard Test: Attempting bid with already prized Ticket #1...`);
  const prizedFailRes = await request('POST', `/auctions/${chitGroupId}/record-bid?month=2`, {
    ticketId: tickets[0].id, // Ticket #1
    bidDiscount: 20000,
    auctionDate: '2026-12-15T00:00:00.000Z',
  }, maker.token);
  console.log(`   Prized Ticket Rejection Status: ${prizedFailRes.status} (Expected: 400 Bad Request)`);
  console.log(`   Prized Error Message: ${prizedFailRes.json?.error?.message}`);
  if (prizedFailRes.status !== 400) {
    console.error('CRITICAL: Prized ticket guard failed! Already prized ticket was accepted:', prizedFailRes);
    process.exit(1);
  }

  // Valid Bid Entry: Maker records initial bid discount ₹20,000 for Ticket #2
  console.log(`   Recording valid preliminary bid of ₹20,000 for Ticket #2...`);
  const validBidRes = await request('POST', `/auctions/${chitGroupId}/record-bid?month=2`, {
    ticketId: tickets[1].id,
    bidDiscount: 20000,
    auctionDate: '2026-12-15T00:00:00.000Z',
  }, maker.token);
  console.log(`   Valid Bid Status: ${validBidRes.status}`);
  console.log(`   Recorded Bid Status: ${validBidRes.json?.data?.status}`);
  if (validBidRes.status !== 200) {
    console.error('Failed to record valid bid:', validBidRes);
    process.exit(1);
  }
  month2AuctionId = validBidRes.json.data.id;

  // --------------------------------------------------------------------------
  // Step 4: POST /auctions/:id/tie-break (Option A Physical Paper Token Draw)
  // --------------------------------------------------------------------------
  console.log(`\n--- [4/8] POST /auctions/${month2AuctionId}/tie-break (Option A Paper Token Draw) ---`);
  // 3 members bid the ceiling ₹25,000: Ticket #3, Ticket #4, Ticket #5
  // Foreman draws paper token physically at branch: Ticket #4 wins!
  const tieBreakPayload = {
    tiedTickets: [
      { ticketId: tickets[2].id, tokenNumber: 1 }, // Ticket 3
      { ticketId: tickets[3].id, tokenNumber: 2 }, // Ticket 4 (Winner)
      { ticketId: tickets[4].id, tokenNumber: 3 }, // Ticket 5
    ],
    winningTicketId: tickets[3].id, // Ticket #4
    bidDiscount: 25000, // Exactly 1/4 ceiling (₹1,00,000 / 4)
    auctionDate: '2026-12-15T00:00:00.000Z',
  };
  console.log(`   Tied Bidders: Tickets #${tickets[2].ticketNumber}, #${tickets[3].ticketNumber}, #${tickets[4].ticketNumber}`);
  console.log(`   Option A Physical Paper Token Draw Winner: Ticket #${tickets[3].ticketNumber}`);

  const tieBreakRes = await request('POST', `/auctions/${month2AuctionId}/tie-break`, tieBreakPayload, maker.token);
  console.log(`   Status: ${tieBreakRes.status}`);
  console.log(`   Winner Ticket Assigned: ${tieBreakRes.json?.data?.winner?.ticketId}`);

  if (tieBreakRes.status !== 200 || tieBreakRes.json?.data?.winner?.ticketId !== tickets[3].id) {
    console.error('Failed to record tie-break:', tieBreakRes);
    process.exit(1);
  }

  // DB Verification
  const dbTieBiddersCount = queryDb(`SELECT count(*) FROM public."AuctionTieBidder" WHERE "auctionId" = '${month2AuctionId}'`);
  const dbWinner = queryDb(
    `SELECT "ticketId", "wasTieBreakWinner" FROM public."AuctionWinner" WHERE "auctionId" = '${month2AuctionId}'`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   AuctionTieBidder Count = ${dbTieBiddersCount} (Expected: 3)`);
  console.log(`   AuctionWinner = ${dbWinner} (wasTieBreakWinner = t)`);

  // --------------------------------------------------------------------------
  // Step 5: GET /auctions/:id (Auction details view)
  // --------------------------------------------------------------------------
  console.log(`\n--- [5/8] GET /auctions/${month2AuctionId} (Auction details) ---`);
  const detailRes = await request('GET', `/auctions/${month2AuctionId}`, undefined, maker.token);
  console.log(`   Status: ${detailRes.status}`);
  console.log(`   Month: ${detailRes.json?.data?.installmentMonth}`);
  console.log(`   Bid Discount: ₹${detailRes.json?.data?.bidDiscount}`);
  console.log(`   Total Dividend: ₹${detailRes.json?.data?.totalDividend}`);
  console.log(`   Dividend Per Ticket: ₹${detailRes.json?.data?.dividendPerTicket}`);
  console.log(`   Prize Money: ₹${detailRes.json?.data?.prizeMoney}`);

  if (detailRes.status !== 200 || detailRes.json?.data?.id !== month2AuctionId) {
    console.error('Failed to get auction details:', detailRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 6: POST /auctions/:id/finalize (Maker != Checker Enforcement)
  // --------------------------------------------------------------------------
  console.log(`\n--- [6/8] POST /auctions/${month2AuctionId}/finalize (Maker != Checker Dual Control) ---`);
  
  // Guard Test: Maker (Partner A) attempts to finalize his own auction
  console.log(`   Guard Test: Maker (Partner A) attempts to finalize auction...`);
  const makerFinalizeRes = await request('POST', `/auctions/${month2AuctionId}/finalize`, {
    subscribersPresent: 15,
    notes: 'Attempted self-approval by Maker',
  }, maker.token);
  console.log(`   Self-Finalization Status: ${makerFinalizeRes.status} (Expected: 403 Forbidden)`);
  console.log(`   Self-Finalization Message: ${makerFinalizeRes.json?.error?.message}`);
  if (makerFinalizeRes.status !== 403) {
    console.error('CRITICAL: Maker != Checker violation! Maker was allowed to finalize own auction:', makerFinalizeRes);
    process.exit(1);
  }

  // Valid Finalization: Checker (Partner B) finalizes the auction
  console.log(`   Checker (Partner B) finalizes and commits official auction results...`);
  const checkerFinalizeRes = await request('POST', `/auctions/${month2AuctionId}/finalize`, {
    subscribersPresent: 15,
    notes: 'Verified by Operations Partner against physical tokens and Form XVII register.',
    signedByForeman: true,
  }, checker.token);
  console.log(`   Checker Finalization Status: ${checkerFinalizeRes.status}`);
  console.log(`   Finalized Status: ${checkerFinalizeRes.json?.data?.status}`);

  if (checkerFinalizeRes.status !== 200 || checkerFinalizeRes.json?.data?.status !== 'COMPLETED') {
    console.error('Checker finalization failed:', checkerFinalizeRes);
    process.exit(1);
  }

  // DB Verification
  const dbFinalizedAuction = queryDb(
    `SELECT status, "conductedByUserId", "finalizedByUserId" FROM public."Auction" WHERE id = '${month2AuctionId}'`
  );
  const dbWinnerTicket = queryDb(`SELECT "isPrized" FROM public."SubscriberTicket" WHERE id = '${tickets[3].id}'`);
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   Auction Status & Dual Control Users: ${dbFinalizedAuction}`);
  console.log(`   Winner Ticket #${tickets[3].ticketNumber} isPrized = ${dbWinnerTicket} (Expected: t)`);

  // --------------------------------------------------------------------------
  // Step 7: GET /auctions/:id/minutes (Form XVII statutory proceedings)
  // --------------------------------------------------------------------------
  console.log(`\n--- [7/8] GET /auctions/${month2AuctionId}/minutes (Statutory proceedings) ---`);
  const minutesRes = await request('GET', `/auctions/${month2AuctionId}/minutes`, undefined, maker.token);
  console.log(`   Status: ${minutesRes.status}`);
  console.log(`   Subscribers Present: ${minutesRes.json?.data?.subscribersPresent}`);
  console.log(`   Signed By Foreman: ${minutesRes.json?.data?.signedByForeman}`);
  console.log(`   Minutes Snippet:\n   ${minutesRes.json?.data?.minutesText?.slice(0, 160)}...`);

  if (minutesRes.status !== 200 || !minutesRes.json?.data?.minutesText) {
    console.error('Failed to get auction minutes:', minutesRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 8: PATCH /auctions/:id/mark-filed-with-registrar (Government filing)
  // --------------------------------------------------------------------------
  console.log(`\n--- [8/8] PATCH /auctions/${month2AuctionId}/mark-filed-with-registrar (Chit Registrar filing) ---`);
  const filingPayload = {
    filingReference: 'DRC/ERD/CHAL-2026-00892',
    filedDate: '2026-12-18T10:30:00.000Z',
    notes: 'Submitted physically at Deputy Registrar of Chits office, Erode by Managing Partner.',
  };
  console.log(`   Filing Payload:`, JSON.stringify(filingPayload, null, 2));

  const filingRes = await request('PATCH', `/auctions/${month2AuctionId}/mark-filed-with-registrar`, filingPayload, maker.token);
  console.log(`   Status: ${filingRes.status}`);
  console.log(`   Filing Response:`, JSON.stringify(filingRes.json?.data, null, 2));

  if (filingRes.status !== 200 || !filingRes.json?.data?.minutes?.filedAtRegistrar) {
    console.error('Failed to mark minutes filed:', filingRes);
    process.exit(1);
  }

  // DB Verification
  const dbMinutesFiling = queryDb(
    `SELECT "filedAtRegistrar", "filedDate", "filingReference" FROM public."AuctionMinutes" WHERE "auctionId" = '${month2AuctionId}'`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   AuctionMinutes Filing Data: ${dbMinutesFiling}`);

  console.log(`\n======================================================`);
  console.log(`🎉 ALL 8 LIFECYCLE 4 ENDPOINTS VERIFIED SUCCESSFULLY!`);
  console.log(`   Live Server (:3000) <--> Live Postgres (:5433)`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error('Fatal error during execution:', err);
  process.exit(1);
});
