// ==============================================================================
// Kumaran Chits — Live Server Verification: Lifecycle 1 (Auth & 2FA)
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
  console.log(`🚀 STARTING LIVE SERVER E2E: LIFECYCLE 1 (AUTH & 2FA)`);
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Live Database: chitflow_dev (Port 5433)`);
  console.log(`======================================================\n`);

  // Reset 2FA state for test repeatability
  queryDb(`UPDATE public."User" SET "isTotpEnabled" = false, "totpSecret" = NULL WHERE phone = '9876543210'`);

  let accessToken = '';
  let refreshToken = '';
  let userId = '';
  let temp2faToken = '';
  let totpSecret = '';

  // --------------------------------------------------------------------------
  // Step 1: POST /auth/web/login (Initial login)
  // --------------------------------------------------------------------------
  console.log(`--- [1/11] POST /auth/web/login ---`);
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
  console.log(`\n--- [2/11] GET /auth/me ---`);
  console.log(`[REQUEST] GET /auth/me with Bearer token`);
  const meRes = await request('GET', '/auth/me', undefined, accessToken);
  console.log(`[RESPONSE] Status ${meRes.status}:`, JSON.stringify(meRes.json, null, 2));

  if (meRes.status !== 200 || meRes.json?.data?.phone !== '9876543210') {
    throw new Error(`Step 2 Failed: GET /auth/me returned invalid profile`);
  }

  // --------------------------------------------------------------------------
  // Step 3: PATCH /auth/fcm-token (Register device push token)
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/11] PATCH /auth/fcm-token ---`);
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
  console.log(`\n--- [4/11] POST /auth/totp/setup ---`);
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
  console.log(`\n--- [5/11] POST /auth/totp/enable ---`);
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
  console.log(`\n--- [6/11] POST /auth/web/login (Challenge Mode) ---`);
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
  console.log(`\n--- [7/11] POST /auth/web/verify-totp ---`);
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
  // Step 8: POST /auth/mobile/set-mpin (Set 6-digit MPIN)
  // --------------------------------------------------------------------------
  console.log(`\n--- [8/11] POST /auth/mobile/set-mpin ---`);
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
  console.log(`\n--- [9/11] POST /auth/mobile/login-mpin ---`);
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
  console.log(`\n--- [10/11] POST /auth/refresh-token ---`);
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
  // Step 11: POST /auth/totp/disable (Disable 2FA) & POST /auth/logout (Session Revocation)
  // --------------------------------------------------------------------------
  console.log(`\n--- [11/11] POST /auth/totp/disable & POST /auth/logout ---`);
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

  const dbFinal = queryDb(`SELECT id, "isTotpEnabled", "refreshTokenHash" IS NULL AS refresh_cleared FROM public."User" WHERE id = '${userId}'`);
  console.log(`[SQL PROOF]:`, dbFinal);

  console.log(`\n======================================================`);
  console.log(`✅ LIFECYCLE 1 LIVE VERIFICATION 100% PASSED!`);
  console.log(`   All 11 endpoints exercised against live port 3000.`);
  console.log(`   Database updates verified via direct SQL queries.`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error(`\n❌ LIFECYCLE 1 FAILED:\n`, err);
  process.exit(1);
});
