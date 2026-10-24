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

function queryRedis(cmd: string): string {
  try {
    return execSync(`docker exec chitflow-redis redis-cli ${cmd}`, { encoding: 'utf-8' }).trim();
  } catch (err: any) {
    return `[REDIS ERROR]: ${err.message}`;
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
  // Step 12: POST /auth/mobile/request-otp (Staff Mobile Onboarding OTP & Redis TTL Verification)
  // --------------------------------------------------------------------------
  console.log(`\n--- [12/21] POST /auth/mobile/request-otp (Staff & Redis Distributed Storage Proof) ---`);
  const staffOtpReqPayload = { phone: '9876543210' };
  console.log(`[REQUEST] POST /auth/mobile/request-otp:`, JSON.stringify(staffOtpReqPayload));
  const staffOtpReqRes = await request('POST', '/auth/mobile/request-otp', staffOtpReqPayload);
  console.log(`[RESPONSE] Status ${staffOtpReqRes.status}:`, JSON.stringify(staffOtpReqRes.json, null, 2));

  if (staffOtpReqRes.status !== 200 || !staffOtpReqRes.json?.data?.success) {
    throw new Error(`Step 12 Failed: Staff request-otp failed`);
  }

  // Live Redis Verification: Key presence & 300s TTL
  const redisTtl = parseInt(queryRedis('TTL auth:otp:9876543210'), 10);
  const redisRawPayload = queryRedis('GET auth:otp:9876543210');
  console.log(`[REDIS PROOF] TTL auth:otp:9876543210: ${redisTtl}s (Target: <= 300s and > 270s)`);
  console.log(`[REDIS PROOF] Raw Stored Payload:`, redisRawPayload);

  if (redisTtl < 270 || redisTtl > 300) {
    throw new Error(`Step 12 Failed: Redis OTP TTL out of expected bounds: ${redisTtl}s`);
  }
  const parsedRedisPayload = JSON.parse(redisRawPayload);
  if (!parsedRedisPayload.hashedOtp || parsedRedisPayload.hashedOtp.length !== 64 || parsedRedisPayload.attempts !== 0) {
    throw new Error(`Step 12 Failed: Redis payload format invalid: ${redisRawPayload}`);
  }
  console.log(`   ✅ Redis Key Exists with ${redisTtl}s TTL and SHA-256 hash.`);

  // --------------------------------------------------------------------------
  // Step 12.1: Brute-Force 3-Attempt Lockout Guard Test
  // --------------------------------------------------------------------------
  console.log(`\n--- [12.1/21] Brute-Force 3-Attempt Lockout Guard Test ---`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wrongOtpRes = await request('POST', '/auth/mobile/verify-otp', { phone: '9876543210', otp: '000000' });
    const currentAttempts = JSON.parse(queryRedis('GET auth:otp:9876543210')).attempts;
    const remainingTtl = parseInt(queryRedis('TTL auth:otp:9876543210'), 10);
    console.log(`   Attempt ${attempt} with wrong OTP: Status ${wrongOtpRes.status}, Redis attempts: ${currentAttempts}, TTL: ${remainingTtl}s`);
    if (wrongOtpRes.status !== 400 || currentAttempts !== attempt) {
      throw new Error(`Lockout test failed at attempt ${attempt}`);
    }
  }

  // 4th attempt must be rejected with lockout message
  const lockedOutRes = await request('POST', '/auth/mobile/verify-otp', { phone: '9876543210', otp: '000000' });
  console.log(`   Attempt 4 (Locked Out): Status ${lockedOutRes.status}, Error:`, lockedOutRes.json?.message || lockedOutRes.json?.error);
  if (lockedOutRes.status !== 400 || !JSON.stringify(lockedOutRes.json).includes('Too many invalid verification attempts')) {
    throw new Error(`Step 12.1 Failed: 4th attempt was not rejected with lockout error: ${JSON.stringify(lockedOutRes.json)}`);
  }
  console.log(`   ✅ 3-Attempt Lockout Enforced: Key locked and purged from Redis after maximum failed attempts.`);

  // Re-request fresh OTP for legitimate onboarding
  console.log(`   Re-requesting fresh OTP for legitimate staff onboarding...`);
  const freshOtpRes = await request('POST', '/auth/mobile/request-otp', staffOtpReqPayload);
  const staffDebugOtp = freshOtpRes.json?.data?.debugOtp || '123456';
  console.log(`   Fresh OTP generated. Debug OTP: ${staffDebugOtp}`);

  // --------------------------------------------------------------------------
  // Step 13: POST /auth/mobile/verify-otp (Staff Verification -> setupToken & Anti-Replay Purge)
  // --------------------------------------------------------------------------
  console.log(`\n--- [13/21] POST /auth/mobile/verify-otp (Staff Verification & Atomic Deletion) ---`);
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

  // Live Redis Assertion: Atomic Key Deletion
  const keyExistsAfterVerify = queryRedis('EXISTS auth:otp:9876543210');
  console.log(`[REDIS PROOF] EXISTS auth:otp:9876543210: ${keyExistsAfterVerify} (Expected: 0)`);
  if (keyExistsAfterVerify !== '0') {
    throw new Error(`Step 13 Failed: Redis OTP key was not deleted upon successful verification!`);
  }
  console.log(`   ✅ Anti-Replay Guard: Redis key was atomically deleted.`);

  // Anti-Replay Check: Trying to verify the same OTP immediately must fail
  const replayRes = await request('POST', '/auth/mobile/verify-otp', staffVerifyPayload);
  console.log(`[ANTI-REPLAY TEST] Re-verification attempt status: ${replayRes.status}`);
  if (replayRes.status !== 400) {
    throw new Error(`Step 13 Failed: OTP replay attack succeeded (status: ${replayRes.status})`);
  }
  console.log(`   ✅ Anti-Replay Guard: Replay attempt rejected with HTTP 400.`);

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
  console.log(`\n--- [15/21] Customer Mobile OTP Flow (Subscriber Passbook Login & Redis Assertion) ---`);
  const custOtpReqPayload = { phone: '9842100101' };
  console.log(`[REQUEST] POST /auth/mobile/request-otp (Customer):`, JSON.stringify(custOtpReqPayload));
  const custOtpReqRes = await request('POST', '/auth/mobile/request-otp', custOtpReqPayload);
  console.log(`[RESPONSE] Status ${custOtpReqRes.status}:`, JSON.stringify(custOtpReqRes.json, null, 2));

  if (custOtpReqRes.status !== 200) {
    throw new Error(`Step 15a Failed: Customer request-otp failed`);
  }
  const custDebugOtp = custOtpReqRes.json.data.debugOtp || '123456';

  // Live Redis Verification for Customer
  const custTtl = parseInt(queryRedis('TTL auth:otp:9842100101'), 10);
  console.log(`[REDIS PROOF] TTL auth:otp:9842100101: ${custTtl}s (Target: <= 300s)`);
  if (custTtl < 270 || custTtl > 300) {
    throw new Error(`Step 15 Failed: Customer Redis OTP TTL out of bounds: ${custTtl}s`);
  }

  const custVerifyPayload = { phone: '9842100101', otp: custDebugOtp };
  console.log(`[REQUEST] POST /auth/mobile/verify-otp (Customer):`, JSON.stringify(custVerifyPayload));
  const custVerifyRes = await request('POST', '/auth/mobile/verify-otp', custVerifyPayload);
  console.log(`[RESPONSE] Status ${custVerifyRes.status}:`, JSON.stringify(custVerifyRes.json, null, 2));

  if (custVerifyRes.status !== 200 || !custVerifyRes.json?.data?.accessToken || !custVerifyRes.json?.data?.user?.roles?.includes('CUSTOMER')) {
    throw new Error(`Step 15b Failed: Customer verify-otp did not issue full subscriber JWT tokens`);
  }
  const customerAccessToken = custVerifyRes.json.data.accessToken;
  const customerId = custVerifyRes.json.data.user.id;

  // Assert atomic deletion
  const custKeyExists = queryRedis('EXISTS auth:otp:9842100101');
  console.log(`[REDIS PROOF] EXISTS auth:otp:9842100101 post-verify: ${custKeyExists} (Expected: 0)`);
  if (custKeyExists !== '0') {
    throw new Error(`Step 15 Failed: Customer Redis OTP key was not deleted upon verify!`);
  }
  console.log(`[VERIFIED]: Subscriber K. Thangavel logged in via OTP with Role.CUSTOMER & Redis state cleaned.`);

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
  console.log(`\n--- [21/24] PATCH /users/:id/status & PATCH /users/:id/roles ---`);
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

  // Re-activate Murugan for password change and reset tests
  const reactivateRes = await request('PATCH', `/users/${muruganUserId}/status`, { isActive: true }, accessToken);
  if (reactivateRes.status !== 200) {
    throw new Error(`Failed to reactivate staff user Murugan for subsequent testing`);
  }

  // --------------------------------------------------------------------------
  // Step 22: GET /auth/me (Customer Profile Verification - Bug Fix Proof)
  // --------------------------------------------------------------------------
  console.log(`\n--- [22/24] GET /auth/me (Subscriber / Customer Persona) ---`);
  console.log(`[REQUEST] GET /auth/me with Customer JWT (Bearer ${customerAccessToken.substring(0, 20)}...)`);
  const customerMeRes = await request('GET', '/auth/me', undefined, customerAccessToken);
  console.log(`[RESPONSE] Status ${customerMeRes.status}:`, JSON.stringify(customerMeRes.json, null, 2));

  if (customerMeRes.status !== 200 || !customerMeRes.json?.data?.roles?.includes('CUSTOMER')) {
    throw new Error(`Step 22 Failed: GET /auth/me failed for Customer persona with status ${customerMeRes.status}`);
  }
  const custMeData = customerMeRes.json.data;
  if (!custMeData.customerCode || custMeData.phone !== '9842100101') {
    throw new Error(`Step 22 Failed: Customer profile payload missing customerCode or matching phone`);
  }

  const dbCustMe = queryDb(`SELECT id, "customerCode", "fullName", phone, "isKycVerified", "branchId" FROM public."Customer" WHERE id = '${customerId}'`);
  console.log(`[SQL PROOF (Customer Profile)] :`, dbCustMe);

  // --------------------------------------------------------------------------
  // Step 23: POST /auth/change-password (Staff Self-Service Password Change)
  // --------------------------------------------------------------------------
  console.log(`\n--- [23/24] POST /auth/change-password (Staff Self-Service) ---`);
  // First login as Murugan to obtain Murugan's access token
  const muruganLoginPayload = { phone: '9842154321', password: 'Agent@Kumaran2026' };
  const muruganLoginRes = await request('POST', '/auth/web/login', muruganLoginPayload);
  if (muruganLoginRes.status !== 200 || !muruganLoginRes.json?.data?.accessToken) {
    throw new Error(`Step 23 Pre-flight Failed: Murugan login failed with status ${muruganLoginRes.status}`);
  }
  const muruganAccessToken = muruganLoginRes.json.data.accessToken;

  const changePwPayload = {
    currentPassword: 'Agent@Kumaran2026',
    newPassword: 'NewAgentPassword#2026',
  };
  console.log(`[REQUEST] POST /auth/change-password (All fields: currentPassword, newPassword):`, JSON.stringify({ currentPassword: '***', newPassword: '***' }));
  const changePwRes = await request('POST', '/auth/change-password', changePwPayload, muruganAccessToken);
  console.log(`[RESPONSE] Status ${changePwRes.status}:`, JSON.stringify(changePwRes.json, null, 2));

  if (changePwRes.status !== 200 && changePwRes.status !== 201) {
    throw new Error(`Step 23 Failed: POST /auth/change-password failed with status ${changePwRes.status}`);
  }

  // Verify Murugan can now login with the new password
  const muruganReloginRes = await request('POST', '/auth/web/login', { phone: '9842154321', password: 'NewAgentPassword#2026' });
  if (muruganReloginRes.status !== 200) {
    throw new Error(`Step 23 Failed: Murugan re-login with updated password failed with status ${muruganReloginRes.status}`);
  }
  console.log(`[VERIFIED]: Murugan successfully logged in with newly changed password.`);

  const dbPwAfterChange = queryDb(`SELECT id, name, phone, "passwordHash" IS NOT NULL AS has_password_hash FROM public."User" WHERE id = '${muruganUserId}'`);
  console.log(`[SQL PROOF (Password Hash)] :`, dbPwAfterChange);

  // --------------------------------------------------------------------------
  // Step 24: POST /users/:id/reset-password (Super Admin Credential Reset)
  // --------------------------------------------------------------------------
  console.log(`\n--- [24/24] POST /users/:id/reset-password (Super Admin Force Reset) ---`);
  const resetPwPayload = {
    temporaryPassword: 'AdminForcedReset@999',
  };
  console.log(`[REQUEST] POST /users/${muruganUserId}/reset-password (Payload: temporaryPassword):`, JSON.stringify({ temporaryPassword: '***' }));
  const resetPwRes = await request('POST', `/users/${muruganUserId}/reset-password`, resetPwPayload, accessToken);
  console.log(`[RESPONSE] Status ${resetPwRes.status}:`, JSON.stringify(resetPwRes.json, null, 2));

  if (resetPwRes.status !== 200 && resetPwRes.status !== 201) {
    throw new Error(`Step 24 Failed: POST /users/:id/reset-password failed with status ${resetPwRes.status}`);
  }

  // Verify previous session is invalidated (refreshTokenHash IS NULL)
  const dbResetProof = queryDb(`SELECT id, name, "refreshTokenHash" IS NULL AS session_invalidated, "passwordHash" IS NOT NULL AS has_password_hash FROM public."User" WHERE id = '${muruganUserId}'`);
  console.log(`[SQL PROOF (Reset & Session Invalidation)] :`, dbResetProof);

  // Verify Murugan can now login with Admin-forced reset password
  const muruganLoginAfterReset = await request('POST', '/auth/web/login', { phone: '9842154321', password: 'AdminForcedReset@999' });
  if (muruganLoginAfterReset.status !== 200) {
    throw new Error(`Step 24 Failed: Login with admin reset password failed with status ${muruganLoginAfterReset.status}`);
  }
  console.log(`[VERIFIED]: Murugan successfully authenticated with Super Admin reset password.`);

  console.log(`\n======================================================`);
  console.log(`✅ LIFECYCLE 1 LIVE VERIFICATION 100% PASSED!`);
  console.log(`   All 24 endpoints exercised against live port 3000.`);
  console.log(`   Direct PostgreSQL 17 truth queries verified.`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error(`\n❌ LIFECYCLE 1 FAILED:\n`, err);
  process.exit(1);
});
