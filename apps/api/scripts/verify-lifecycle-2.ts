// ==============================================================================
// Kumaran Chits — Live Server Verification: Lifecycle 2 (Customer & Nominee)
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
  console.log(`🚀 STARTING LIVE SERVER E2E: LIFECYCLE 2 (CUSTOMER & NOMINEE)`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Live Database: chitflow_dev (Port 5433)`);
  console.log(`======================================================\n`);

  // Step 0: Obtain Admin Auth Token
  console.log(`--- [0/8] Authenticating Admin for Lifecycle 2 ---`);
  // Ensure TOTP is disabled for smooth admin login in test run
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

  // Clean up any test customer with phone '9842711223' to ensure repeatable runs
  const existingCustId = queryDb(`SELECT id FROM public."Customer" WHERE phone = '9842711223'`);
  if (existingCustId && !existingCustId.startsWith('[DB ERROR]')) {
    queryDb(`DELETE FROM public."Nominee" WHERE "customerId" = '${existingCustId}'`);
    queryDb(`DELETE FROM public."Customer" WHERE id = '${existingCustId}'`);
    console.log(`   Cleaned up pre-existing test customer ${existingCustId}`);
  }

  let customerId = '';
  let customerCode = '';
  let nomineeId = '';

  // --------------------------------------------------------------------------
  // Step 1: POST /customers (Register new customer)
  // --------------------------------------------------------------------------
  console.log(`\n--- [1/8] POST /customers (Register customer) ---`);
  const createPayload = {
    fullName: 'Sundaram S',
    fullNameTamil: 'சுந்தரம் சு',
    phone: '9842711223',
    altPhone: '9443211223',
    addressLine1: '14/2, Gandhi Nagar',
    addressLine2: 'Near Old Bus Stand',
    city: 'Perundurai',
    pincode: '638052',
    panNumber: 'ABCDE1234F',
    aadhaarLast4: '4821',
  };
  console.log(`   Payload:`, JSON.stringify(createPayload, null, 2));

  const createRes = await request('POST', '/customers', createPayload, token);
  console.log(`   Status: ${createRes.status}`);
  console.log(`   Response Data:`, JSON.stringify(createRes.json?.data, null, 2));

  if (createRes.status !== 201 || !createRes.json?.data?.id) {
    console.error('Failed to create customer:', createRes);
    process.exit(1);
  }
  customerId = createRes.json.data.id;
  customerCode = createRes.json.data.customerCode;

  // DB Verification
  const dbCust = queryDb(
    `SELECT id, "customerCode", "fullName", "fullNameTamil", phone, "altPhone", "addressLine1", city, pincode, "panNumber", "aadhaarLast4", "isKycVerified" FROM public."Customer" WHERE id = '${customerId}'`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   ${dbCust}`);

  // --------------------------------------------------------------------------
  // Step 2: GET /customers (List customers with pagination & filter)
  // --------------------------------------------------------------------------
  console.log(`\n--- [2/8] GET /customers (List & search customers) ---`);
  const listRes = await request('GET', `/customers?search=Sundaram&page=1&limit=10`, undefined, token);
  console.log(`   Status: ${listRes.status}`);
  const items = listRes.json?.data?.data || [];
  const total = listRes.json?.data?.total;
  console.log(`   Found: ${items.length} customer(s), total: ${total}`);
  console.log(`   Matched Customer Code: ${items[0]?.customerCode}`);

  if (listRes.status !== 200 || !items.some((c: any) => c.id === customerId)) {
    console.error('Customer not found in search results:', listRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 3: GET /customers/:id (Customer 360 profile)
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/8] GET /customers/${customerId} (Customer 360 profile) ---`);
  const profileRes = await request('GET', `/customers/${customerId}`, undefined, token);
  console.log(`   Status: ${profileRes.status}`);
  console.log(`   Profile Full Name: ${profileRes.json?.data?.fullName}`);
  console.log(`   Profile Phone: ${profileRes.json?.data?.phone}`);
  console.log(`   Profile KYC Status: ${profileRes.json?.data?.isKycVerified}`);
  console.log(`   Nominees Count: ${profileRes.json?.data?.nominees?.length}`);

  if (profileRes.status !== 200 || profileRes.json?.data?.id !== customerId) {
    console.error('Failed to retrieve customer profile:', profileRes);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 4: PATCH /customers/:id (Update address & alt phone)
  // --------------------------------------------------------------------------
  console.log(`\n--- [4/8] PATCH /customers/${customerId} (Update address details) ---`);
  const updatePayload = {
    addressLine1: '15/A, North Street',
    addressLine2: 'Opposite Murugan Temple',
    altPhone: '9443299999',
  };
  console.log(`   Payload:`, JSON.stringify(updatePayload, null, 2));

  const updateRes = await request('PATCH', `/customers/${customerId}`, updatePayload, token);
  console.log(`   Status: ${updateRes.status}`);
  console.log(`   Updated AddressLine1: ${updateRes.json?.data?.addressLine1}`);
  console.log(`   Updated AltPhone: ${updateRes.json?.data?.altPhone}`);

  if (updateRes.status !== 200 || updateRes.json?.data?.addressLine1 !== '15/A, North Street') {
    console.error('Failed to update customer:', updateRes);
    process.exit(1);
  }

  // DB Verification
  const dbUpdatedCust = queryDb(
    `SELECT "addressLine1", "addressLine2", "altPhone" FROM public."Customer" WHERE id = '${customerId}'`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   ${dbUpdatedCust}`);

  // --------------------------------------------------------------------------
  // Step 5: POST /customers/:id/nominees (Add nominee)
  // --------------------------------------------------------------------------
  console.log(`\n--- [5/8] POST /customers/${customerId}/nominees (Add nominee) ---`);
  const nomineePayload = {
    fullName: 'Kavitha S',
    relationship: 'Spouse',
    phone: '9842798765',
    aadhaarLast4: '8912',
  };
  console.log(`   Payload:`, JSON.stringify(nomineePayload, null, 2));

  const nomineeRes = await request('POST', `/customers/${customerId}/nominees`, nomineePayload, token);
  console.log(`   Status: ${nomineeRes.status}`);
  console.log(`   Nominee Data:`, JSON.stringify(nomineeRes.json?.data, null, 2));

  if (nomineeRes.status !== 201 || !nomineeRes.json?.data?.id) {
    console.error('Failed to add nominee:', nomineeRes);
    process.exit(1);
  }
  nomineeId = nomineeRes.json.data.id;

  // DB Verification
  const dbNominee = queryDb(
    `SELECT id, "customerId", "fullName", relationship, phone, "aadhaarLast4" FROM public."Nominee" WHERE id = '${nomineeId}'`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   ${dbNominee}`);

  // --------------------------------------------------------------------------
  // Step 6: PATCH /customers/:id/kyc-status (Approve KYC verification)
  // --------------------------------------------------------------------------
  console.log(`\n--- [6/8] PATCH /customers/${customerId}/kyc-status (Verify KYC) ---`);
  const kycPayload = {
    isKycVerified: true,
  };
  console.log(`   Payload:`, JSON.stringify(kycPayload, null, 2));

  const kycRes = await request('PATCH', `/customers/${customerId}/kyc-status`, kycPayload, token);
  console.log(`   Status: ${kycRes.status}`);
  console.log(`   Verified Status: ${kycRes.json?.data?.isKycVerified}`);

  if (kycRes.status !== 200 || kycRes.json?.data?.isKycVerified !== true) {
    console.error('Failed to update KYC status:', kycRes);
    process.exit(1);
  }

  // DB Verification
  const dbKyc = queryDb(`SELECT "isKycVerified" FROM public."Customer" WHERE id = '${customerId}'`);
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   isKycVerified = ${dbKyc}`);

  // --------------------------------------------------------------------------
  // Step 7: PATCH /customers/:id/fcm-token (Register device push token)
  // --------------------------------------------------------------------------
  console.log(`\n--- [7/8] PATCH /customers/${customerId}/fcm-token (Register push token) ---`);
  const fcmPayload = {
    fcmToken: 'fcm_mock_token_sundaram_device_android_xyz123',
    deviceType: 'ANDROID',
  };
  console.log(`   Payload:`, JSON.stringify(fcmPayload, null, 2));

  const fcmRes = await request('PATCH', `/customers/${customerId}/fcm-token`, fcmPayload, token);
  console.log(`   Status: ${fcmRes.status}`);
  console.log(`   Response Data:`, JSON.stringify(fcmRes.json?.data, null, 2));

  if (fcmRes.status !== 200 || !fcmRes.json?.data?.success) {
    console.error('Failed to update FCM token:', fcmRes);
    process.exit(1);
  }

  // DB Verification
  const dbFcm = queryDb(`SELECT "fcmToken" FROM public."Customer" WHERE id = '${customerId}'`);
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   fcmToken = ${dbFcm}`);

  // --------------------------------------------------------------------------
  // Step 8: DELETE /customers/:id/nominees/:nomineeId (Remove nominee)
  // --------------------------------------------------------------------------
  console.log(`\n--- [8/8] DELETE /customers/${customerId}/nominees/${nomineeId} (Remove nominee) ---`);
  const deleteNomineeRes = await request('DELETE', `/customers/${customerId}/nominees/${nomineeId}`, undefined, token);
  console.log(`   Status: ${deleteNomineeRes.status}`);
  console.log(`   Response Data:`, JSON.stringify(deleteNomineeRes.json?.data, null, 2));

  if (deleteNomineeRes.status !== 200 || !deleteNomineeRes.json?.data?.success) {
    console.error('Failed to delete nominee:', deleteNomineeRes);
    process.exit(1);
  }

  // DB Verification
  const dbNomineeCheck = queryDb(
    `SELECT count(*) FROM public."Nominee" WHERE id = '${nomineeId}'`
  );
  console.log(`   [PostgreSQL DB Verification]:`);
  console.log(`   Nominee count for deleted ID = ${dbNomineeCheck} (Expected: 0)`);

  console.log(`\n======================================================`);
  console.log(`🎉 ALL 8 LIFECYCLE 2 ENDPOINTS VERIFIED SUCCESSFULLY!`);
  console.log(`   Live Server (:3000) <--> Live Postgres (:5433)`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error('Fatal error during execution:', err);
  process.exit(1);
});
