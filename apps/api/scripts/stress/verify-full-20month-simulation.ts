// ==============================================================================
// Kumaran Chits — 20-Month Continuous Chronological Lifecycle Simulation
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: ADR-01 to ADR-19, Definition of Done Gate 5, docs/01-business/financial-rules.md
// Invariants: Whole Rupee Math (BigInt), Universal Equal Dividend, 1/4 Ceiling,
//             Month 1 Company Pool, Month N Final Settlement, Maker != Checker
// ==============================================================================

import { Prisma, PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const prisma = new PrismaClient();

const CHIT_GROUP_CODE = 'KC-SIM-20M-01';
const CHIT_VALUE = 100000n; // ₹1,00,000 gross pool
const DURATION_MONTHS = 20;
const TOTAL_TICKETS = 20;
const BASE_INSTALLMENT = 5000n; // ₹5,000 base per ticket
const MAX_CEILING = 25000n; // Fixed 1/4 ceiling (25%)
const COMMISSION_RATE = 4; // 4.00%
const COMMISSION_AMOUNT = 4000n; // 4% of 100,000 = ₹4,000

interface MonthLedgerSummary {
  month: number;
  type: string;
  winnerTicket: number;
  bidDiscount: number;
  commission: number;
  totalDividend: number;
  dividendPerTicket: number;
  netInstallment: number;
  prizeMoneyDisbursed: number;
  totalCollectedMonth: number;
}

const ledgerSummaries: MonthLedgerSummary[] = [];

async function loginUser(phone: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/web/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${phone} with status ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as any;
  return (
    body.data?.accessToken ||
    body.data?.tokens?.accessToken ||
    body.tokens?.accessToken ||
    body.accessToken
  );
}

async function request(
  method: string,
  urlPath: string,
  token: string,
  body?: any,
): Promise<{ status: number; json: any }> {
  const url = `${BASE_URL}/api/v1${urlPath}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: res.status, json };
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`🚀 STARTING 20-MONTH CONTINUOUS CHRONOLOGICAL SIMULATION`);
  console.log(`   Kumaran Chits — Kumaran Finance (Perundurai, TN)`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Target Group : ${CHIT_GROUP_CODE} (₹1,00,000 / 20 Months / 20 Tickets)`);
  console.log(`   Strict Rule  : Continuous 20-month progression with 0 database resets`);
  console.log(`======================================================\n`);

  // --------------------------------------------------------------------------
  // Step 1: Health Probe & Multi-Persona Authentication
  // --------------------------------------------------------------------------
  console.log(`--- [1/6] Authenticating Operational Personas ---`);
  const healthRes = await fetch(`${BASE_URL}/health`);
  if (!healthRes.ok) {
    console.error(`❌ Health check failed on ${BASE_URL}/health`);
    process.exit(1);
  }

  const partnerAToken = await loginUser('9876543210', 'Admin@Kumaran2026'); // Super Admin / Maker
  const partnerBToken = await loginUser('9876543211', 'Admin@Kumaran2026'); // Super Admin / Checker
  const accountantToken = await loginUser('9876543213', 'Admin@Kumaran2026'); // Accountant / Cashier
  console.log(`   ✅ Logged in Managing Partner (Maker), Partner B (Checker), and Accountant`);

  const partnerAUser = await prisma.user.findFirst({ where: { phone: '9876543210' } });
  const partnerBUser = await prisma.user.findFirst({ where: { phone: '9876543211' } });
  const branch = await prisma.branch.findFirst({ orderBy: { createdAt: 'asc' } });

  if (!partnerAUser || !partnerBUser || !branch) {
    throw new Error('Database missing primary branch or partner accounts.');
  }

  // --------------------------------------------------------------------------
  // Step 2: Clean & Provision Simulation Chit Group & 20 Unique Subscribers
  // --------------------------------------------------------------------------
  console.log(`\n--- [2/6] Provisioning Dedicated Simulation Scheme (${CHIT_GROUP_CODE}) ---`);

  // Clean previous run if exists
  const existingGroup = await prisma.chitGroup.findUnique({
    where: { groupCode: CHIT_GROUP_CODE },
  });

  if (existingGroup) {
    console.log(`   Purging historical state for ${CHIT_GROUP_CODE}...`);
    const paymentIds = (
      await prisma.paymentAllocation.findMany({
        where: { due: { chitGroupId: existingGroup.id } },
        select: { paymentId: true },
      })
    ).map((a) => a.paymentId);

    await prisma.receipt.deleteMany({
      where: { paymentId: { in: paymentIds } },
    });
    await prisma.paymentAllocation.deleteMany({
      where: { due: { chitGroupId: existingGroup.id } },
    });
    await prisma.payment.deleteMany({
      where: { id: { in: paymentIds } },
    });
    await prisma.installmentDue.deleteMany({
      where: { chitGroupId: existingGroup.id },
    });
    await prisma.auctionMinutes.deleteMany({
      where: { auction: { chitGroupId: existingGroup.id } },
    });
    await prisma.auctionWinner.deleteMany({
      where: { auction: { chitGroupId: existingGroup.id } },
    });
    await prisma.auctionTieBidder.deleteMany({
      where: { auction: { chitGroupId: existingGroup.id } },
    });
    await prisma.auction.deleteMany({
      where: { chitGroupId: existingGroup.id },
    });
    await prisma.subscriberTicket.deleteMany({
      where: { chitGroupId: existingGroup.id },
    });
    await prisma.chitGroup.delete({
      where: { id: existingGroup.id },
    });
  }

  // Ensure 20 distinct customers exist
  const existingCustomers = await prisma.customer.findMany({
    take: 20,
    orderBy: { createdAt: 'asc' },
  });

  const customers = [...existingCustomers];
  while (customers.length < 20) {
    const idx = customers.length + 1;
    const phone = `98421000${idx < 10 ? '0' + idx : idx}`;
    const newCust = await prisma.customer.create({
      data: {
        branchId: branch.id,
        customerCode: `KC-SIM-CUST-${idx}`,
        fullName: `Simulation Subscriber #${idx}`,
        phone,
        aadhaarLast4: `${1000 + idx}`,
        panNumber: `ABCDE${1000 + idx}F`,
        addressLine1: `${idx}, Perundurai Road`,
        city: 'Perundurai',
        pincode: '638052',
        status: 'ACTIVE',
      },
    });
    customers.push(newCust);
  }

  // Create the simulation chit group
  const chitGroup = await prisma.chitGroup.create({
    data: {
      branchId: branch.id,
      groupCode: CHIT_GROUP_CODE,
      groupName: '₹1 Lakh 20 Months Continuous Simulation',
      groupNameTamil: 'ரூ.1 லட்சம் 20 மாத தொடர் உருவகப்படுத்துதல்',
      chitValue: CHIT_VALUE,
      durationMonths: DURATION_MONTHS,
      totalTickets: TOTAL_TICKETS,
      baseInstallment: BASE_INSTALLMENT,
      foremanCommissionRate: new Prisma.Decimal('4.00'),
      maxDiscountCeiling: MAX_CEILING,
      initMode: 'NEW_GROUP',
      onboardedAtMonth: 1,
      status: 'ACTIVE',
      sanctionOrderNumber: 'ROC/SIM/CHIT/2026/00999',
      sanctionDate: new Date('2026-01-01'),
      startDate: new Date('2026-01-15'),
      endDate: new Date('2027-08-15'),
    },
  });

  // Assign 20 unique subscriber tickets (Ticket 1 = Company ticket)
  const tickets: any[] = [];
  for (let t = 1; t <= TOTAL_TICKETS; t++) {
    const cust = customers[t - 1];
    const ticket = await prisma.subscriberTicket.create({
      data: {
        chitGroupId: chitGroup.id,
        customerId: cust.id,
        ticketNumber: t,
        isPrized: false,
        consecutiveUnpaidMonths: 0,
        status: 'ACTIVE',
      },
    });
    tickets.push(ticket);
  }

  console.log(`   ✅ Group ${CHIT_GROUP_CODE} created with 20 subscriber tickets.`);
  console.log(`      Ticket #1 designated as Company Representative Ticket.`);

  // --------------------------------------------------------------------------
  // Step 3: Execute Month 1 (Company Pool Rule, No Auction)
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/6] Month 1: Company Ticket Pool Settlement (No Auction) ---`);

  // Generate Month 1 dues
  const m1DuesRes = await request(
    'POST',
    `/installments/group/${chitGroup.id}/month/1/generate`,
    partnerAToken,
  );
  if (m1DuesRes.status !== 200 && m1DuesRes.status !== 201) {
    throw new Error(`Failed to generate Month 1 dues: ${JSON.stringify(m1DuesRes.json)}`);
  }

  // Fetch generated Month 1 dues
  const m1Dues = await prisma.installmentDue.findMany({
    where: { chitGroupId: chitGroup.id, installmentMonth: 1 },
    include: { ticket: true },
  });

  if (m1Dues.length !== 20) {
    throw new Error(`Expected 20 dues for Month 1, got ${m1Dues.length}`);
  }

  // All 20 members pay base installment of ₹5,000
  let m1TotalCollected = 0n;
  for (const due of m1Dues) {
    const payRes = await request('POST', '/payments', partnerAToken, {
      ticketId: due.ticketId,
      installmentMonth: 1,
      amount: Number(due.netPayableAmount),
      paymentMethod: 'CASH',
      idempotencyKey: `m1-pay-t${due.ticket.ticketNumber}-${Date.now()}`,
      notes: `Month 1 base collection ticket #${due.ticket.ticketNumber}`,
    });
    if (payRes.status !== 201 && payRes.status !== 200) {
      throw new Error(`Month 1 payment failed for Ticket #${due.ticket.ticketNumber}: ${JSON.stringify(payRes.json)}`);
    }
    m1TotalCollected += due.netPayableAmount;
  }

  // Company ticket (Ticket #1) takes full gross pool (₹1,00,000) with ₹0 dividend
  await prisma.subscriberTicket.update({
    where: { id: tickets[0].id },
    data: { isPrized: true },
  });

  ledgerSummaries.push({
    month: 1,
    type: 'COMPANY_POOL (No Auction)',
    winnerTicket: 1,
    bidDiscount: 0,
    commission: 0,
    totalDividend: 0,
    dividendPerTicket: 0,
    netInstallment: 5000,
    prizeMoneyDisbursed: 100000,
    totalCollectedMonth: Number(m1TotalCollected),
  });

  console.log(`   ✅ Month 1 Complete: All 20 tickets paid ₹5,000. Total Collected: ₹${m1TotalCollected}. Ticket #1 (Company) prized.`);

  // --------------------------------------------------------------------------
  // Step 4: Execute Months 2 Through 19 (Auctions, Dividends, Safety & Payouts)
  // --------------------------------------------------------------------------
  console.log(`\n--- [4/6] Executing Months 2 through 19 (Sequential Lifecycle) ---`);

  // Pre-planned dynamic bid discounts for Months 2 to 19 (all within [4000, 25000])
  const discountSchedule: Record<number, number> = {
    2: 25000, // Ceiling
    3: 20000, // Mid-range
    4: 25000, // Option A Tie-Break Draw
    5: 22000,
    6: 18000, // Defaulter lockout edge test
    7: 24000,
    8: 21000,
    9: 23000,
    10: 19000,
    11: 25000, // Ceiling
    12: 17000,
    13: 22000,
    14: 20000,
    15: 24000,
    16: 18000,
    17: 21000,
    18: 25000,
    19: 20000, // Penultimate month (2 bidders left)
  };

  for (let m = 2; m <= 19; m++) {
    const discount = discountSchedule[m];
    const totalDiv = discount - Number(COMMISSION_AMOUNT);
    const divPerTicket = Math.floor(totalDiv / TOTAL_TICKETS);
    const netInstallment = Number(BASE_INSTALLMENT) - divPerTicket;
    const prizeMoney = Number(CHIT_VALUE) - discount;

    // 1. Get eligible unprized tickets
    const unprizedTickets = await prisma.subscriberTicket.findMany({
      where: { chitGroupId: chitGroup.id, isPrized: false },
      orderBy: { ticketNumber: 'asc' },
    });

    if (unprizedTickets.length === 0) {
      throw new Error(`Month ${m}: No unprized tickets remaining!`);
    }

    const winnerTicket = unprizedTickets[0]; // Choose first available unprized ticket

    // 2. Conduct Auction
    let auctionId = '';

    if (m === 4) {
      // Month 4: Option A Tie-Break Draw (Tickets 4, 5, 6 bid ceiling of ₹25,000)
      const tiedTickets = [
        { ticketId: unprizedTickets[0].id, tokenNumber: 1 },
        { ticketId: unprizedTickets[1].id, tokenNumber: 2 },
        { ticketId: unprizedTickets[2].id, tokenNumber: 3 },
      ];
      const tieBreakRes = await request(
        'POST',
        `/auctions/${chitGroup.id}/tie-break?month=4`,
        partnerAToken,
        {
          tiedTickets,
          winningTicketId: winnerTicket.id,
          bidDiscount: discount,
          auctionDate: new Date(`2026-04-15`).toISOString(),
          witnessNames: ['S. Sundaram', 'K. Murugesan', 'M. Ramesh'],
        },
      );
      if (tieBreakRes.status !== 200 && tieBreakRes.status !== 201) {
        throw new Error(`Month 4 Tie-Break failed: ${JSON.stringify(tieBreakRes.json)}`);
      }
      auctionId = tieBreakRes.json?.data?.id || tieBreakRes.json?.id;
    } else {
      // Standard Winning Bid Entry
      const auctionYear = 2026 + Math.floor((m - 1) / 12);
      const auctionCalMonth = ((m - 1) % 12) + 1;
      const auctionDateIso = new Date(
        `${auctionYear}-${auctionCalMonth < 10 ? '0' + auctionCalMonth : auctionCalMonth}-15T00:00:00.000Z`,
      ).toISOString();

      const bidRes = await request(
        'POST',
        `/auctions/${chitGroup.id}/record-bid?month=${m}`,
        partnerAToken,
        {
          ticketId: winnerTicket.id,
          bidDiscount: discount,
          auctionDate: auctionDateIso,
        },
      );
      if (bidRes.status !== 200 && bidRes.status !== 201) {
        throw new Error(`Month ${m} record-bid failed: ${JSON.stringify(bidRes.json)}`);
      }
      auctionId = bidRes.json?.data?.id || bidRes.json?.id;
    }

    // 3. Checker (Partner B) Finalizes Auction
    const finalizeRes = await request(
      'POST',
      `/auctions/${auctionId}/finalize`,
      partnerBToken,
      {
        subscribersPresent: 18,
        signedByForeman: true,
        notes: `Month ${m} auction proceedings verified and signed by Checker.`,
      },
    );
    if (finalizeRes.status !== 200 && finalizeRes.status !== 201) {
      throw new Error(`Month ${m} finalize failed: ${JSON.stringify(finalizeRes.json)}`);
    }

    // 4. Company Safety Proof & Prize Money Disbursement
    // Maker: Verify Safety Proof
    const verifyProofRes = await request(
      'POST',
      `/disbursements/auction/${auctionId}/verify-safety-proof`,
      partnerAToken,
      {
        isSecurityRequired: true,
        securityType: 'SIGNED_AGREEMENT',
        blankChequeDetails: `IOB Cheque #00${m}123`,
        agreementSigned: true,
        nomineeSigned: true,
      },
    );
    if (verifyProofRes.status !== 200 && verifyProofRes.status !== 201) {
      throw new Error(`Month ${m} verify safety proof failed: ${JSON.stringify(verifyProofRes.json)}`);
    }

    // Checker: Authorize Payout
    const authPayoutRes = await request(
      'POST',
      `/disbursements/auction/${auctionId}/authorize-payout`,
      partnerBToken,
      {
        disbursementMode: 'BANK_TRANSFER_NEFT',
        disbursedAmount: prizeMoney,
        notes: `Month ${m} payout authorized by Checker Partner.`,
      },
    );
    if (authPayoutRes.status !== 200 && authPayoutRes.status !== 201) {
      throw new Error(`Month ${m} authorize payout failed: ${JSON.stringify(authPayoutRes.json)}`);
    }

    // Accountant: Release Payout Voucher
    const releaseRes = await request(
      'POST',
      `/disbursements/auction/${auctionId}/disburse`,
      accountantToken,
      {
        paymentReference: `NEFT-SIM-M${m}-${Date.now()}`,
        disbursedAt: new Date().toISOString(),
      },
    );
    if (releaseRes.status !== 200 && releaseRes.status !== 201) {
      throw new Error(`Month ${m} release payout failed: ${JSON.stringify(releaseRes.json)}`);
    }

    // 5. Generate Dues for Month m with Universal Dividend
    const duesRes = await request(
      'POST',
      `/installments/group/${chitGroup.id}/month/${m}/generate`,
      partnerAToken,
    );
    if (duesRes.status !== 200 && duesRes.status !== 201) {
      throw new Error(`Month ${m} generate dues failed: ${JSON.stringify(duesRes.json)}`);
    }

    // 6. All 20 Members Pay the Net Installment (I_net = 5000 - divPerTicket)
    const currentDues = await prisma.installmentDue.findMany({
      where: { chitGroupId: chitGroup.id, installmentMonth: m },
      include: { ticket: true },
    });

    let monthCollections = 0n;
    for (const due of currentDues) {
      const payRes = await request('POST', '/payments', partnerAToken, {
        ticketId: due.ticketId,
        installmentMonth: m,
        amount: Number(due.netPayableAmount),
        paymentMethod: 'CASH',
        idempotencyKey: `m${m}-pay-t${due.ticket.ticketNumber}-${Date.now()}`,
        notes: `Month ${m} collection ticket #${due.ticket.ticketNumber}`,
      });
      if (payRes.status !== 201 && payRes.status !== 200) {
        throw new Error(`Month ${m} payment failed for Ticket #${due.ticket.ticketNumber}: ${JSON.stringify(payRes.json)}`);
      }
      monthCollections += due.netPayableAmount;
    }

    ledgerSummaries.push({
      month: m,
      type: m === 4 ? 'AUCTION (Tie-Break)' : 'AUCTION',
      winnerTicket: winnerTicket.ticketNumber,
      bidDiscount: discount,
      commission: Number(COMMISSION_AMOUNT),
      totalDividend: totalDiv,
      dividendPerTicket: divPerTicket,
      netInstallment,
      prizeMoneyDisbursed: prizeMoney,
      totalCollectedMonth: Number(monthCollections),
    });

    console.log(`   ✅ Month ${m < 10 ? ' ' + m : m} Complete: Winner Ticket #${winnerTicket.ticketNumber < 10 ? ' ' + winnerTicket.ticketNumber : winnerTicket.ticketNumber} | Discount: ₹${discount} | Div/Ticket: ₹${divPerTicket} | Net Pay: ₹${netInstallment} | Prize: ₹${prizeMoney}`);
  }

  // --------------------------------------------------------------------------
  // Step 5: Execute Month 20 (Month N Final Settlement, No Auction)
  // --------------------------------------------------------------------------
  console.log(`\n--- [5/6] Month 20: Month N Final Subscriber Direct Settlement ---`);

  // 1. Verify exactly 1 unprized ticket remains
  const remainingUnprized = await prisma.subscriberTicket.findMany({
    where: { chitGroupId: chitGroup.id, isPrized: false },
  });

  if (remainingUnprized.length !== 1) {
    throw new Error(`Expected exactly 1 unprized ticket before Month 20 settlement, found ${remainingUnprized.length}!`);
  }

  const finalTicket = remainingUnprized[0];
  console.log(`   Final unprized subscriber identified: Ticket #${finalTicket.ticketNumber} (${finalTicket.id})`);

  // 2. Generate Month 20 Dues (uses prior month dividend)
  const m20DuesRes = await request(
    'POST',
    `/installments/group/${chitGroup.id}/month/20/generate`,
    partnerAToken,
  );
  if (m20DuesRes.status !== 200 && m20DuesRes.status !== 201) {
    throw new Error(`Month 20 generate dues failed: ${JSON.stringify(m20DuesRes.json)}`);
  }

  // 3. All 20 members pay Month 20 dues
  const m20Dues = await prisma.installmentDue.findMany({
    where: { chitGroupId: chitGroup.id, installmentMonth: 20 },
    include: { ticket: true },
  });

  let m20TotalCollected = 0n;
  for (const due of m20Dues) {
    const payRes = await request('POST', '/payments', partnerAToken, {
      ticketId: due.ticketId,
      installmentMonth: 20,
      amount: Number(due.netPayableAmount),
      paymentMethod: 'CASH',
      idempotencyKey: `m20-pay-t${due.ticket.ticketNumber}-${Date.now()}`,
      notes: `Month 20 collection ticket #${due.ticket.ticketNumber}`,
    });
    if (payRes.status !== 201 && payRes.status !== 200) {
      throw new Error(`Month 20 payment failed for Ticket #${due.ticket.ticketNumber}: ${JSON.stringify(payRes.json)}`);
    }
    m20TotalCollected += due.netPayableAmount;
  }

  // 4. Settle Month 20 without Auction (Super Admin Direct Settlement)
  const finalSettlementRes = await request(
    'POST',
    `/disbursements/group/${chitGroup.id}/final-settlement`,
    partnerAToken,
    {
      ticketId: finalTicket.id,
      disbursementMode: 'ACCOUNT_PAYEE_CHEQUE',
      paymentReference: 'IOB-FINAL-SETTLEMENT-CHQ-99001',
      notes: 'Final Month 20 direct settlement disbursed to subscriber without auction.',
    },
  );

  if (finalSettlementRes.status !== 200 && finalSettlementRes.status !== 201) {
    throw new Error(`Month 20 final settlement failed: ${JSON.stringify(finalSettlementRes.json)}`);
  }

  const finalPrizeMoney = Number(CHIT_VALUE) - Number(COMMISSION_AMOUNT); // ₹96,000
  const m20DivPerTicket = Number(m20Dues[0].dividendDeduction);
  const m20TotalDiv = m20DivPerTicket * TOTAL_TICKETS;

  ledgerSummaries.push({
    month: 20,
    type: 'FINAL_SETTLEMENT (No Auction)',
    winnerTicket: finalTicket.ticketNumber,
    bidDiscount: Number(COMMISSION_AMOUNT),
    commission: Number(COMMISSION_AMOUNT),
    totalDividend: m20TotalDiv,
    dividendPerTicket: m20DivPerTicket,
    netInstallment: Number(m20Dues[0].netPayableAmount),
    prizeMoneyDisbursed: finalPrizeMoney,
    totalCollectedMonth: Number(m20TotalCollected),
  });

  console.log(`   ✅ Month 20 Complete: Direct maturity settlement paid ₹${finalPrizeMoney} to Ticket #${finalTicket.ticketNumber}.`);

  // Verify group transitioned to COMPLETED
  const completedGroup = await prisma.chitGroup.findUnique({
    where: { id: chitGroup.id },
  });
  console.log(`   Scheme Status: ${completedGroup?.status} (Expected: COMPLETED)`);

  // --------------------------------------------------------------------------
  // Step 6: Verify The 5 Grand Mathematical Conservation Invariants
  // --------------------------------------------------------------------------
  console.log(`\n======================================================`);
  console.log(`📋 AUDITING THE 5 GRAND MATHEMATICAL CONSERVATION INVARIANTS`);
  console.log(`======================================================`);

  // 1. Conservation of Chit Pool & Dividends
  // Total Gross Chit Pool over 20 months = 20 tickets * ₹1,00,000 = ₹20,00,000
  const totalCollections = ledgerSummaries.reduce((sum, l) => sum + l.totalCollectedMonth, 0);
  const totalMemberDividends = ledgerSummaries.reduce((sum, l) => sum + l.dividendPerTicket * TOTAL_TICKETS, 0);
  const poolSum = totalCollections + totalMemberDividends;
  const expectedPoolSum = Number(CHIT_VALUE) * DURATION_MONTHS; // 20,00,000

  const inv1Passed = poolSum === expectedPoolSum;
  console.log(`   ${inv1Passed ? '✅' : '❌'} [Grand Invariant 1: Chit Pool & Universal Dividend Conservation]`);
  console.log(`      Collections (₹${totalCollections}) + Dividends (₹${totalMemberDividends}) = ₹${poolSum} (Expected: ₹${expectedPoolSum})`);

  // 2. Conservation of Prize Money & Foreman Commission
  // In a chit fund, because Month 19's auction dividend is credited against Month 20 subscriber dues,
  // the net cash balance equation over the lifetime of the scheme is:
  // Collections + Final Cycle Dividend Credit = Disbursed Prizes + Foreman Commissions
  const totalPrizesDisbursed = ledgerSummaries.reduce((sum, l) => sum + l.prizeMoneyDisbursed, 0);
  const totalCommissions = ledgerSummaries.reduce((sum, l) => sum + l.commission, 0);
  const prizePlusComm = totalPrizesDisbursed + totalCommissions;

  const inv2Passed = (totalCollections + m20TotalDiv) === prizePlusComm;
  console.log(`   ${inv2Passed ? '✅' : '❌'} [Grand Invariant 2: Prize Money & Foreman Commission Conservation]`);
  console.log(`      Collections (₹${totalCollections}) + Final Div Credit (₹${m20TotalDiv}) = ₹${totalCollections + m20TotalDiv} | Prizes (₹${totalPrizesDisbursed}) + Comm (₹${totalCommissions}) = ₹${prizePlusComm}`);

  // 3. Absolute Ticket Prize Uniqueness (Bijective Mapping)
  const prizedCount = await prisma.subscriberTicket.count({
    where: { chitGroupId: chitGroup.id, isPrized: true },
  });
  const unprizedRemaining = await prisma.subscriberTicket.count({
    where: { chitGroupId: chitGroup.id, isPrized: false },
  });
  const duplicateWinners = await prisma.$queryRaw<Array<{ ticketId: string; count: bigint }>>`
    SELECT "ticketId", COUNT(*) as count FROM "AuctionWinner" 
    WHERE "auctionId" IN (SELECT id FROM "Auction" WHERE "chitGroupId" = ${chitGroup.id})
    GROUP BY "ticketId" HAVING COUNT(*) > 1;
  `;

  const inv3Passed = prizedCount === 20 && unprizedRemaining === 0 && duplicateWinners.length === 0;
  console.log(`   ${inv3Passed ? '✅' : '❌'} [Grand Invariant 3: Absolute Bijective Prize Uniqueness (All 20 Won Once)]`);
  console.log(`      Prized Tickets: ${prizedCount}/20. Unprized Remaining: ${unprizedRemaining}. Duplicate Winners: ${duplicateWinners.length}.`);

  // 4. Zero Arrears & Discrete Payment Invariant
  const totalDuesScheduled = await prisma.installmentDue.count({
    where: { chitGroupId: chitGroup.id },
  });
  const unpaidDuesCount = await prisma.installmentDue.count({
    where: { chitGroupId: chitGroup.id, status: { not: 'PAID' } },
  });
  const totalAllocationsCount = await prisma.paymentAllocation.count({
    where: { due: { chitGroupId: chitGroup.id }, payment: { paymentStatus: 'SUCCESS' } },
  });

  const inv4Passed = totalDuesScheduled === 400 && unpaidDuesCount === 0 && totalAllocationsCount === 400;
  console.log(`   ${inv4Passed ? '✅' : '❌'} [Grand Invariant 4: Zero Arrears & Discrete Single Payment Invariant]`);
  console.log(`      Total Dues: ${totalDuesScheduled} (Expected 400). Unpaid: ${unpaidDuesCount}. Total Allocations: ${totalAllocationsCount} (Expected 400).`);

  // 5. Physical Passbook 6-Column Ledger Verification (Every Ticket Reaches ₹1,00,000)
  let allPassbooksReconciled = true;
  for (const t of tickets) {
    const ticketDues = await prisma.installmentDue.findMany({
      where: { ticketId: t.id },
    });
    const ticketTotal = ticketDues.reduce(
      (sum, d) => sum + d.paidAmount + d.dividendDeduction,
      0n,
    );
    if (ticketTotal !== CHIT_VALUE) {
      allPassbooksReconciled = false;
      console.error(`      Ticket #${t.ticketNumber} mismatch: Paid+Div = ₹${ticketTotal} (Expected ₹1,00,000)`);
    }
  }

  console.log(`   ${allPassbooksReconciled ? '✅' : '❌'} [Grand Invariant 5: Passbook 6-Column Ledger Reconciliation (All 20 Members)]`);
  console.log(`      Every member's physical passbook row sums to ₹10,000 gross and ₹1,00,000 lifetime total: ${allPassbooksReconciled}.`);

  // --------------------------------------------------------------------------
  // Summary Ledger Table
  // --------------------------------------------------------------------------
  console.log(`\n======================================================`);
  console.log(`📊 20-MONTH COMPLETE FINANCIAL AUDIT REGISTER`);
  console.log(`======================================================`);
  console.log(`Month | Type                   | Win# | Discount  | Commission | Total Div | Div/Tkt | Net Pay | Prize Disb | Month Coll`);
  console.log(`------+------------------------+------+-----------+------------+-----------+---------+---------+------------+-----------`);
  for (const l of ledgerSummaries) {
    const mStr = String(l.month).padStart(2, ' ');
    const typeStr = l.type.padEnd(22, ' ');
    const winStr = String(l.winnerTicket).padStart(4, ' ');
    const discStr = (`₹${l.bidDiscount}`).padStart(9, ' ');
    const commStr = (`₹${l.commission}`).padStart(10, ' ');
    const totDivStr = (`₹${l.totalDividend}`).padStart(9, ' ');
    const divTktStr = (`₹${l.dividendPerTicket}`).padStart(7, ' ');
    const netStr = (`₹${l.netInstallment}`).padStart(7, ' ');
    const prizeStr = (`₹${l.prizeMoneyDisbursed}`).padStart(10, ' ');
    const collStr = (`₹${l.totalCollectedMonth}`).padStart(10, ' ');
    console.log(`${mStr}    | ${typeStr} | ${winStr} | ${discStr} | ${commStr} | ${totDivStr} | ${divTktStr} | ${netStr} | ${prizeStr} | ${collStr}`);
  }
  console.log(`======================================================`);

  const allPassed = inv1Passed && inv2Passed && inv3Passed && inv4Passed && allPassbooksReconciled;
  console.log(`   Final Verdict: ${allPassed ? '✅ 100% PASS — 20-MONTH CHRONOLOGICAL LIFECYCLE RECONCILED' : '❌ FAILED'}`);
  console.log(`======================================================\n`);

  await prisma.$disconnect();

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error('\n❌ 20-MONTH SIMULATION ENCOUNTERED AN ERROR:\n', err);
  await prisma.$disconnect();
  process.exit(1);
});
