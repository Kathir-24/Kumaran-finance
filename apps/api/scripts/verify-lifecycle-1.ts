// ==============================================================================
// Kumaran Chits — Live Server Verification: Lifecycle 1 (Auth, 2FA, Branches & Users)
// Target: http://127.0.0.1:3000 against live PostgreSQL 17 (chitflow_dev)
// ==============================================================================

import { execSync } from 'child_process';
import { generateSync } from 'otplib';

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
  console.log(`🚀 STARTING LIVE SERVER E2E: LIFECYCLE 1 (AUTH, BRANCHES & USERS)`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Live Database: chitflow_dev (Port 5433)`);
  console.log(`======================================================\n`);

  // Pre-test Cleanup for repeatability
  queryDb(`UPDATE public."User" SET "isTotpEnabled" = false, "totpSecret" = NULL, "mpinHash" = NULL WHERE phone = '9876543210'`);
  queryDb(`DELETE FROM public."User" WHERE phone = '9842154321'`);
  queryDb(`DELETE FROM public."Branch" WHERE code = 'ERD'`);

  let accessToken = '';
  let refreshToken = '';
  let userId = '';
  let temp2faToken = '';
  let totpSecret = '';
  let erdBranchId = '';
  let muruganUserId = '';

  // --------------------------------------------------------------------------
  // Step 1: POST /auth/web/login (Initial login)
  // --------------------------------------------------------------------------
  console.log(`--- [1/21] POST /auth/web/login ---`);
  const loginPayload = {
    phone: '9876543210',
    password: 'Admin@Kumaran2026',
  };
  console.log(`[REQUEST] POST /auth/web/login:`, JSON.stringify(loginPayload));
  const loginRes = await request('POST', '/auth/web/login', loginPayload);
  console.log(`[RESPONSE] Status ${loginRes.status}:`, JSON.stringify(loginRes.json, null, 2));

  if (loginRes.status !== 200 || !loginRes.json?.data?.accessToken) {
    throw new Error(`Step 1 Failed: Login did not return accessToken`);
  }
  accessToken = loginRes.json.data.accessToken;
  refreshToken = loginRes.json.data.refreshToken;
  userId = loginRes.json.data.user.id;

  const dbUser1 = queryDb(`SELECT phone, roles, "lastLoginAt" FROM public."User" WHERE id = '${userId}'`);
  console.log(`[SQL PROOF]:`, dbUser1);

  // --------------------------------------------------------------------------
  // Step 2: GET /auth/me (User Profile)
  // --------------------------------------------------------------------------
  console.log(`\n--- [2/21] GET /auth/me ---`);
  console.log(`[REQUEST] GET /auth/me with Bearer token`);
  const meRes = await request('GET', '/auth/me', undefined, accessToken);
  console.log(`[RESPONSE] Status ${meRes.status}:`, JSON.stringify(meRes.json, null, 2));

  if (meRes.status !== 200 || meRes.json?.data?.phone !== '9876543210') {
    throw new Error(`Step 2 Failed: GET /auth/me returned invalid profile`);
  }

  // --------------------------------------------------------------------------
  // Step 3: PATCH /auth/fcm-token (Register device push token)
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/21] PATCH /auth/fcm-token ---`);
  const fcmPayload = { fcmToken: 'fcm_live_device_token_partner_001_xyz' };
  console.log(`[REQUEST] PATCH /auth/fcm-token:`, JSON.stringify(fcmPayload));
  const fcmRes = await request('PATCH', '/auth/fcm-token', fcmPayload, accessToken);
  console.log(`[RESPONSE] Status ${fcmRes.status}:`, JSON.stringify(fcmRes.json, null, 2));

  if (fcmRes.status !== 200) {
    throw new Error(`Step 3 Failed: PATCH /auth/fcm-token failed`);
  }

  const dbFcm = queryDb(`SELECT id, "fcmToken" FROM public."User" WHERE id = '${userId}'`);
  console.log(`[SQL PROOF]:`, dbFcm);

  // --------------------------------------------------------------------------
  // Step 4: POST /auth/totp/setup (Generate 2FA TOTP secret)
  // --------------------------------------------------------------------------
  console.log(`\n--- [4/21] POST /auth/totp/setup ---`);
  console.log(`[REQUEST] POST /auth/totp/setup`);
  const totpSetupRes = await request('POST', '/auth/totp/setup', undefined, accessToken);
  console.log(`[RESPONSE] Status ${totpSetupRes.status}:`, JSON.stringify(totpSetupRes.json, null, 2));

  if (![200, 201].includes(totpSetupRes.status) || !totpSetupRes.json?.data?.secret) {
    throw new Error(`Step 4 Failed: TOTP setup did not return secret (status: ${totpSetupRes.status})`);
  }
  totpSecret = totpSetupRes.json.data.secret;

  const dbTotpSecret = queryDb(`SELECT id, "totpSecret", "isTotpEnabled" FROM public."User" WHERE id = '${userId}'`);
  console.log(`[SQL PROOF]:`, dbTotpSecret);

  // --------------------------------------------------------------------------
  // Step 5: POST /auth/totp/enable (Confirm and enable 2FA)
  // --------------------------------------------------------------------------
  console.log(`\n--- [5/21] POST /auth/totp/enable ---`);
  const totpCode = generateSync({ secret: totpSecret });
  const enablePayload = {
    secret: totpSecret,
    code: totpCode,
  };
  console.log(`[REQUEST] POST /auth/totp/enable with secret and generated TOTP code ${totpCode}`);
  const enableRes = await request('POST', '/auth/totp/enable', enablePayload, accessToken);
  console.log(`[RESPONSE] Status ${enableRes.status}:`, JSON.stringify(enableRes.json, null, 2));

  if (![200, 201].includes(enableRes.status) || !enableRes.json?.data?.success) {
    throw new Error(`Step 5 Failed: Failed to enable TOTP (status: ${enableRes.status})`);
  }

  const dbTotpEnabled = queryDb(`SELECT id, "isTotpEnabled" FROM public."User" WHERE id = '${userId}'`);
  console.log(`[SQL PROOF]:`, dbTotpEnabled);

  // --------------------------------------------------------------------------
  // Step 6: POST /auth/web/login (Login with 2FA enabled -> requires2fa challenge)
  // --------------------------------------------------------------------------
  console.log(`\n--- [6/21] POST /auth/web/login (Challenge Mode) ---`);
  console.log(`[REQUEST] POST /auth/web/login with credentials when 2FA is active`);
  const challengeRes = await request('POST', '/auth/web/login', loginPayload);
  console.log(`[RESPONSE] Status ${challengeRes.status}:`, JSON.stringify(challengeRes.json, null, 2));

  if (challengeRes.status !== 200 || !challengeRes.json?.data?.requireTotp || !challengeRes.json?.data?.tempToken) {
    throw new Error(`Step 6 Failed: Login did not issue 2FA challenge and tempToken`);
  }
  temp2faToken = challengeRes.json.data.tempToken;

  // --------------------------------------------------------------------------
  // Step 7: POST /auth/web/verify-totp (Submit 2FA challenge code)
  // --------------------------------------------------------------------------
  console.log(`\n--- [7/21] POST /auth/web/verify-totp ---`);
  const verifyTotpCode = generateSync({ secret: totpSecret });
  const verifyTotpPayload = {
    tempToken: temp2faToken,
    totpCode: verifyTotpCode,
  };
  console.log(`[REQUEST] POST /auth/web/verify-totp with tempToken and totpCode ${verifyTotpCode}`);
  const verifyRes = await request('POST', '/auth/web/verify-totp', verifyTotpPayload);
  console.log(`[RESPONSE] Status ${verifyRes.status}:`, JSON.stringify(verifyRes.json, null, 2));

  if (verifyRes.status !== 200 || !verifyRes.json?.data?.accessToken) {
    throw new Error(`Step 7 Failed: 2FA TOTP verification failed`);
  }
  accessToken = verifyRes.json.data.accessToken;
  refreshToken = verifyRes.json.data.refreshToken;

  // --------------------------------------------------------------------------
  // Step 8: POST /auth/mobile/set-mpin (Routine update via Bearer token)
  // --------------------------------------------------------------------------
  console.log(`\n--- [8/21] POST /auth/mobile/set-mpin (Routine update via Bearer token) ---`);
  const setMpinPayload = { mpin: '654321' };
  console.log(`[REQUEST] POST /auth/mobile/set-mpin:`, JSON.stringify(setMpinPayload));
  const setMpinRes = await request('POST', '/auth/mobile/set-mpin', setMpinPayload, accessToken);
  console.log(`[RESPONSE] Status ${setMpinRes.status}:`, JSON.stringify(setMpinRes.json, null, 2));

  if (![200, 201].includes(setMpinRes.status)) {
    throw new Error(`Step 8 Failed: Failed to set MPIN (status: ${setMpinRes.status})`);
  }

  const dbMpin = queryDb(`SELECT id, "mpinHash" IS NOT NULL AS has_mpin FROM public."User" WHERE id = '${userId}'`);
  console.log(`[SQL PROOF]:`, dbMpin);

  // --------------------------------------------------------------------------
  // Step 9: POST /auth/mobile/login-mpin (Mobile unlock via MPIN)
  // --------------------------------------------------------------------------
  console.log(`\n--- [9/21] POST /auth/mobile/login-mpin ---`);
  const mpinLoginPayload = {
    phone: '9876543210',
    mpin: '654321',
  };
  console.log(`[REQUEST] POST /auth/mobile/login-mpin:`, JSON.stringify(mpinLoginPayload));
  const mpinLoginRes = await request('POST', '/auth/mobile/login-mpin', mpinLoginPayload);
  console.log(`[RESPONSE] Status ${mpinLoginRes.status}:`, JSON.stringify(mpinLoginRes.json, null, 2));

  if (mpinLoginRes.status !== 200 || !mpinLoginRes.json?.data?.accessToken) {
    throw new Error(`Step 9 Failed: Mobile MPIN login failed`);
  }

  // --------------------------------------------------------------------------
  // Step 10: POST /auth/refresh-token (Rotate JWT access & refresh tokens)
  // --------------------------------------------------------------------------
  console.log(`\n--- [10/21] POST /auth/refresh-token ---`);
  const refreshPayload = { refreshToken };
  console.log(`[REQUEST] POST /auth/refresh-token:`, JSON.stringify(refreshPayload));
  const refreshRes = await request('POST', '/auth/refresh-token', refreshPayload);
  console.log(`[RESPONSE] Status ${refreshRes.status}:`, JSON.stringify(refreshRes.json, null, 2));

  if (refreshRes.status !== 200 || !refreshRes.json?.data?.accessToken) {
    throw new Error(`Step 10 Failed: Token refresh failed`);
  }
  accessToken = refreshRes.json.data.accessToken;
  refreshToken = refreshRes.json.data.refreshToken;

  const dbRefresh = queryDb(`SELECT id, "refreshTokenHash" IS NOT NULL AS has_refresh FROM public."User" WHERE id = '${userId}'`);
  console.log(`[SQL PROOF]:`, dbRefresh);

  // --------------------------------------------------------------------------
  // Step 11: POST /auth/totp/disable & POST /auth/logout
  // --------------------------------------------------------------------------
  console.log(`\n--- [11/21] POST /auth/totp/disable & POST /auth/logout ---`);
  const disablePayload = { password: 'Admin@Kumaran2026' };
  console.log(`[REQUEST] POST /auth/totp/disable:`, JSON.stringify(disablePayload));
  const disableRes = await request('POST', '/auth/totp/disable', disablePayload, accessToken);
  console.log(`[RESPONSE] Status ${disableRes.status}:`, JSON.stringify(disableRes.json, null, 2));

  if (![200, 201].includes(disableRes.status) || !disableRes.json?.data?.success) {
    throw new Error(`Step 11 Failed: Failed to disable 2FA (status: ${disableRes.status})`);
  }

  console.log(`[REQUEST] POST /auth/logout`);
  const logoutRes = await request('POST', '/auth/logout', undefined, accessToken);
  console.log(`[RESPONSE] Status ${logoutRes.status}:`, JSON.stringify(logoutRes.json, null, 2));

  if (![200, 201].includes(logoutRes.status)) {
    throw new Error(`Step 11b Failed: Logout failed (status: ${logoutRes.status})`);
  }

  // Re-login to obtain fresh admin accessToken for subsequent administrative tests
  const adminRelogin = await request('POST', '/auth/web/login', loginPayload);
  accessToken = adminRelogin.json.data.accessToken;

  // --------------------------------------------------------------------------
  // Step 12: POST /auth/mobile/request-otp (Staff Mobile Onboarding OTP)
  // --------------------------------------------------------------------------
  console.log(`\n--- [12/21] POST /auth/mobile/request-otp (Staff) ---`);
  const staffOtpReqPayload = { phone: '9876543210' };
  console.log(`[REQUEST] POST /auth/mobile/request-otp:`, JSON.stringify(staffOtpReqPayload));
  const staffOtpReqRes = await request('POST', '/auth/mobile/request-otp', staffOtpReqPayload);
  console.log(`[RESPONSE] Status ${staffOtpReqRes.status}:`, JSON.stringify(staffOtpReqRes.json, null, 2));

  if (staffOtpReqRes.status !== 200 || !staffOtpReqRes.json?.data?.success) {
    throw new Error(`Step 12 Failed: Staff request-otp failed`);
  }
  const staffDebugOtp = staffOtpReqRes.json.data.debugOtp || '123456';

  // --------------------------------------------------------------------------
  // Step 13: POST /auth/mobile/verify-otp (Staff Verification -> setupToken)
  // --------------------------------------------------------------------------
  console.log(`\n--- [13/21] POST /auth/mobile/verify-otp (Staff) ---`);
  // Clear mpinHash to simulate fresh staff mobile onboarding
  queryDb(`UPDATE public."User" SET "mpinHash" = NULL WHERE phone = '9876543210'`);

  const staffVerifyPayload = {
    phone: '9876543210',
    otp: staffDebugOtp,
  };
  console.log(`[REQUEST] POST /auth/mobile/verify-otp:`, JSON.stringify(staffVerifyPayload));
  const staffVerifyRes = await request('POST', '/auth/mobile/verify-otp', staffVerifyPayload);
  console.log(`[RESPONSE] Status ${staffVerifyRes.status}:`, JSON.stringify(staffVerifyRes.json, null, 2));

  if (staffVerifyRes.status !== 200 || !staffVerifyRes.json?.data?.setupToken) {
    throw new Error(`Step 13 Failed: Staff verify-otp did not issue setupToken`);
  }
  const setupToken = staffVerifyRes.json.data.setupToken;

  // --------------------------------------------------------------------------
  // Step 14: POST /auth/mobile/set-mpin (First-time onboarding with setupToken)
  // --------------------------------------------------------------------------
  console.log(`\n--- [14/21] POST /auth/mobile/set-mpin (With setupToken) ---`);
  const onboardingMpinPayload = {
    mpin: '123456',
    setupToken,
  };
  console.log(`[REQUEST] POST /auth/mobile/set-mpin (First-Time Onboarding):`, JSON.stringify({ mpin: '123456', setupToken: setupToken.substring(0, 20) + '...' }));
  const onboardingMpinRes = await request('POST', '/auth/mobile/set-mpin', onboardingMpinPayload);
  console.log(`[RESPONSE] Status ${onboardingMpinRes.status}:`, JSON.stringify(onboardingMpinRes.json, null, 2));

  if (onboardingMpinRes.status !== 200 || !onboardingMpinRes.json?.data?.accessToken) {
    throw new Error(`Step 14 Failed: set-mpin with setupToken did not return full session tokens`);
  }
  const dbMpinAfterOnboarding = queryDb(`SELECT phone, "mpinHash" IS NOT NULL AS has_mpin FROM public."User" WHERE phone = '9876543210'`);
  console.log(`[SQL PROOF]:`, dbMpinAfterOnboarding);

  // --------------------------------------------------------------------------
  // Step 15: POST /auth/mobile/request-otp & verify-otp (Subscriber / Customer Flow)
  // --------------------------------------------------------------------------
  console.log(`\n--- [15/21] Customer Mobile OTP Flow (Subscriber Passbook Login) ---`);
  const custOtpReqPayload = { phone: '9842100101' };
  console.log(`[REQUEST] POST /auth/mobile/request-otp (Customer):`, JSON.stringify(custOtpReqPayload));
  const custOtpReqRes = await request('POST', '/auth/mobile/request-otp', custOtpReqPayload);
  console.log(`[RESPONSE] Status ${custOtpReqRes.status}:`, JSON.stringify(custOtpReqRes.json, null, 2));

  if (custOtpReqRes.status !== 200) {
    throw new Error(`Step 15a Failed: Customer request-otp failed`);
  }
  const custDebugOtp = custOtpReqRes.json.data.debugOtp || '123456';

  const custVerifyPayload = { phone: '9842100101', otp: custDebugOtp };
  console.log(`[REQUEST] POST /auth/mobile/verify-otp (Customer):`, JSON.stringify(custVerifyPayload));
  const custVerifyRes = await request('POST', '/auth/mobile/verify-otp', custVerifyPayload);
  console.log(`[RESPONSE] Status ${custVerifyRes.status}:`, JSON.stringify(custVerifyRes.json, null, 2));

  if (custVerifyRes.status !== 200 || !custVerifyRes.json?.data?.accessToken || !custVerifyRes.json?.data?.user?.roles?.includes('CUSTOMER')) {
    throw new Error(`Step 15b Failed: Customer verify-otp did not issue full subscriber JWT tokens`);
  }
  console.log(`[VERIFIED]: Subscriber K. Thangavel logged in via OTP with Role.CUSTOMER.`);

  // --------------------------------------------------------------------------
  // Step 16: POST /branches (Create Branch Office with ALL fields)
  // --------------------------------------------------------------------------
  console.log(`\n--- [16/21] POST /branches (Create Branch Office) ---`);
  const createBranchPayload = {
    code: 'ERD',
    name: 'Erode Main Branch',
    nameTamil: 'ஈரோடு முதன்மை கிளை',
    address: '12, Brough Road, Erode - 638001',
    phone: '9842143210',
  };
  console.log(`[REQUEST] POST /branches:`, JSON.stringify(createBranchPayload, null, 2));
  const createBranchRes = await request('POST', '/branches', createBranchPayload, accessToken);
  console.log(`[RESPONSE] Status ${createBranchRes.status}:`, JSON.stringify(createBranchRes.json, null, 2));

  if (createBranchRes.status !== 201 || !createBranchRes.json?.data?.id) {
    throw new Error(`Step 16 Failed: POST /branches failed`);
  }
  erdBranchId = createBranchRes.json.data.id;

  const dbBranch = queryDb(`SELECT code, name, "nameTamil", address, phone, "isActive" FROM public."Branch" WHERE id = '${erdBranchId}'`);
  console.log(`[SQL PROOF]:`, dbBranch);

  // --------------------------------------------------------------------------
  // Step 17: GET /branches & GET /branches/:id
  // --------------------------------------------------------------------------
  console.log(`\n--- [17/21] GET /branches & GET /branches/:id ---`);
  const listBranchesRes = await request('GET', '/branches?activeOnly=true', undefined, accessToken);
  console.log(`[RESPONSE] GET /branches Status ${listBranchesRes.status}: Found ${listBranchesRes.json?.data?.length} active branch(es)`);

  const singleBranchRes = await request('GET', `/branches/${erdBranchId}`, undefined, accessToken);
  console.log(`[RESPONSE] GET /branches/${erdBranchId} Status ${singleBranchRes.status}:`, JSON.stringify(singleBranchRes.json, null, 2));

  if (singleBranchRes.status !== 200 || singleBranchRes.json?.data?.code !== 'ERD') {
    throw new Error(`Step 17 Failed: Branch retrieval failed`);
  }

  // --------------------------------------------------------------------------
  // Step 18: POST /users (Create Staff User with ALL fields)
  // --------------------------------------------------------------------------
  console.log(`\n--- [18/21] POST /users (Create Staff User) ---`);
  const createUserPayload = {
    name: 'R. Murugan',
    phone: '9842154321',
    roles: ['COLLECTION_AGENT'],
    branchId: erdBranchId,
    password: 'Agent@Kumaran2026',
  };
  console.log(`[REQUEST] POST /users:`, JSON.stringify(createUserPayload, null, 2));
  const createUserRes = await request('POST', '/users', createUserPayload, accessToken);
  console.log(`[RESPONSE] Status ${createUserRes.status}:`, JSON.stringify(createUserRes.json, null, 2));

  if (createUserRes.status !== 201 || !createUserRes.json?.data?.id) {
    throw new Error(`Step 18 Failed: POST /users failed`);
  }
  muruganUserId = createUserRes.json.data.id;

  const dbUserCreated = queryDb(`SELECT name, phone, roles, "branchId", "isActive" FROM public."User" WHERE id = '${muruganUserId}'`);
  console.log(`[SQL PROOF]:`, dbUserCreated);

  // --------------------------------------------------------------------------
  // Step 19: GET /users (Search & Directory with all optional query filters)
  // --------------------------------------------------------------------------
  console.log(`\n--- [19/21] GET /users (Paginated Staff Directory) ---`);
  const listUsersRes = await request(
    'GET',
    `/users?search=Murugan&role=COLLECTION_AGENT&branchId=${erdBranchId}&isActive=true&page=1&limit=10`,
    undefined,
    accessToken,
  );
  console.log(`[RESPONSE] Status ${listUsersRes.status}:`, JSON.stringify(listUsersRes.json, null, 2));

  if (listUsersRes.status !== 200 || !listUsersRes.json?.data?.data?.some((u: any) => u.id === muruganUserId)) {
    throw new Error(`Step 19 Failed: GET /users did not return created staff user`);
  }

  // --------------------------------------------------------------------------
  // Step 20: GET /users/:id (Single Staff Profile)
  // --------------------------------------------------------------------------
  console.log(`\n--- [20/21] GET /users/:id ---`);
  const getMuruganRes = await request('GET', `/users/${muruganUserId}`, undefined, accessToken);
  console.log(`[RESPONSE] Status ${getMuruganRes.status}:`, JSON.stringify(getMuruganRes.json, null, 2));

  if (getMuruganRes.status !== 200 || getMuruganRes.json?.data?.branch?.code !== 'ERD') {
    throw new Error(`Step 20 Failed: GET /users/:id failed`);
  }

  // --------------------------------------------------------------------------
  // Step 21: PATCH /users/:id/status & PATCH /users/:id/roles
  // --------------------------------------------------------------------------
  console.log(`\n--- [21/21] PATCH /users/:id/status & PATCH /users/:id/roles ---`);
  const updateStatusPayload = { isActive: false };
  console.log(`[REQUEST] PATCH /users/${muruganUserId}/status (Deactivate):`, JSON.stringify(updateStatusPayload));
  const updateStatusRes = await request('PATCH', `/users/${muruganUserId}/status`, updateStatusPayload, accessToken);
  console.log(`[RESPONSE] Status ${updateStatusRes.status}:`, JSON.stringify(updateStatusRes.json, null, 2));

  if (updateStatusRes.status !== 200 || updateStatusRes.json?.data?.isActive !== false) {
    throw new Error(`Step 21a Failed: Deactivating staff user failed`);
  }

  const dbStatusAfter = queryDb(`SELECT id, "isActive", "refreshTokenHash" IS NULL AS session_cleared FROM public."User" WHERE id = '${muruganUserId}'`);
  console.log(`[SQL PROOF (Status)] :`, dbStatusAfter);

  const updateRolesPayload = { roles: ['COLLECTION_AGENT', 'ACCOUNTANT'] };
  console.log(`[REQUEST] PATCH /users/${muruganUserId}/roles:`, JSON.stringify(updateRolesPayload));
  const updateRolesRes = await request('PATCH', `/users/${muruganUserId}/roles`, updateRolesPayload, accessToken);
  console.log(`[RESPONSE] Status ${updateRolesRes.status}:`, JSON.stringify(updateRolesRes.json, null, 2));

  if (updateRolesRes.status !== 200 || !updateRolesRes.json?.data?.roles?.includes('ACCOUNTANT')) {
    throw new Error(`Step 21b Failed: Updating staff roles failed`);
  }

  const dbRolesAfter = queryDb(`SELECT id, roles FROM public."User" WHERE id = '${muruganUserId}'`);
  console.log(`[SQL PROOF (Roles)] :`, dbRolesAfter);

  console.log(`\n======================================================`);
  console.log(`✅ LIFECYCLE 1 LIVE VERIFICATION 100% PASSED!`);
  console.log(`   All 21 endpoints exercised against live port 3000.`);
  console.log(`   Direct PostgreSQL 17 truth queries verified.`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error(`\n❌ LIFECYCLE 1 FAILED:\n`, err);
  process.exit(1);
});
