// ==============================================================================
// Kumaran Chits — Production Ingress & Nginx Reverse Proxy Verification
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/06-devops/infrastructure-and-drp.md (§1, §4)
// PRODUCTION-DEPLOYMENT-GUIDE.md (§1, §3, §4)
// ==============================================================================

import * as http from 'http';
import * as https from 'https';

interface IngressAssertion {
  name: string;
  description: string;
  passed: boolean;
  details: string;
}

const assertions: IngressAssertion[] = [];

function recordAssertion(name: string, description: string, passed: boolean, details: string) {
  assertions.push({ name, description, passed, details });
  console.log(`   ${passed ? '✅' : '❌'} [${name}]`);
  console.log(`      ${details}`);
}

const HTTP_PORT = parseInt(process.env.NGINX_HTTP_PORT || '80', 10);
const HTTPS_PORT = parseInt(process.env.NGINX_HTTPS_PORT || '443', 10);
const HOST = '127.0.0.1';

// Custom https agent allowing self-signed development certificates
const insecureAgent = new https.Agent({
  rejectUnauthorized: false,
});

function httpGet(options: http.RequestOptions): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('HTTP request timed out after 5000ms'));
    });
  });
}

function httpsRequest(
  method: string,
  path: string,
  headers: Record<string, string | number> = {},
  bodyObj?: Record<string, unknown>,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = bodyObj ? JSON.stringify(bodyObj) : undefined;
    const reqHeaders: http.OutgoingHttpHeaders = {
      Host: 'localhost',
      ...headers,
    };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(
      {
        host: HOST,
        port: HTTPS_PORT,
        path,
        method,
        headers: reqHeaders,
        agent: insecureAgent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error(`HTTPS ${method} ${path} timed out after 5000ms`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function readHttpsFirstSseEvent(
  path: string,
  cookieHeader: string,
  timeoutMs = 6000,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; chunk: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: HOST,
        port: HTTPS_PORT,
        path,
        method: 'GET',
        headers: {
          Host: 'localhost',
          Accept: 'text/event-stream',
          Cookie: cookieHeader,
        },
        agent: insecureAgent,
      },
      (res) => {
        let buffer = '';
        const timer = setTimeout(() => {
          req.destroy();
          reject(new Error(`Timed out reading SSE data after ${timeoutMs}ms`));
        }, timeoutMs);

        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          if (buffer.includes('data:')) {
            clearTimeout(timer);
            req.destroy();
            resolve({
              statusCode: res.statusCode || 0,
              headers: res.headers,
              chunk: buffer,
            });
          }
        });
        res.on('error', (err) => {
          clearTimeout(timer);
          if (!buffer.includes('data:')) reject(err);
        });
      },
    );
    req.on('error', (err: any) => {
      if (err?.code !== 'ECONNRESET') reject(err);
    });
    req.end();
  });
}

function httpsGet(options: https.RequestOptions): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get({ ...options, agent: insecureAgent }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('HTTPS request timed out after 5000ms'));
    });
  });
}

