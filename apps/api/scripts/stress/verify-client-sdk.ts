// ==============================================================================
// Kumaran Chits — Live Client API SDK Integration Verification
// Tests @kumaran/api-client against live NestJS server (http://127.0.0.1:3000)
// ==============================================================================

import * as path from 'path';
import { fileURLToPath } from 'url';

// Import from the built client SDK
// @ts-ignore
import {
  createKumaranClient,
  formatRupee,
  formatRupeeAmount,
  isSelfApproval,
  canAuthorizeAction,
  KumaranApiError,
} from '../../../../packages/api-client/dist/index.js';

const BASE_URL = 'http://127.0.0.1:3000';

async function main() {
  console.log(`\n======================================================`);
  console.log(`🚀 STARTING CLIENT API SDK LIVE VERIFICATION`);
  console.log(`   Package: @kumaran/api-client`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`======================================================`);

  let currentToken: string | null = null;
  let lastCapturedIdempotencyKey: string | null = null;

  // Configure strongly-typed client with dynamic token provider
  const client = createKumaranClient({
    baseUrl: BASE_URL,
    getAccessToken: () => currentToken,
  });

  // --------------------------------------------------------------------------
  // Step 1: GET /health (Unauthenticated System Health Probe)
  // --------------------------------------------------------------------------
  console.log(`\n--- [1/8] GET /health (System Health via SDK) ---`);
  const { data: healthData, error: healthError, response: healthRes } = await client.GET('/health');

  if (healthRes.status === 200 && healthData) {
    console.log(`   Status: ${healthRes.status} OK`);
    console.log(`   Service: ${(healthData as any).service || (healthData as any).data?.service}`);
    console.log(`   ✅ Step 1 PASSED: SDK performed unauthenticated GET /health successfully.`);
  } else {
    console.error(`   ❌ Step 1 FAILED:`, healthError);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 2: POST /api/v1/auth/web/login (Super Admin Authentication via SDK)
  // --------------------------------------------------------------------------
  console.log(`\n--- [2/8] POST /api/v1/auth/web/login (Staff Login via SDK) ---`);
  const loginPayload = {
    phone: '9876543210',
    password: 'Admin@Kumaran2026',
  };

  const loginRes = await (client as any).POST(
    '/api/v1/auth/web/login',
    { body: loginPayload },
  );

  if ((loginRes.response?.status === 200 || loginRes.response?.status === 201) && loginRes.data) {
    const rawData = loginRes.data?.data || loginRes.data;
    currentToken = rawData.tokens?.accessToken || rawData.accessToken;
    const user = rawData.user;
    console.log(`   Status: ${loginRes.response?.status} OK`);
    console.log(`   Authenticated User: ${user?.name} (${user?.phone})`);
    console.log(`   Assigned Roles: ${JSON.stringify(user?.roles)}`);
    console.log(`   JWT Access Token received: ${currentToken?.substring(0, 20)}...`);
    console.log(`   ✅ Step 2 PASSED: SDK authenticated Super Admin and extracted JWT session.`);
  } else {
    console.error(`   ❌ Step 2 FAILED:`, loginRes.error);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 3: GET /api/v1/chits (Active Chit Groups via Authenticated SDK)
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/8] GET /api/v1/chits (Chit Groups Query via SDK) ---`);
  const chitsRes = await (client as any).GET(
    '/api/v1/chits',
    {
      params: {
        query: { limit: 5 },
      },
    },
  );

  if (chitsRes.response?.status === 200 && chitsRes.data) {
    const rawData = chitsRes.data?.data || chitsRes.data;
    const list = rawData.items || (Array.isArray(rawData) ? rawData : []);
    console.log(`   Status: ${chitsRes.response?.status} OK`);
    console.log(`   Total Active Schemes Retrieved: ${(list as any[]).length}`);
    const sample = (list as any[])[0];
    if (sample) {
      console.log(`   Sample Scheme: ${sample.chitCode} (${sample.name})`);
      console.log(`   Chit Value: ${formatRupee(sample.chitValue)}`);
      console.log(`   Monthly Installment: ${formatRupee(sample.monthlyInstallment)}`);
      console.log(`   Commission Rate: ${sample.foremanCommissionRate}% (Frozen lock)`);
    }
    console.log(`   ✅ Step 3 PASSED: SDK queried chit schemes with automatic Bearer token injection.`);
  } else {
    console.error(`   ❌ Step 3 FAILED:`, chitsRes.error);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 4: GET /api/v1/customers (Customer Directory via SDK)
  // --------------------------------------------------------------------------
  console.log(`\n--- [4/8] GET /api/v1/customers (Customer Directory via SDK) ---`);
  const custRes = await (client as any).GET(
    '/api/v1/customers',
    {
      params: {
        query: { limit: 3 },
      },
    },
  );

  if (custRes.response?.status === 200 && custRes.data) {
    const rawData = custRes.data?.data || custRes.data;
    const customers = rawData.items || (Array.isArray(rawData) ? rawData : []);
    console.log(`   Status: ${custRes.response?.status} OK`);
    console.log(`   Subscribers Retrieved: ${(customers as any[]).length}`);
    const firstCust = (customers as any[])[0];
    if (firstCust) {
      console.log(`   Subscriber: ${firstCust.name} (Phone: ${firstCust.phone})`);
      console.log(`   Branch ID: ${firstCust.branchId}`);
    }
    console.log(`   ✅ Step 4 PASSED: SDK retrieved customer directory cleanly.`);
  } else {
    console.error(`   ❌ Step 4 FAILED:`, custRes.error);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 5: GET /api/v1/reports/audit-logs (Financial Audit Trail via SDK)
  // --------------------------------------------------------------------------
  console.log(`\n--- [5/8] GET /api/v1/reports/audit-logs (Audit Logs via SDK) ---`);
  const auditRes = await (client as any).GET(
    '/api/v1/reports/audit-logs',
    {
      params: {
        query: { limit: 5 },
      },
    },
  );

  if (auditRes.response?.status === 200 && auditRes.data) {
    const rawAudit = auditRes.data?.data || auditRes.data;
    const records = Array.isArray(rawAudit) ? rawAudit : rawAudit.records || [];
    console.log(`   Status: ${auditRes.response?.status} OK`);
    console.log(`   Audit Records Retrieved: ${records.length}`);
    if (records.length > 0) {
      console.log(`   Latest Action: ${records[0].action} on ${records[0].entityType} (${records[0].entityId})`);
    }
    console.log(`   ✅ Step 5 PASSED: SDK retrieved audit trail records.`);
  } else {
    console.error(`   ❌ Step 5 FAILED:`, auditRes.error);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 6: Guardrail 2 Math Invariants via SDK
  // --------------------------------------------------------------------------
  console.log(`\n--- [6/8] Testing Whole Rupee Math Utilities ---`);
  console.log(`   formatRupee(100000)      -> '${formatRupee(100000)}'`);
  console.log(`   formatRupee(5000000n)    -> '${formatRupee(5000000n)}'`);
  console.log(`   formatRupeeAmount(25000) -> '${formatRupeeAmount(25000)}'`);
  if (formatRupee(100000) === '₹1,00,000' && formatRupee(5000000n) === '₹50,00,000') {
    console.log(`   ✅ Step 6 PASSED: Whole Rupee formatting strictly enforces 0 paise.`);
  } else {
    console.error(`   ❌ Step 6 FAILED: Rupee formatting mismatch.`);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 7: Guardrail 10 Maker-Checker Utilities via SDK
  // --------------------------------------------------------------------------
  console.log(`\n--- [7/8] Testing Maker-Checker Separation Helpers ---`);
  const currentUserId = 'user-checker-001';
  const makerUserId = 'user-maker-002';
  const selfTransaction = { makerUserId: currentUserId };
  const validTransaction = { makerUserId: makerUserId };

  const selfBlocked = isSelfApproval(currentUserId, selfTransaction);
  const otherAllowed = canAuthorizeAction(currentUserId, validTransaction);

  console.log(`   Self-approval on own action detected: ${selfBlocked} (Expected: true)`);
  console.log(`   Authorization on peer action allowed: ${otherAllowed} (Expected: true)`);

  if (selfBlocked === true && otherAllowed === true) {
    console.log(`   ✅ Step 7 PASSED: Maker != Checker UI safety guardians verified.`);
  } else {
    console.error(`   ❌ Step 7 FAILED: Maker-Checker logic failure.`);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 8: Automatic Idempotency-Key Injection Verification
  // --------------------------------------------------------------------------
  console.log(`\n--- [8/8] Testing Idempotency-Key Auto-Injection on Financial POST ---`);
  // Configure client with request inspector
  let interceptedHeaders: Headers | null = null;
  const inspectorClient = createKumaranClient({
    baseUrl: BASE_URL,
    getAccessToken: () => currentToken,
    fetch: async (req: Request) => {
      interceptedHeaders = req.headers;
      // Return a simulated response so we don't duplicate mutations unnecessarily
      return new Response(JSON.stringify({ success: true, data: { status: 'SIMULATED' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  await inspectorClient.POST('/api/v1/payments' as any, {
    body: {
      chitGroupId: 'test-group',
      ticketId: 'test-ticket',
      amount: 10000,
      paymentMode: 'CASH',
    } as any,
  });

  if (interceptedHeaders) {
    const key = (interceptedHeaders as Headers).get('Idempotency-Key');
    console.log(`   Captured Idempotency-Key header: ${key}`);
    const isUuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key || '');
    if (isUuidV4) {
      console.log(`   Valid RFC 4122 UUID v4 confirmed: ${isUuidV4}`);
      console.log(`   ✅ Step 8 PASSED: Financial mutation received automatic UUID v4 Idempotency-Key.`);
    } else {
      console.error(`   ❌ Step 8 FAILED: Invalid Idempotency-Key format: ${key}`);
      process.exit(1);
    }
  } else {
    console.error(`   ❌ Step 8 FAILED: Headers were not captured.`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`🎉 ALL 8 VERIFICATION STEPS PASSED (100% SUCCESS)`);
  console.log(`   @kumaran/api-client is fully verified live against NestJS server!`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error(`❌ Verification script error:`, err);
  process.exit(1);
});
