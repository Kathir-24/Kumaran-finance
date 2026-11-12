// ==============================================================================
// Kumaran Chits — High-Concurrency Stress & Pessimistic Lock Verification
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: Definition of Done (Gate 5 & Gate 6), NFR §3 (Latency & Concurrency)
// ADR-07: Single Discrete Payment Invariant & Zero Rupee Leak
// ADR-10: Maker-Checker Dual Control Invariant
// ==============================================================================

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const prisma = new PrismaClient();

interface TestAssertion {
  name: string;
  description: string;
  passed: boolean;
  details: string;
}

const assertions: TestAssertion[] = [];

function recordAssertion(name: string, description: string, passed: boolean, details: string) {
  assertions.push({ name, description, passed, details });
  console.log(`   ${passed ? '✅' : '❌'} [${name}]`);
  console.log(`      ${details}`);
}

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

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`🚀 STARTING HIGH-CONCURRENCY STRESS & PESSIMISTIC LOCK HARNESS`);
  console.log(`   Kumaran Chits — Kumaran Finance (Perundurai, TN)`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Compliance: Gate 6 (Concurrency & Pessimistic Locks), NFR §3 (Latency)`);
  console.log(`======================================================\n`);

  // --------------------------------------------------------------------------
  // Step 1: Health Probe & Multi-Persona Authentication
  // --------------------------------------------------------------------------
  console.log(`--- [1/6] Authenticating Personas for Concurrency Testing ---`);
  const healthRes = await fetch(`${BASE_URL}/health`);
  if (!healthRes.ok) {
    console.error(`❌ Health check failed on ${BASE_URL}/health`);
    process.exit(1);
  }
  console.log(`   Server is healthy (200 OK)`);

  const partnerAToken = await loginUser('9876543210', 'Admin@Kumaran2026'); // Super Admin / Maker
  const partnerBToken = await loginUser('9876543211', 'Admin@Kumaran2026'); // Super Admin / Checker
  const accountantToken = await loginUser('9876543213', 'Admin@Kumaran2026'); // Accountant
  console.log(`   ✅ Logged in Partner A (Maker), Partner B (Checker), and Accountant`);

  const partnerAUser = await prisma.user.findFirst({ where: { phone: '9876543210' } });
  const partnerBUser = await prisma.user.findFirst({ where: { phone: '9876543211' } });
  const agentUser = await prisma.user.findFirst({ where: { phone: '9876543214' } });

  if (!partnerAUser || !partnerBUser || !agentUser) {
    throw new Error('Required seed users not found in database.');
  }

  // --------------------------------------------------------------------------
  // Step 2: TEST 1 — Double-Payment Stampede (Race Condition on Unpaid Due)
  // --------------------------------------------------------------------------
  console.log(`\n--- [2/6] TEST 1: Double-Payment Stampede (10 Parallel Requests) ---`);
  console.log(`   Firing 10 simultaneous POST /payments requests to a single unpaid due...`);

  // Target a deterministic ticket due in active chit group
  const activeGroup = await prisma.chitGroup.findFirst({
    where: { status: 'ACTIVE' },
    include: { tickets: { include: { customer: true } } },
  });

  if (!activeGroup || activeGroup.tickets.length < 5) {
    throw new Error('No active chit group with sufficient tickets found.');
  }

  const targetTicket = activeGroup.tickets[2]; // Ticket 3
  let targetDue = await prisma.installmentDue.findFirst({
    where: { ticketId: targetTicket.id, installmentMonth: 1 },
  });

  if (!targetDue) {
    targetDue = await prisma.installmentDue.create({
      data: {
        chitGroupId: activeGroup.id,
        ticketId: targetTicket.id,
        installmentMonth: 1,
        dueDate: new Date(),
        grossAmount: 5000n,
        dividendDeduction: 0n,
        netPayableAmount: 5000n,
        paidAmount: 0n,
        status: 'UNPAID',
      },
    });
  }

  // Clean fixture: Ensure zero historical allocations exist for target due
  await prisma.paymentAllocation.deleteMany({
    where: { installmentDueId: targetDue.id },
  });
  await prisma.installmentDue.update({
    where: { id: targetDue.id },
    data: { paidAmount: 0n, status: 'UNPAID' },
  });

  console.log(`   Target: Ticket #${targetTicket.ticketNumber} (${targetTicket.customer.fullName}), Month ${targetDue.installmentMonth}, Net: ₹${Number(targetDue.netPayableAmount)}`);

  const concurrencyCount = 10;
  const startTime = Date.now();

  const racePromises = Array.from({ length: concurrencyCount }).map(async (_, idx) => {
    const idempotencyKey = `stampede-race-${Date.now()}-${idx}-${Math.random().toString(36).substring(7)}`;
    const res = await fetch(`${BASE_URL}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${partnerAToken}`,
      },
      body: JSON.stringify({
        ticketId: targetDue.ticketId,
        installmentMonth: targetDue.installmentMonth,
        amount: Number(targetDue.netPayableAmount),
        paymentMethod: 'CASH',
        idempotencyKey,
        notes: `Concurrency race test thread #${idx + 1}`,
      }),
    });
    return {
      status: res.status,
      body: await res.json().catch(() => ({})),
    };
  });

  const raceResults = await Promise.all(racePromises);
  const raceDuration = Date.now() - startTime;

  const successResults = raceResults.filter((r) => r.status === 201 || r.status === 200);
  const rejectedResults = raceResults.filter((r) => r.status === 400 || r.status === 409);
  const internalErrors = raceResults.filter((r) => r.status >= 500);

  // Database verification: count active SUCCESS allocations
  const totalAllocations = await prisma.paymentAllocation.count({
    where: {
      installmentDueId: targetDue.id,
      payment: { paymentStatus: 'SUCCESS' },
    },
  });
  const updatedDue = await prisma.installmentDue.findUnique({
    where: { id: targetDue.id },
  });

  const test1Passed =
    successResults.length === 1 &&
    rejectedResults.length === concurrencyCount - 1 &&
    internalErrors.length === 0 &&
    totalAllocations === 1 &&
    updatedDue?.status === 'PAID';

  recordAssertion(
    'CP-1: Single Discrete Payment Invariant (ADR-07 & Gate 6)',
    'Strictly 1 payment succeeds, exactly 9 rejected, 0 double allocations, 0 server crashes',
    test1Passed,
    `Results: ${successResults.length} Succeeded (HTTP 201), ${rejectedResults.length} Rejected (HTTP 400/409), ${internalErrors.length} Internal Errors. DB Allocations: ${totalAllocations}. Elapsed: ${raceDuration}ms.`,
  );

  // --------------------------------------------------------------------------
  // Step 3: TEST 2 — Idempotency Key Stampede (10 Parallel Requests, Same Key)
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/6] TEST 2: Idempotency Key Collision Stampede (10 Parallel Requests) ---`);
  console.log(`   Firing 10 simultaneous POST /payments requests with identical Idempotency-Key...`);

  const secondTicket = activeGroup.tickets[3]; // Ticket 4
  let secondDue = await prisma.installmentDue.findFirst({
    where: { ticketId: secondTicket.id, installmentMonth: 1 },
  });

  if (!secondDue) {
    secondDue = await prisma.installmentDue.create({
      data: {
        chitGroupId: activeGroup.id,
        ticketId: secondTicket.id,
        installmentMonth: 1,
        dueDate: new Date(),
        grossAmount: 5000n,
        dividendDeduction: 0n,
        netPayableAmount: 5000n,
        paidAmount: 0n,
        status: 'UNPAID',
      },
    });
  }

  // Clean fixture
  await prisma.paymentAllocation.deleteMany({
    where: { installmentDueId: secondDue.id },
  });
  await prisma.installmentDue.update({
    where: { id: secondDue.id },
    data: { paidAmount: 0n, status: 'UNPAID' },
  });

  const identicalKey = `idemp-collision-test-${Date.now()}`;
  const idempPromises = Array.from({ length: 10 }).map(async (_, idx) => {
    const res = await fetch(`${BASE_URL}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${partnerAToken}`,
      },
      body: JSON.stringify({
        ticketId: secondDue.ticketId,
        installmentMonth: secondDue.installmentMonth,
        amount: Number(secondDue.netPayableAmount),
        paymentMethod: 'UPI',
        transactionRef: `UPI-CONCURRENT-REF-${Date.now()}`,
        idempotencyKey: identicalKey,
        notes: `Idempotency stampede thread #${idx + 1}`,
      }),
    });
    return {
      status: res.status,
      body: await res.json().catch(() => ({})),
    };
  });

  const idempResults = await Promise.all(idempPromises);
  const idempServerErrors = idempResults.filter((r) => r.status >= 500);

  // Database verification: exactly 1 payment record exists for this idempotency key
  const paymentsWithKey = await prisma.payment.count({
    where: { idempotencyKey: identicalKey },
  });

  const test2Passed = paymentsWithKey === 1 && idempServerErrors.length === 0;

  recordAssertion(
    'CP-2: Idempotency Key Deduplication Guard (Gate 6)',
    'Simultaneous retries with identical key yield exactly 1 database write and zero 500 crashes',
    test2Passed,
    `Payments Created: ${paymentsWithKey} (Expected 1). 500 Crashes: ${idempServerErrors.length}.`,
  );

  // --------------------------------------------------------------------------
  // Step 4: TEST 3 — Auction Finalization Concurrent Checker Race
  // --------------------------------------------------------------------------
  console.log(`\n--- [4/6] TEST 3: Auction Finalization Concurrent Checker Race ---`);
  console.log(`   Simulating 5 simultaneous checker finalization requests...`);

  const testMonth = 8;
  // Clean up any historical month 8 auction fixture
  await prisma.auctionMinutes.deleteMany({
    where: { auction: { chitGroupId: activeGroup.id, installmentMonth: testMonth } },
  });
  await prisma.auctionWinner.deleteMany({
    where: { auction: { chitGroupId: activeGroup.id, installmentMonth: testMonth } },
  });
  await prisma.auctionTieBidder.deleteMany({
    where: { auction: { chitGroupId: activeGroup.id, installmentMonth: testMonth } },
  });
  await prisma.auction.deleteMany({
    where: { chitGroupId: activeGroup.id, installmentMonth: testMonth },
  });

  // Create clean scheduled auction fixture with bids recorded
  const testAuction = await prisma.auction.create({
    data: {
      chitGroupId: activeGroup.id,
      installmentMonth: testMonth,
      auctionDate: new Date(),
      status: 'SCHEDULED',
      bidDiscount: 20000n,
      foremanCommissionRate: 4.0,
      foremanCommissionAmount: 4000n,
      totalDividend: 16000n,
      dividendPerTicket: 800n,
      prizeMoney: 80000n,
      conductedByUserId: partnerAUser.id, // Maker
      winner: {
        create: {
          ticketId: activeGroup.tickets[4].id,
          wasTieBreakWinner: false,
          disbursementStatus: 'PENDING_VERIFICATION',
        },
      },
    },
    include: { winner: true },
  });

  const finalizePromises = Array.from({ length: 5 }).map(async (_, idx) => {
    const res = await fetch(`${BASE_URL}/api/v1/auctions/${testAuction.id}/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${partnerBToken}`, // Checker
      },
      body: JSON.stringify({
        subscribersPresent: 18,
        signedByForeman: true,
        notes: `Concurrent finalization race attempt #${idx + 1}`,
      }),
    });
    return {
      status: res.status,
      body: await res.json().catch(() => ({})),
    };
  });

  const finalizeResults = await Promise.all(finalizePromises);
  const finalizeSuccess = finalizeResults.filter((r) => r.status === 200 || r.status === 201);
  const finalizeRejected = finalizeResults.filter((r) => r.status === 400);
  const finalizeServerErrors = finalizeResults.filter((r) => r.status >= 500);

  const minutesCount = await prisma.auctionMinutes.count({
    where: { auctionId: testAuction.id },
  });
  const finalizedAuction = await prisma.auction.findUnique({
    where: { id: testAuction.id },
  });

  const test3Passed =
    finalizeSuccess.length === 1 &&
    finalizeRejected.length === 4 &&
    finalizeServerErrors.length === 0 &&
    minutesCount === 1 &&
    finalizedAuction?.status === 'COMPLETED';

  recordAssertion(
    'CP-3: Auction Single-Finalization Concurrency Guard (Gate 6)',
    'Simultaneous checker commits result in strictly 1 finalized auction and 1 statutory minutes record',
    test3Passed,
    `Successful: ${finalizeSuccess.length} (Expected 1). Rejected: ${finalizeRejected.length} (Expected 4). Minutes Records: ${minutesCount}. Status: ${finalizedAuction?.status}.`,
  );

  // --------------------------------------------------------------------------
  // Step 5: TEST 4 — Prize Disbursement Double-Release Race
  // --------------------------------------------------------------------------
  console.log(`\n--- [5/6] TEST 4: Prize Disbursement Double-Release Race ---`);
  console.log(`   Simulating 5 simultaneous release-payout requests for the same prize winner...`);

  // Prepare winner into AUTHORIZED_BY_CHECKER state
  await prisma.auctionWinner.update({
    where: { id: testAuction.winner!.id },
    data: {
      disbursementStatus: 'AUTHORIZED_BY_CHECKER',
      disbursementMode: 'BANK_TRANSFER_NEFT',
      disbursedAmount: 80000n,
      authorizedByUserId: partnerBUser.id,
    },
  });

  const disbursePromises = Array.from({ length: 5 }).map(async (_, idx) => {
    const res = await fetch(`${BASE_URL}/api/v1/disbursements/auction/${testAuction.id}/disburse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantToken}`,
      },
      body: JSON.stringify({
        paymentReference: `NEFT-CONCURRENT-REF-${Date.now()}-${idx}`,
        disbursedAt: new Date().toISOString(),
      }),
    });
    return {
      status: res.status,
      body: await res.json().catch(() => ({})),
    };
  });

  const disburseResults = await Promise.all(disbursePromises);
  const disburseSuccess = disburseResults.filter((r) => r.status === 200 || r.status === 201);
  const disburseRejected = disburseResults.filter((r) => r.status === 400);
  const disburseServerErrors = disburseResults.filter((r) => r.status >= 500);

  const updatedWinner = await prisma.auctionWinner.findUnique({
    where: { id: testAuction.winner!.id },
  });

  const test4Passed =
    disburseSuccess.length === 1 &&
    disburseRejected.length === 4 &&
    disburseServerErrors.length === 0 &&
    updatedWinner?.disbursementStatus === 'DISBURSED';

  recordAssertion(
    'CP-4: Prize Disbursement Double-Release Race Guard (Gate 6)',
    'Simultaneous release requests result in strictly 1 disbursed status and 4 rejected without 500 errors',
    test4Passed,
    `Successful: ${disburseSuccess.length} (Expected 1). Rejected: ${disburseRejected.length} (Expected 4). Winner Status: ${updatedWinner?.disbursementStatus}.`,
  );

  // --------------------------------------------------------------------------
  // Step 6: TEST 5 — Desk Cash Handover Double-Acknowledge Race
  // --------------------------------------------------------------------------
  console.log(`\n--- [5.1/6] TEST 5: Desk Cash Handover Double-Acknowledge Race ---`);
  console.log(`   Simulating 5 simultaneous vault deposit acknowledge requests...`);

  // Create a clean cash payment pending handover recorded by Field Agent
  const cashPayment = await prisma.payment.create({
    data: {
      branchId: activeGroup.branchId,
      customerId: targetTicket.customerId,
      paymentMethod: 'CASH',
      amount: 5000n,
      paymentStatus: 'SUCCESS',
      cashHandoverStatus: 'PENDING_HANDOVER',
      recordedByUserId: agentUser.id, // Field Agent
      idempotencyKey: `handover-payment-${Date.now()}`,
    },
  });

  const handoverPromises = Array.from({ length: 5 }).map(async (_, idx) => {
    const res = await fetch(`${BASE_URL}/api/v1/collections/cash-handover/acknowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${partnerBToken}`, // Checker
      },
      body: JSON.stringify({
        collectorUserId: agentUser.id,
        paymentIds: [cashPayment.id],
        acknowledgedAmount: 5000,
        notes: `Concurrent handover acknowledge attempt #${idx + 1}`,
      }),
    });
    return {
      status: res.status,
      body: await res.json().catch(() => ({})),
    };
  });

  const handoverResults = await Promise.all(handoverPromises);
  const handoverSuccess = handoverResults.filter((r) => r.status === 200 || r.status === 201);
  const handoverRejected = handoverResults.filter((r) => r.status === 400);
  const handoverServerErrors = handoverResults.filter((r) => r.status >= 500);

  const acknowledgedPayment = await prisma.payment.findUnique({
    where: { id: cashPayment.id },
  });

  const test5Passed =
    handoverSuccess.length === 1 &&
    handoverRejected.length === 4 &&
    handoverServerErrors.length === 0 &&
    acknowledgedPayment?.cashHandoverStatus === 'ACKNOWLEDGED';

  recordAssertion(
    'CP-5: Cash Handover Double-Acknowledge Race Guard (Gate 6)',
    'Simultaneous vault acknowledgments result in strictly 1 deposit and 4 rejected',
    test5Passed,
    `Successful: ${handoverSuccess.length} (Expected 1). Rejected: ${handoverRejected.length} (Expected 4). Status: ${acknowledgedPayment?.cashHandoverStatus}.`,
  );

  // --------------------------------------------------------------------------
  // Step 7: TEST 6 — High-Throughput Burst & Latency Benchmark (100 Requests, NFR §3)
  // --------------------------------------------------------------------------
  console.log(`\n--- [6/6] TEST 6: High-Throughput Burst & Latency Benchmark (100 Requests) ---`);
  console.log(`   Bombarding server with 100 concurrent requests across read/write endpoints...`);

  const burstEndpoints = [
    '/health',
    '/api/v1/chits',
    '/api/v1/customers',
    '/api/v1/reports/form-xxii',
    '/api/v1/reports/audit-logs',
  ];

  const totalBurstRequests = 100;
  const concurrencyWorkers = 20; // 20 concurrent virtual users sustained across 100 requests
  const burstLatencies: number[] = [];
  let burstErrors = 0;

  const burstStart = Date.now();
  let requestCounter = 0;

  const workers = Array.from({ length: concurrencyWorkers }).map(async () => {
    while (requestCounter < totalBurstRequests) {
      const idx = requestCounter++;
      const endpoint = burstEndpoints[idx % burstEndpoints.length];
      const reqStart = performance.now();
      try {
        const res = await fetch(`${BASE_URL}${endpoint}`, {
          headers: {
            Authorization: `Bearer ${partnerAToken}`,
          },
        });
        const reqDuration = performance.now() - reqStart;
        burstLatencies.push(reqDuration);
        if (res.status >= 500) {
          burstErrors++;
        }
      } catch {
        burstErrors++;
      }
    }
  });

  await Promise.all(workers);
  const totalBurstDuration = Date.now() - burstStart;

  const p50 = calculatePercentile(burstLatencies, 50).toFixed(2);
  const p95 = calculatePercentile(burstLatencies, 95).toFixed(2);
  const p99 = calculatePercentile(burstLatencies, 99).toFixed(2);
  const maxLatency = Math.max(...burstLatencies).toFixed(2);

  const targetThresholdMs = 350; // NFR §3 target <= 350ms
  const test6Passed = Number(p95) <= targetThresholdMs && burstErrors === 0;

  recordAssertion(
    'NFR-3: Latency & High-Throughput Benchmark (NFR §3)',
    `Read latency p95 <= ${targetThresholdMs}ms under 20 concurrent workers (100 total requests), zero 500 internal errors`,
    test6Passed,
    `Latency: p50 = ${p50}ms, p95 = ${p95}ms (Target <= ${targetThresholdMs}ms), p99 = ${p99}ms, Max = ${maxLatency}ms. Total Burst: ${totalBurstDuration}ms. Errors: ${burstErrors}/${totalBurstRequests}.`,
  );

  // --------------------------------------------------------------------------
  // Summary & Report
  // --------------------------------------------------------------------------
  console.log(`\n======================================================`);
  console.log(`📋 HIGH-CONCURRENCY STRESS & PESSIMISTIC LOCK REPORT`);
  console.log(`======================================================`);
  const allPassed = assertions.every((a) => a.passed);
  console.log(`   Overall Status: ${allPassed ? '✅ 100% PASSED (PRODUCTION GRADE)' : '❌ FAILED'}`);
  console.log(`------------------------------------------------------`);
  assertions.forEach((a) => {
    console.log(`   ${a.passed ? '✅' : '❌'} ${a.name}`);
    console.log(`      ${a.details}`);
  });
  console.log(`======================================================\n`);

  await prisma.$disconnect();

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error('\n❌ STRESS TEST HARNESS ENCOUNTERED AN ERROR:\n', err);
  await prisma.$disconnect();
  process.exit(1);
});