export async function runIngressVerification(): Promise<boolean> {
  console.log(`\n======================================================`);
  console.log(`🚀 STARTING NGINX REVERSE PROXY & INGRESS VERIFICATION`);
  console.log(`   Kumaran Chits — Kumaran Finance (Perundurai, TN)`);
  console.log(`   Ingress Target: HTTP Port ${HTTP_PORT} | HTTPS Port ${HTTPS_PORT}`);
  console.log(`   Compliance: docs/06-devops/infrastructure-and-drp.md §1, §4`);
  console.log(`======================================================\n`);

  // --------------------------------------------------------------------------
  // Step 1: ING-1 — Port 80 HTTP -> HTTPS 301 Permanent Redirect
  // --------------------------------------------------------------------------
  console.log(`--- [1/7] ING-1: Plain HTTP Port 80 Redirect ---`);
  try {
    const res = await httpGet({
      host: HOST,
      port: HTTP_PORT,
      path: '/api/v1/chits',
      headers: { Host: 'localhost' },
    });
    const location = res.headers.location || '';
    const passed = res.statusCode === 301 && location.startsWith('https://');
    recordAssertion(
      'ING-1: Port 80 Ingress Redirection',
      'Plain HTTP requests must return 301 Moved Permanently redirecting to HTTPS',
      passed,
      `Status: ${res.statusCode} (Expected 301). Location: ${location}`,
    );
  } catch (err: any) {
    recordAssertion(
      'ING-1: Port 80 Ingress Redirection',
      'Plain HTTP requests must return 301 Moved Permanently redirecting to HTTPS',
      false,
      `Connection error on port ${HTTP_PORT}: ${err.message}`,
    );
  }

  // --------------------------------------------------------------------------
  // Step 2: ING-2 — Port 80 Health Probe Bypass
  // --------------------------------------------------------------------------
  console.log(`\n--- [2/7] ING-2: Plain HTTP /health Liveness Bypass ---`);
  try {
    const res = await httpGet({
      host: HOST,
      port: HTTP_PORT,
      path: '/health',
      headers: { Host: 'localhost' },
    });
    const isOk = res.statusCode === 200 && res.body.includes('"status":"ok"');
    recordAssertion(
      'ING-2: Orchestrator Liveness Probe Bypass',
      '/health must be accessible over HTTP without redirect for container orchestrator checks',
      isOk,
      `Status: ${res.statusCode} (Expected 200). Body snippet: ${res.body.substring(0, 60)}...`,
    );
  } catch (err: any) {
    recordAssertion(
      'ING-2: Orchestrator Liveness Probe Bypass',
      '/health must be accessible over HTTP without redirect for container orchestrator checks',
      false,
      `Error probing /health on port ${HTTP_PORT}: ${err.message}`,
    );
  }

  // --------------------------------------------------------------------------
  // Step 3: ING-3 — Port 443 HTTPS TLS Handshake & Health Probe
  // --------------------------------------------------------------------------
  console.log(`\n--- [3/7] ING-3: Port 443 HTTPS TLS Handshake & Health ---`);
  try {
    const res = await httpsGet({
      host: HOST,
      port: HTTPS_PORT,
      path: '/health',
      headers: { Host: 'localhost' },
    });
    const isOk = res.statusCode === 200 && res.body.includes('"status":"ok"');
    recordAssertion(
      'ING-3: HTTPS TLS Handshake & Termination',
      'Port 443 terminates TLS and proxies /health to NestJS API upstream',
      isOk,
      `Status: ${res.statusCode} (Expected 200). Body: ${res.body.trim()}`,
    );
  } catch (err: any) {
    recordAssertion(
      'ING-3: HTTPS TLS Handshake & Termination',
      'Port 443 terminates TLS and proxies /health to NestJS API upstream',
      false,
      `Error on port ${HTTPS_PORT} TLS handshake: ${err.message}`,
    );
  }

  // --------------------------------------------------------------------------
  // Step 4: ING-4 — Port 443 HTTPS API Reverse Proxying
  // --------------------------------------------------------------------------
  console.log(`\n--- [4/7] ING-4: HTTPS API Reverse Proxying (/api/v1/chits) ---`);
  try {
    const res = await httpsGet({
      host: HOST,
      port: HTTPS_PORT,
      path: '/api/v1/chits',
      headers: { Host: 'localhost' },
    });
    // Expected: 401 Unauthorized because no Bearer token was provided (proves request reached NestJS AuthGuard)
    const reachedApi = res.statusCode === 401 || res.statusCode === 200;
    recordAssertion(
      'ING-4: Upstream API Reverse Proxying',
      'Requests to /api/ are proxied to internal NestJS container preserving route prefix and auth guards',
      reachedApi,
      `Status: ${res.statusCode} (Expected 401 or 200). Upstream response verified.`,
    );
  } catch (err: any) {
    recordAssertion(
      'ING-4: Upstream API Reverse Proxying',
      'Requests to /api/ are proxied to internal NestJS container',
      false,
      `Error proxying /api/ on port ${HTTPS_PORT}: ${err.message}`,
    );
  }

  // --------------------------------------------------------------------------
  // Step 5: ING-5 — OWASP Top 10 Security Headers
  // --------------------------------------------------------------------------
  console.log(`\n--- [5/7] ING-5: OWASP Security Headers Ingress Check ---`);
  try {
    const res = await httpsGet({
      host: HOST,
      port: HTTPS_PORT,
      path: '/health',
      headers: { Host: 'localhost' },
    });
    const xFrame = res.headers['x-frame-options'];
    const xContentType = res.headers['x-content-type-options'];
    const hsts = res.headers['strict-transport-security'];

    const hasSecurityHeaders =
      (xFrame?.includes('SAMEORIGIN') ?? false) &&
      (xContentType?.includes('nosniff') ?? false) &&
      !!hsts;

    recordAssertion(
      'ING-5: OWASP Bank-Grade Security Headers',
      'Nginx enforces X-Frame-Options, X-Content-Type-Options, and Strict-Transport-Security on all HTTPS ingress',
      hasSecurityHeaders,
      `X-Frame-Options: ${xFrame}, X-Content-Type-Options: ${xContentType}, HSTS: ${hsts ? 'Present' : 'Missing'}`,
    );
  } catch (err: any) {
    recordAssertion(
      'ING-5: OWASP Bank-Grade Security Headers',
      'Nginx enforces security headers',
      false,
      `Error checking security headers: ${err.message}`,
    );
  }

  // --------------------------------------------------------------------------
  // Step 6: ING-6 — Special Endpoints Ingress (Bull Board & Metrics)
  // --------------------------------------------------------------------------
  console.log(`\n--- [6/7] ING-6: Internal Observability Endpoints Ingress ---`);
  try {
    const metricsRes = await httpsGet({
      host: HOST,
      port: HTTPS_PORT,
      path: '/metrics',
      headers: { Host: 'localhost' },
    });
    // Prometheus metrics endpoint requires Basic Auth (401) or returns metrics
    const metricsRouted = metricsRes.statusCode === 401 || metricsRes.statusCode === 200;

    const queuesRes = await httpsGet({
      host: HOST,
      port: HTTPS_PORT,
      path: '/admin/queues/',
      headers: { Host: 'localhost' },
    });
    const queuesRouted = queuesRes.statusCode === 401 || queuesRes.statusCode === 200 || queuesRes.statusCode === 301 || queuesRes.statusCode === 302;

    const observabilityPassed = metricsRouted && queuesRouted;
    recordAssertion(
      'ING-6: Observability Ingress Routing',
      '/metrics and /admin/queues are reverse proxied over HTTPS to their respective handlers',
      observabilityPassed,
      `/metrics Status: ${metricsRes.statusCode}, /admin/queues Status: ${queuesRes.statusCode}`,
    );
  } catch (err: any) {
    recordAssertion(
      'ING-6: Observability Ingress Routing',
      '/metrics and /admin/queues are reverse proxied over HTTPS',
      false,
      `Error checking observability endpoints: ${err.message}`,
    );
  }

  // --------------------------------------------------------------------------
  // Step 7: ING-7 — Web BFF Isolation, Unbuffered SSE & Symmetric Cookie Clearing
  // --------------------------------------------------------------------------
  console.log(`\n--- [7/7] ING-7: HTTPS Web BFF Isolation & Unbuffered SSE ---`);
  try {
    const loginPageRes = await httpsRequest('GET', '/login');
    const loginRes = await httpsRequest('POST', '/api/auth/login', {}, {
      phone: process.env.INGRESS_TEST_PHONE || '9876543210',
      password: process.env.INGRESS_TEST_PASSWORD || 'Admin@Kumaran2026',
    });

    const setCookies = loginRes.headers['set-cookie'] || [];
    const accessCookie = setCookies.find((c) => c.startsWith('kc_access_token='));
    const cookieHeader = setCookies.map((c) => c.split(';')[0]).join('; ');
    const accessToken = accessCookie
      ? decodeURIComponent(accessCookie.split(';')[0].split('=')[1] || '')
      : '';

    const bffChitsRes = await httpsRequest('GET', '/bff/api/v1/chits?page=1&limit=20', {
      Cookie: cookieHeader,
    });
    const cookieOnlyApiRes = await httpsRequest('GET', '/api/v1/chits?page=1&limit=20', {
      Cookie: cookieHeader,
    });
    const bearerApiRes = await httpsRequest('GET', '/api/v1/chits?page=1&limit=20', {
      Authorization: `Bearer ${accessToken}`,
    });
    const sseRes = await readHttpsFirstSseEvent('/bff/api/v1/reports/approvals-stream', cookieHeader);
    const logoutRes = await httpsRequest('POST', '/api/auth/logout', {
      Cookie: cookieHeader,
    });
    const clearedCookies = logoutRes.headers['set-cookie'] || [];
    const symmetricClear = clearedCookies.some(
      (c) => c.startsWith('kc_access_token=;') && c.includes('Secure') && /SameSite=lax/i.test(c),
    );

    const passed =
      loginPageRes.statusCode === 200 &&
      loginRes.statusCode === 200 &&
      Boolean(accessToken) &&
      bffChitsRes.statusCode === 200 &&
      cookieOnlyApiRes.statusCode === 401 &&
      bearerApiRes.statusCode === 200 &&
      sseRes.statusCode === 200 &&
      sseRes.chunk.includes('APPROVALS_UPDATE') &&
      logoutRes.statusCode === 200 &&
      symmetricClear;

    recordAssertion(
      'ING-7: HTTPS Web BFF Isolation & Unbuffered SSE',
      'Nginx routes /bff/* to Next.js BFF and /api/v1/* strictly to NestJS Bearer API with unbuffered SSE and symmetric cookies',
      passed,
      `/login=${loginPageRes.statusCode}, /bff/chits=${bffChitsRes.statusCode}, cookie-only /api/v1=${cookieOnlyApiRes.statusCode}, bearer /api/v1=${bearerApiRes.statusCode}, SSE=${sseRes.statusCode} (${sseRes.chunk.includes('APPROVALS_UPDATE')}), symmetricClear=${symmetricClear}`,
    );
  } catch (err: any) {
    recordAssertion(
      'ING-7: HTTPS Web BFF Isolation & Unbuffered SSE',
      'Nginx BFF/REST isolation & SSE stream verification',
      false,
      `Error verifying BFF/SSE ingress: ${err.message}`,
    );
  }

  // --------------------------------------------------------------------------
  // Audit Report
  // --------------------------------------------------------------------------
  console.log(`\n======================================================`);
  console.log(`📋 NGINX INGRESS & REVERSE PROXY AUDIT REPORT`);
  console.log(`======================================================`);
  const allPassed = assertions.every((a) => a.passed);
  console.log(`   Overall Ingress Status: ${allPassed ? '✅ 100% PASSED (PRODUCTION GRADE)' : '❌ FAILED'}`);
  console.log(`------------------------------------------------------`);
  assertions.forEach((a) => {
    console.log(`   ${a.passed ? '✅' : '❌'} ${a.name}`);
    console.log(`      ${a.details}`);
  });
  console.log(`======================================================\n`);

  return allPassed;
}

if (require.main === module) {
  runIngressVerification().then((success) => {
    if (!success) process.exit(1);
    process.exit(0);
  }).catch((err) => {
    console.error(`\n❌ INGRESS VERIFICATION FAILED:\n`, err);
    process.exit(1);
  });
}
