// ==============================================================================
// Kumaran Chits — Empirical Financial Challenger & Boundary Fuzzing Harness
// Target: http://127.0.0.1:3000 against live PostgreSQL 17 (chitflow_dev)
// Compliance: AGENTS.md 10 Invariant Architectural Guardrails
// ==============================================================================

import { execFileSync } from 'child_process';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';

function queryDb(sql: string): string {
  try {
    const cleanSql = sql.trim().replace(/;+$/, '');
    return execFileSync(
      'docker',
      ['exec', 'chitflow-db', 'psql', '-U', 'chitflow', '-d', 'chitflow_dev', '-t', '-A', '-c', cleanSql],
      { encoding: 'utf-8' }
    ).trim();
  } catch (err: any) {
    return `[DB ERROR]: ${err.message}`;
  }
}

function queryDbJson<T = any>(sql: string): T {
  try {
    const cleanSql = sql.trim().replace(/;+$/, '');
    const raw = execFileSync(
      'docker',
      ['exec', 'chitflow-db', 'psql', '-U', 'chitflow', '-d', 'chitflow_dev', '-t', '-A', '-c', `SELECT json_agg(t) FROM (${cleanSql}) t;`],
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
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

interface TestAssertion {
  testId: string;
  category: string;
  description: string;
  endpoint: string;
  expectedStatus: number;
  observedStatus: number;
  passed: boolean;
  details: string;
}

const assertions: TestAssertion[] = [];

function assertResult(item: {
  testId: string;
  category: string;
  description: string;
  endpoint: string;
  expectedStatus: number;
  observedStatus: number;
  condition: boolean;
  details: string;
}) {
  const passed = item.observedStatus === item.expectedStatus && item.condition;
  assertions.push({
    testId: item.testId,
    category: item.category,
    description: item.description,
    endpoint: item.endpoint,
    expectedStatus: item.expectedStatus,
    observedStatus: item.observedStatus,
    passed,
    details: item.details,
  });

  const mark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${mark}] ${item.testId} - ${item.description}`);
  console.log(`       Endpoint: ${item.endpoint} | Status: ${item.observedStatus} (Exp: ${item.expectedStatus})`);
  console.log(`       Details: ${item.details}\n`);
}

async function run() {
  console.log(`==============================================================================`);
  console.log(`EMPIRICAL CHALLENGER: KUMARAN CHITS FINANCIAL BOUNDARY & INVARIANT HARNESS`);
  console.log(`Target: ${BASE_URL} | Database: chitflow_dev (PostgreSQL 17)`);
  console.log(`==============================================================================\n`);

  // 1. Authenticate Personas
  console.log(`--- [1] Authenticating Test Personas ---`);
  const adminA = await login('9876543210'); // Managing Partner (Maker)
  const adminB = await login('9876543211'); // Operations Partner (Checker)
  const accountant = await login('9876543213'); // Desk Accountant
  const agent = await login('9876543214'); // Field Agent Murugan
  console.log(`   Admin A (Maker): ${adminA.userId}`);
  console.log(`   Admin B (Checker): ${adminB.userId}`);
  console.log(`   Accountant: ${accountant.userId}`);
  console.log(`   Field Agent: ${agent.userId}\n`);

  // Ensure a test chit group exists: 1 Lakh, 20 months, 20 members (KC-LIVE-20M-01)
  let chitGroupId = queryDb(`SELECT id FROM public."ChitGroup" WHERE "groupCode" = 'KC-LIVE-20M-01'`);
  if (!chitGroupId || chitGroupId.startsWith('[DB ERROR]')) {
    console.log(`Group KC-LIVE-20M-01 not found. Querying any ACTIVE chit group...`);
    chitGroupId = queryDb(`SELECT id FROM public."ChitGroup" WHERE status = 'ACTIVE' LIMIT 1;`);
  }
  console.log(`Using Chit Group ID: ${chitGroupId}\n`);

  // Get tickets for this group
  const ticketsRaw = queryDbJson<Array<{ id: string; ticketNumber: number; customerId: string; isPrized: boolean }>>(
    `SELECT id, "ticketNumber", "customerId", "isPrized" FROM public."SubscriberTicket" WHERE "chitGroupId" = '${chitGroupId}' ORDER BY "ticketNumber" ASC;`
  );
  console.log(`Found ${ticketsRaw.length} subscriber tickets in group.`);

  const dummyUuid = '00000000-0000-0000-0000-000000000000';
  const targetTicket = ticketsRaw.find((t) => t.ticketNumber > 1) || ticketsRaw[0];

  // ============================================================================
  // SECTION 1: ZERO-PAISE MANDATE & NEGATIVE VALUE FUZZING (AGENTS.md Rule 2)
  // ============================================================================
  console.log(`============================================================================`);
  console.log(`SECTION 1: ZERO-PAISE MANDATE & FRACTIONAL/NEGATIVE VALUE FUZZING`);
  console.log(`============================================================================\n`);

  // 1.1 POST /payments with fractional amount (e.g. 2500.50)
  {
    const res = await request('POST', '/payments', {
      ticketId: targetTicket.id,
      installmentMonth: 2,
      amount: 2500.5,
      paymentMethod: 'CASH',
    }, accountant.token);
    assertResult({
      testId: 'ZERO-PAISE-01',
      category: 'Zero-Paise Mandate',
      description: 'Reject fractional paise payment (2500.50)',
      endpoint: 'POST /api/v1/payments',
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // 1.2 POST /payments with negative amount (-5000)
  {
    const res = await request('POST', '/payments', {
      ticketId: targetTicket.id,
      installmentMonth: 2,
      amount: -5000,
      paymentMethod: 'CASH',
    }, accountant.token);
    assertResult({
      testId: 'ZERO-PAISE-02',
      category: 'Zero-Paise Mandate',
      description: 'Reject negative payment amount (-5000)',
      endpoint: 'POST /api/v1/payments',
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // 1.3 POST /payments with ₹0 amount
  {
    const res = await request('POST', '/payments', {
      ticketId: targetTicket.id,
      installmentMonth: 2,
      amount: 0,
      paymentMethod: 'CASH',
    }, accountant.token);
    assertResult({
      testId: 'ZERO-PAISE-03',
      category: 'Zero-Paise Mandate',
      description: 'Reject ₹0 payment attempt',
      endpoint: 'POST /api/v1/payments',
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // 1.4 POST /payments with string payload ("three thousand")
  {
    const res = await request('POST', '/payments', {
      ticketId: targetTicket.id,
      installmentMonth: 2,
      amount: 'three thousand',
      paymentMethod: 'CASH',
    }, accountant.token);
    assertResult({
      testId: 'ZERO-PAISE-04',
      category: 'Zero-Paise Mandate',
      description: 'Reject non-numeric string amount in payment',
      endpoint: 'POST /api/v1/payments',
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // 1.5 POST /collections/record with fractional paise (3950.75)
  {
    const res = await request('POST', '/collections/record', {
      ticketId: targetTicket.id,
      installmentMonth: 2,
      amount: 3950.75,
      paymentMethod: 'CASH',
    }, agent.token);
    assertResult({
      testId: 'ZERO-PAISE-05',
      category: 'Zero-Paise Mandate',
      description: 'Reject fractional collection amount (3950.75)',
      endpoint: 'POST /api/v1/collections/record',
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // 1.6 POST /collections/cash-handover/acknowledge with fractional amount (45000.50)
  {
    const res = await request('POST', '/collections/cash-handover/acknowledge', {
      collectorUserId: agent.userId,
      acknowledgedAmount: 45000.5,
      paymentIds: [dummyUuid],
    }, adminB.token);
    assertResult({
      testId: 'ZERO-PAISE-06',
      category: 'Zero-Paise Mandate',
      description: 'Reject fractional vault handover amount (45000.50)',
      endpoint: 'POST /api/v1/collections/cash-handover/acknowledge',
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // 1.7 POST /chits/new with fractional chit pool value (100000.50)
  {
    const res = await request('POST', '/chits/new', {
      groupCode: 'KCA-FLOAT-LIVE',
      groupName: 'Float Live Chit',
      chitValue: 100000.5,
      durationMonths: 20,
      totalTickets: 20,
      startDate: '2027-01-01T00:00:00.000Z',
      endDate: '2028-08-31T00:00:00.000Z',
    }, adminA.token);
    assertResult({
      testId: 'ZERO-PAISE-07',
      category: 'Zero-Paise Mandate',
      description: 'Reject fractional chitValue pool creation (100000.50)',
      endpoint: 'POST /api/v1/chits/new',
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // 1.8 POST /auctions/:id/record-bid with fractional bid discount (22000.25)
  {
    const res = await request('POST', `/auctions/${chitGroupId}/record-bid?month=2`, {
      ticketId: targetTicket.id,
      bidDiscount: 22000.25,
      auctionDate: '2026-12-15T00:00:00.000Z',
    }, adminA.token);
    assertResult({
      testId: 'ZERO-PAISE-08',
      category: 'Zero-Paise Mandate',
      description: 'Reject fractional auction bid discount (22000.25)',
      endpoint: `POST /api/v1/auctions/:id/record-bid?month=2`,
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // ============================================================================
  // SECTION 2: AUCTION CEILING & COMMISSION FLOOR BOUNDARIES (AGENTS.md Rule 6)
  // ============================================================================
  console.log(`============================================================================`);
  console.log(`SECTION 2: AUCTION CEILING & COMMISSION FLOOR BOUNDARIES`);
  console.log(`============================================================================\n`);

  // For a ₹1,00,000 chit scheme:
  // Commission Floor: 4% = ₹4,000
  // Ceiling: 25% (1/4) = ₹25,000

  // 2.1 Sub-Floor Bid Discount (< 4% Foreman Commission: e.g. ₹3,999 or ₹3,000)
  {
    const res = await request('POST', `/auctions/${chitGroupId}/record-bid?month=2`, {
      ticketId: targetTicket.id,
      bidDiscount: 3999, // Below ₹4,000 floor
      auctionDate: '2026-12-15T00:00:00.000Z',
    }, adminA.token);
    assertResult({
      testId: 'AUCTION-BOUND-01',
      category: 'Auction Floor Guard',
      description: 'Reject bid discount below 4% foreman commission floor (₹3,999 on ₹1L chit)',
      endpoint: `POST /api/v1/auctions/:id/record-bid?month=2`,
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // 2.2 Super-Ceiling Bid Discount (> 25% 1/4 ceiling: e.g. ₹25,001)
  {
    const res = await request('POST', `/auctions/${chitGroupId}/record-bid?month=2`, {
      ticketId: targetTicket.id,
      bidDiscount: 25001, // Exceeds ₹25,000 ceiling
      auctionDate: '2026-12-15T00:00:00.000Z',
    }, adminA.token);
    assertResult({
      testId: 'AUCTION-BOUND-02',
      category: 'Auction Ceiling Guard',
      description: 'Reject bid discount exceeding 1/4 (25%) statutory ceiling (₹25,001 on ₹1L chit)',
      endpoint: `POST /api/v1/auctions/:id/record-bid?month=2`,
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // 2.3 Month 1 Auction Forbidden (Rule 5: Month 1 is Company pool, NO auction)
  {
    const res = await request('POST', `/auctions/${chitGroupId}/record-bid?month=1`, {
      ticketId: targetTicket.id,
      bidDiscount: 20000,
      auctionDate: '2026-11-15T00:00:00.000Z',
    }, adminA.token);
    assertResult({
      testId: 'AUCTION-BOUND-03',
      category: 'Month 1 Rule',
      description: 'Reject auction bid submission in Month 1 (Company pool, ₹0 dividend)',
      endpoint: `POST /api/v1/auctions/:id/record-bid?month=1`,
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // 2.4 Month N Auction Forbidden (Rule 5: Month N is direct settlement, NO auction)
  {
    const res = await request('POST', `/auctions/${chitGroupId}/record-bid?month=20`, {
      ticketId: targetTicket.id,
      bidDiscount: 20000,
      auctionDate: '2028-06-15T00:00:00.000Z',
    }, adminA.token);
    assertResult({
      testId: 'AUCTION-BOUND-04',
      category: 'Month N Rule',
      description: 'Reject auction bid submission in Month N (Month 20 direct settlement)',
      endpoint: `POST /api/v1/auctions/:id/record-bid?month=20`,
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // ============================================================================
  // SECTION 3: UNIVERSAL EQUAL DIVIDEND CONSERVATION (AGENTS.md Rule 4)
  // ============================================================================
  console.log(`============================================================================`);
  console.log(`SECTION 3: UNIVERSAL EQUAL DIVIDEND CONSERVATION & POOL MATHEMATICS`);
  console.log(`============================================================================\n`);

  // Reset Month 2 auction state cleanly to record a known bid: ₹21,000 discount
  queryDb(`DELETE FROM public."AuctionMinutes" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 2)`);
  queryDb(`DELETE FROM public."AuctionTieBidder" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 2)`);
  queryDb(`DELETE FROM public."AuctionWinner" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 2)`);
  queryDb(`DELETE FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 2`);
  const winningTicket = ticketsRaw.find((t) => t.ticketNumber === 2)!;
  queryDb(`UPDATE public."SubscriberTicket" SET "isPrized" = false, "prizedAuctionId" = NULL, "consecutiveUnpaidMonths" = 0, status = 'ACTIVE' WHERE "chitGroupId" = '${chitGroupId}' AND "ticketNumber" > 1`);
  queryDb(`UPDATE public."InstallmentDue" SET status = 'PAID', "paidAmount" = "netPayableAmount" WHERE "chitGroupId" = '${chitGroupId}' AND "ticketId" = '${winningTicket.id}' AND "installmentMonth" = 1`);

  // Record valid winning bid: ₹21,000 discount on ₹1,00,000 chit
  // Foreman commission = 4% = ₹4,000
  // Total dividend = 21,000 - 4,000 = 17,000
  // Prize money = 100,000 - 21,000 = 79,000
  const recordBidRes = await request('POST', `/auctions/${chitGroupId}/record-bid?month=2`, {
    ticketId: winningTicket.id,
    bidDiscount: 21000,
    auctionDate: '2026-12-15T00:00:00.000Z',
  }, adminA.token);

  assertResult({
    testId: 'DIVIDEND-01',
    category: 'Universal Dividend Conservation',
    description: 'Record valid winning bid discount of ₹21,000',
    endpoint: `POST /api/v1/auctions/:id/record-bid?month=2`,
    expectedStatus: 200,
    observedStatus: recordBidRes.status,
    condition: recordBidRes.status === 200,
    details: `Auction ID: ${recordBidRes.json?.data?.id}, Error: ${JSON.stringify(recordBidRes.json)}`,
  });

  const month2AuctionId = recordBidRes.json?.data?.id;

  // Finalize auction using Checker (adminB) to enforce Maker != Checker
  const finalizeRes = await request('POST', `/auctions/${month2AuctionId}/finalize`, {
    subscribersPresent: 18,
    notes: 'Empirical challenger verification test',
    signedByForeman: true,
  }, adminB.token);

  assertResult({
    testId: 'DIVIDEND-02',
    category: 'Dual Control Finalization',
    description: 'Finalize auction by independent checker (Maker != Checker)',
    endpoint: `POST /api/v1/auctions/:id/finalize`,
    expectedStatus: 200,
    observedStatus: finalizeRes.status,
    condition: finalizeRes.status === 200,
    details: `Status: ${finalizeRes.json?.data?.status}, Winner: #${finalizeRes.json?.data?.winner?.ticket?.ticketNumber}`,
  });

  // Verify Auction Math Invariants on the finalized auction
  const auctionRecord = queryDbJson<any>(
    `SELECT "bidDiscount", "foremanCommissionAmount", "totalDividend", "dividendPerTicket", "prizeMoney" FROM public."Auction" WHERE id = '${month2AuctionId}';`
  )[0];

  const bidDiscount = BigInt(auctionRecord.bidDiscount);
  const commAmount = BigInt(auctionRecord.foremanCommissionAmount);
  const totalDiv = BigInt(auctionRecord.totalDividend);
  const divPerTicket = BigInt(auctionRecord.dividendPerTicket);
  const prizeMoney = BigInt(auctionRecord.prizeMoney);
  const chitGross = 100000n;

  const inv1 = commAmount + totalDiv === bidDiscount;
  const inv2 = prizeMoney + bidDiscount === chitGross;
  const inv3 = totalDiv === divPerTicket * 20n;

  assertResult({
    testId: 'MATH-INV-01',
    category: 'Universal Dividend Conservation',
    description: 'Foreman Commission (₹4,000) + Total Dividend (₹17,000) == Winning Discount (₹21,000)',
    endpoint: 'DB Query public.Auction',
    expectedStatus: 200,
    observedStatus: inv1 ? 200 : 500,
    condition: inv1,
    details: `Commission: ₹${commAmount} + Dividend: ₹${totalDiv} == Discount: ₹${bidDiscount}`,
  });

  assertResult({
    testId: 'MATH-INV-02',
    category: 'Pool Conservation',
    description: 'Prize Money (₹79,000) + Bid Discount (₹21,000) == Chit Gross Value (₹1,00,000)',
    endpoint: 'DB Query public.Auction',
    expectedStatus: 200,
    observedStatus: inv2 ? 200 : 500,
    condition: inv2,
    details: `Prize: ₹${prizeMoney} + Discount: ₹${bidDiscount} == Gross: ₹${chitGross}`,
  });

  // Clean up Month 3 dues and Month 3 auction and payments for clean test
  queryDb(`DELETE FROM public."PaymentReversal" WHERE "paymentId" IN (SELECT id FROM public."Payment" WHERE "ticketId" IN (SELECT id FROM public."SubscriberTicket" WHERE "chitGroupId" = '${chitGroupId}') AND "installmentMonth" >= 3)`);
  queryDb(`DELETE FROM public."Receipt" WHERE "paymentId" IN (SELECT id FROM public."Payment" WHERE "ticketId" IN (SELECT id FROM public."SubscriberTicket" WHERE "chitGroupId" = '${chitGroupId}') AND "installmentMonth" >= 3)`);
  queryDb(`DELETE FROM public."PaymentAllocation" WHERE "installmentDueId" IN (SELECT id FROM public."InstallmentDue" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" >= 3)`);
  queryDb(`DELETE FROM public."Payment" WHERE "ticketId" IN (SELECT id FROM public."SubscriberTicket" WHERE "chitGroupId" = '${chitGroupId}') AND "installmentMonth" >= 3`);
  queryDb(`DELETE FROM public."InstallmentDue" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 3`);
  queryDb(`DELETE FROM public."AuctionMinutes" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" >= 3)`);
  queryDb(`DELETE FROM public."AuctionTieBidder" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" >= 3)`);
  queryDb(`DELETE FROM public."AuctionWinner" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" >= 3)`);
  queryDb(`DELETE FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" >= 3`);

  // Generate Month 3 dues from Month 2 auction result
  const genDuesRes = await request('POST', `/installments/group/${chitGroupId}/month/3/generate`, {
    cycleStartDate: '2027-01-15T00:00:00.000Z',
    cycleEndDate: '2027-02-15T00:00:00.000Z',
    dueDate: '2027-02-15T00:00:00.000Z',
  }, adminA.token);

  assertResult({
    testId: 'DIVIDEND-03',
    category: 'Universal Dividend Dues Generation',
    description: 'Generate Month 3 dues applying universal dividend deduction',
    endpoint: `POST /api/v1/installments/group/:id/month/3/generate`,
    expectedStatus: 200,
    observedStatus: genDuesRes.status,
    condition: genDuesRes.status === 200,
    details: `Dividend: ₹${genDuesRes.json?.data?.dividendDeduction}, Net: ₹${genDuesRes.json?.data?.netPayableAmount}`,
  });

  // Check that EVERY member in Month 3 has identical Inet = Ibase - Div (Universal Dividend)
  const allDues = queryDbJson<Array<{ ticketId: string; ticketNumber: number; grossAmount: any; dividendDeduction: any; netPayableAmount: any; status: string }>>(
    `SELECT d."ticketId", t."ticketNumber", d."grossAmount", d."dividendDeduction", d."netPayableAmount", d."status"
     FROM public."InstallmentDue" d
     JOIN public."SubscriberTicket" t ON d."ticketId" = t.id
     WHERE d."chitGroupId" = '${chitGroupId}' AND d."installmentMonth" = 3
     ORDER BY t."ticketNumber" ASC;`
  );

  console.log(`Generated ${allDues.length} dues for Month 3. First 3:`, allDues.slice(0, 3));

  const expectedDivNum = Number(divPerTicket);
  const expectedNetNum = 5000 - expectedDivNum;
  const allMembersIdentical = allDues.length === 20 && allDues.every(
    (d) => Number(d.grossAmount) === 5000 && Number(d.dividendDeduction) === expectedDivNum && Number(d.netPayableAmount) === expectedNetNum
  );

  // Specifically verify that ticket #2 (the auction winner) also received the dividend deduction!
  const winnerDue = allDues.find((d) => d.ticketNumber === 2);
  const winnerReceivedDividend = winnerDue && Number(winnerDue.dividendDeduction) === expectedDivNum && Number(winnerDue.netPayableAmount) === expectedNetNum;

  assertResult({
    testId: 'DIVIDEND-04',
    category: 'Universal Equal Dividend',
    description: 'All 20 members (including auction winner #2) pay identical net installment (₹4,150)',
    endpoint: 'DB Query public.InstallmentDue (Month 3)',
    expectedStatus: 200,
    observedStatus: allMembersIdentical && winnerReceivedDividend ? 200 : 500,
    condition: Boolean(allMembersIdentical && winnerReceivedDividend),
    details: `All 20 dues identical: ${allMembersIdentical}. Winner ticket #2 net payable: ₹${winnerDue?.netPayableAmount}`,
  });

  // ============================================================================
  // SECTION 4: SINGLE DISCRETE PAYMENT & DEFECT REJECTIONS (AGENTS.md Rule 8)
  // ============================================================================
  console.log(`============================================================================`);
  console.log(`SECTION 4: SINGLE DISCRETE PAYMENT & REJECTION RULES (ADR-07)`);
  console.log(`============================================================================\n`);

  // Target ticket #3 for discrete payment tests
  const ticket3 = ticketsRaw.find((t) => t.ticketNumber === 3)!;
  const ticket3Due = queryDbJson<any>(
    `SELECT id, "netPayableAmount", status FROM public."InstallmentDue" WHERE "ticketId" = '${ticket3.id}' AND "installmentMonth" = 3;`
  )[0];

  const netPayable = Number(ticket3Due.netPayableAmount);
  console.log(`Ticket #3 Month 3 Due ID: ${ticket3Due.id}, Net Payable: ₹${netPayable}\n`);

  // 4.1 Underpayment / Partial Payment Attempt (< netPayable)
  {
    const partialAmount = netPayable - 100; // e.g. ₹4,050 instead of ₹4,150
    const res = await request('POST', '/payments', {
      ticketId: ticket3.id,
      installmentMonth: 3,
      amount: partialAmount,
      paymentMethod: 'CASH',
      notes: 'Adversarial partial payment attempt',
    }, accountant.token);

    assertResult({
      testId: 'PAYMENT-01',
      category: 'Single Discrete Payment',
      description: `Reject partial payment attempt (₹${partialAmount} < ₹${netPayable})`,
      endpoint: 'POST /api/v1/payments',
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // 4.2 Overpayment / Advance Payment Attempt (> netPayable)
  {
    const overAmount = netPayable + 500; // e.g. ₹4,650 instead of ₹4,150
    const res = await request('POST', '/payments', {
      ticketId: ticket3.id,
      installmentMonth: 3,
      amount: overAmount,
      paymentMethod: 'CASH',
      notes: 'Adversarial overpayment attempt',
    }, accountant.token);

    assertResult({
      testId: 'PAYMENT-02',
      category: 'Single Discrete Payment',
      description: `Reject overpayment / advance attempt (₹${overAmount} > ₹${netPayable})`,
      endpoint: 'POST /api/v1/payments',
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // 4.3 Exact Discrete Payment (Must succeed with HTTP 201)
  let successfulPaymentId = '';
  {
    const res = await request('POST', '/payments', {
      ticketId: ticket3.id,
      installmentMonth: 3,
      amount: netPayable,
      paymentMethod: 'CASH',
      notes: 'Exact discrete payment for Month 3',
    }, accountant.token);

    successfulPaymentId = res.json?.data?.payment?.id || res.json?.data?.id || '';
    const receiptNum = res.json?.data?.receipt?.receiptNumber || res.json?.data?.receiptNumber || '';
    assertResult({
      testId: 'PAYMENT-03',
      category: 'Single Discrete Payment',
      description: `Accept exact discrete payment (₹${netPayable}) in full`,
      endpoint: 'POST /api/v1/payments',
      expectedStatus: 201,
      observedStatus: res.status,
      condition: res.status === 201,
      details: `Receipt No: ${receiptNum}, Payment ID: ${successfulPaymentId}`,
    });
  }

  // Verify in database that due status transitioned to PAID
  const updatedDueStatus = queryDb(
    `SELECT status FROM public."InstallmentDue" WHERE "ticketId" = '${ticket3.id}' AND "installmentMonth" = 3;`
  );
  assertResult({
    testId: 'PAYMENT-04',
    category: 'Single Discrete Payment',
    description: 'InstallmentDue status transitioned to PAID in database',
    endpoint: 'DB Query public.InstallmentDue',
    expectedStatus: 200,
    observedStatus: updatedDueStatus === 'PAID' ? 200 : 500,
    condition: updatedDueStatus === 'PAID',
    details: `Observed status in DB: ${updatedDueStatus}`,
  });

  // 4.4 Duplicate Payment Attempt on Already PAID Due (Must fail closed with HTTP 400)
  {
    const res = await request('POST', '/payments', {
      ticketId: ticket3.id,
      installmentMonth: 3,
      amount: netPayable,
      paymentMethod: 'CASH',
      notes: 'Duplicate payment on already PAID installment',
    }, accountant.token);

    assertResult({
      testId: 'PAYMENT-05',
      category: 'Single Discrete Payment',
      description: 'Strictly reject duplicate payment on already PAID installment due',
      endpoint: 'POST /api/v1/payments',
      expectedStatus: 400,
      observedStatus: res.status,
      condition: res.status === 400,
      details: `Response: ${JSON.stringify(res.json?.error || res.json)}`,
    });
  }

  // ============================================================================
  // SECTION 5: DUAL CONTROL & MAKER-CHECKER (AGENTS.md Rule 10)
  // ============================================================================
  console.log(`============================================================================`);
  console.log(`SECTION 5: DUAL CONTROL & MAKER-CHECKER SEPARATION`);
  console.log(`============================================================================\n`);

  // 5.1 Maker finalizing own auction
  // Record auction for Month 4 with adminA as maker
  queryDb(`DELETE FROM public."AuctionMinutes" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 4)`);
  queryDb(`DELETE FROM public."AuctionTieBidder" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 4)`);
  queryDb(`DELETE FROM public."AuctionWinner" WHERE "auctionId" IN (SELECT id FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 4)`);
  queryDb(`DELETE FROM public."Auction" WHERE "chitGroupId" = '${chitGroupId}' AND "installmentMonth" = 4`);

  const winningTicket4 = ticketsRaw.find((t) => t.ticketNumber === 4)!;
  const auction4Res = await request('POST', `/auctions/${chitGroupId}/record-bid?month=4`, {
    ticketId: winningTicket4.id,
    bidDiscount: 20000,
    auctionDate: '2027-02-15T00:00:00.000Z',
  }, adminA.token);

  const auction4Id = auction4Res.json?.data?.id;

  // Maker (adminA) attempts to finalize own auction
  {
    const selfFinalizeRes = await request('POST', `/auctions/${auction4Id}/finalize`, {
      subscribersPresent: 15,
      notes: 'Self-finalization attempt',
      signedByForeman: true,
    }, adminA.token);

    assertResult({
      testId: 'MAKER-CHECKER-01',
      category: 'Dual Control',
      description: 'Reject auction finalization when maker_user_id == checker_user_id',
      endpoint: `POST /api/v1/auctions/:id/finalize`,
      expectedStatus: 403,
      observedStatus: selfFinalizeRes.status,
      condition: selfFinalizeRes.status === 403,
      details: `Response: ${JSON.stringify(selfFinalizeRes.json?.error || selfFinalizeRes.json)}`,
    });
  }

  // Independent checker (adminB) finalizes successfully
  {
    const checkerFinalizeRes = await request('POST', `/auctions/${auction4Id}/finalize`, {
      subscribersPresent: 15,
      notes: 'Independent checker finalization',
      signedByForeman: true,
    }, adminB.token);

    assertResult({
      testId: 'MAKER-CHECKER-02',
      category: 'Dual Control',
      description: 'Approve auction finalization by distinct checker (adminB != adminA)',
      endpoint: `POST /api/v1/auctions/:id/finalize`,
      expectedStatus: 200,
      observedStatus: checkerFinalizeRes.status,
      condition: checkerFinalizeRes.status === 200,
      details: `Status: ${checkerFinalizeRes.json?.data?.status}`,
    });
  }

  // 5.2 Payment Reversal Dual Control
  // Accountant requests reversal on the payment made above
  if (successfulPaymentId) {
    const revReqRes = await request('POST', `/payments/${successfulPaymentId}/request-reversal`, {
      reason: 'Entered wrong payment mode during cash entry',
    }, accountant.token);

    const revReqPass = revReqRes.status === 200 || revReqRes.status === 201;
    assertResult({
      testId: 'MAKER-CHECKER-03',
      category: 'Dual Control',
      description: 'Accountant (Maker) requests payment reversal',
      endpoint: `POST /api/v1/payments/:id/request-reversal`,
      expectedStatus: 200,
      observedStatus: revReqRes.status,
      condition: revReqPass,
      details: `Response: ${JSON.stringify(revReqRes.json?.data || revReqRes.json)}`,
    });

    // Reversal Maker (accountant) attempts to approve own reversal
    const selfApproveRes = await request('POST', `/payments/${successfulPaymentId}/approve-reversal`, {
      notes: 'Maker attempting to approve own reversal',
    }, accountant.token);

    assertResult({
      testId: 'MAKER-CHECKER-04',
      category: 'Dual Control',
      description: 'Reject payment reversal approval by same maker user or non-checker',
      endpoint: `POST /api/v1/payments/:id/approve-reversal`,
      expectedStatus: 403,
      observedStatus: selfApproveRes.status,
      condition: selfApproveRes.status === 403,
      details: `Response: ${JSON.stringify(selfApproveRes.json?.error || selfApproveRes.json)}`,
    });

    // Distinct Checker (adminB) approves reversal
    const checkerApproveRes = await request('POST', `/payments/${successfulPaymentId}/approve-reversal`, {
      notes: 'Partner B approves payment reversal',
    }, adminB.token);

    assertResult({
      testId: 'MAKER-CHECKER-05',
      category: 'Dual Control',
      description: 'Approve payment reversal by independent checker (Partner B)',
      endpoint: `POST /api/v1/payments/:id/approve-reversal`,
      expectedStatus: 200,
      observedStatus: checkerApproveRes.status,
      condition: checkerApproveRes.status === 200,
      details: `Response: ${JSON.stringify(checkerApproveRes.json?.data || checkerApproveRes.json)}`,
    });
  }

  // ============================================================================
  // SECTION 6: PRE-AUCTION DEFAULTER GUARD (AGENTS.md Rule 8 & ADR-07)
  // ============================================================================
  console.log(`============================================================================`);
  console.log(`SECTION 6: PRE-AUCTION DEFAULTER INELIGIBILITY GUARD (ADR-07)`);
  console.log(`============================================================================\n`);

  const ticket5 = ticketsRaw.find((t) => t.ticketNumber === 5)!;

  // Mark ticket #5 as having consecutive unpaid arrears
  queryDb(`UPDATE public."SubscriberTicket" SET "consecutiveUnpaidMonths" = 1 WHERE id = '${ticket5.id}';`);

  // Attempt to submit winning bid for defaulter ticket #5
  {
    const defaulterBidRes = await request('POST', `/auctions/${chitGroupId}/record-bid?month=5`, {
      ticketId: ticket5.id,
      bidDiscount: 20000,
      auctionDate: '2027-03-15T00:00:00.000Z',
    }, adminA.token);

    assertResult({
      testId: 'DEFAULTER-01',
      category: 'Defaulter Ineligibility Guard',
      description: 'Reject auction bid from subscriber with arrears (consecutiveUnpaidMonths > 0)',
      endpoint: `POST /api/v1/auctions/:id/record-bid?month=5`,
      expectedStatus: 400,
      observedStatus: defaulterBidRes.status,
      condition: defaulterBidRes.status === 400,
      details: `Response: ${JSON.stringify(defaulterBidRes.json?.error || defaulterBidRes.json)}`,
    });
  }

  // Restore ticket #5 arrears
  queryDb(`UPDATE public."SubscriberTicket" SET "consecutiveUnpaidMonths" = 0 WHERE id = '${ticket5.id}';`);

  // ============================================================================
  // SECTION 7: OPTION A PHYSICAL PAPER TOKEN DRAW TIE-BREAK (AGENTS.md Rule 6)
  // ============================================================================
  console.log(`============================================================================`);
  console.log(`SECTION 7: OPTION A PHYSICAL TIE-BREAK CEILING PROTOCOL`);
  console.log(`============================================================================\n`);

  const ticket6 = ticketsRaw.find((t) => t.ticketNumber === 6)!;
  const ticket7 = ticketsRaw.find((t) => t.ticketNumber === 7)!;

  // 7.1 Reject tie-break if discount is NOT the 1/4 ceiling (e.g. ₹24,000)
  {
    const subCeilingTieRes = await request('POST', `/auctions/${chitGroupId}/tie-break?month=6`, {
      tiedTickets: [
        { ticketId: ticket6.id, tokenNumber: 1 },
        { ticketId: ticket7.id, tokenNumber: 2 },
      ],
      winningTicketId: ticket6.id,
      bidDiscount: 24000, // Not 25000 ceiling
      auctionDate: '2027-04-15T00:00:00.000Z',
    }, adminA.token);

    assertResult({
      testId: 'TIEBREAK-01',
      category: 'Option A Tie-Break Ceiling Protocol',
      description: 'Reject tie-break draw if discount is below the exact 1/4 ceiling (₹24,000 < ₹25,000)',
      endpoint: `POST /api/v1/auctions/:id/tie-break?month=6`,
      expectedStatus: 400,
      observedStatus: subCeilingTieRes.status,
      condition: subCeilingTieRes.status === 400,
      details: `Response: ${JSON.stringify(subCeilingTieRes.json?.error || subCeilingTieRes.json)}`,
    });
  }

  // 7.2 Accept valid tie-break at exact 1/4 ceiling (₹25,000) with physical token entries
  {
    const validTieRes = await request('POST', `/auctions/${chitGroupId}/tie-break?month=6`, {
      tiedTickets: [
        { ticketId: ticket6.id, tokenNumber: 1 },
        { ticketId: ticket7.id, tokenNumber: 2 },
      ],
      winningTicketId: ticket6.id,
      bidDiscount: 25000, // Exactly 1/4 ceiling
      auctionDate: '2027-04-15T00:00:00.000Z',
    }, adminA.token);

    assertResult({
      testId: 'TIEBREAK-02',
      category: 'Option A Tie-Break Ceiling Protocol',
      description: 'Record paper token tie-break winner drawn at exact 1/4 ceiling (₹25,000)',
      endpoint: `POST /api/v1/auctions/:id/tie-break?month=6`,
      expectedStatus: 200,
      observedStatus: validTieRes.status,
      condition: validTieRes.status === 200,
      details: `Tie-break winner recorded: Ticket #${validTieRes.json?.data?.winner?.ticket?.ticketNumber}`,
    });
  }

  // ============================================================================
  // SUMMARY REPORT & VERDICT
  // ============================================================================
  console.log(`\n==============================================================================`);
  console.log(`EMPIRICAL CHALLENGE SUMMARY VERDICT`);
  console.log(`==============================================================================\n`);

  const total = assertions.length;
  const passed = assertions.filter((a) => a.passed).length;
  const failed = assertions.filter((a) => !a.passed).length;

  console.log(`Total Empirical Probes Executed: ${total}`);
  console.log(`Passed Assertions:             ${passed}`);
  console.log(`Failed Assertions:             ${failed}`);

  if (failed > 0) {
    console.log(`\n❌ VERDICT: REQUEST_CHANGES`);
    console.log(`Failed Tests:`);
    for (const a of assertions.filter((a) => !a.passed)) {
      console.log(`  - ${a.testId}: ${a.description} (Observed: ${a.observedStatus}, Expected: ${a.expectedStatus})`);
    }
  } else {
    console.log(`\n✅ VERDICT: APPROVE (100% Invariants & Boundaries Empirically Verified)`);
  }

  return { total, passed, failed, assertions };
}

run().catch((err) => {
  console.error('Fatal harness error:', err);
  process.exit(1);
});
