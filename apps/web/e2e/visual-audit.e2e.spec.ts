import { test } from '@playwright/test';
import { AUTH_PERSONAS } from './fixtures/auth-personas.ts';
import { loginViaApi, injectSession } from './fixtures/auth-fixtures.ts';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Kumaran Chits — Bilingual (Tamil & English) Visual & Full-Stack Audit
 * Automatically traverses application routes across locales and viewports,
 * detects DOM overflows, unrendered i18n keys, and captures full-page visual evidence.
 */

const AUDIT_ROUTES = [
  { path: '/login', name: '01-login', authRequired: false },
  { path: '/', name: '02-dashboard', authRequired: true },
  { path: '/schemes', name: '03-schemes-list', authRequired: true },
  { path: '/schemes/new', name: '04-schemes-new', authRequired: true },
  { path: '/schemes/onboard', name: '05-schemes-onboard', authRequired: true },
  { path: '/customers', name: '06-customers-list', authRequired: true },
  { path: '/customers/new', name: '07-customers-new', authRequired: true },
  { path: '/auctions', name: '08-auctions-list', authRequired: true },
  { path: '/collections', name: '09-collections-daily', authRequired: true },
  { path: '/collections/handover', name: '10-collections-handover', authRequired: true },
  { path: '/disbursements', name: '11-disbursements-list', authRequired: true },
  { path: '/reversals', name: '12-reversals', authRequired: true },
  { path: '/reports', name: '13-reports-index', authRequired: true },
  { path: '/reports/cash-book', name: '14-reports-cash-book', authRequired: true },
  { path: '/reports/defaulters', name: '15-reports-defaulters', authRequired: true },
  { path: '/reports/ledger', name: '16-reports-ledger', authRequired: true },
  { path: '/reports/minutes', name: '17-reports-minutes', authRequired: true },
  { path: '/instructions', name: '18-instructions', authRequired: true },
  { path: '/branches', name: '19-branches', authRequired: true },
  { path: '/users', name: '20-users', authRequired: true },
  { path: '/admin/jobs', name: '21-admin-jobs', authRequired: true },
];

const LOCALES = ['en', 'ta'] as const;

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

interface VisualAnomaly {
  locale: string;
  viewport: string;
  route: string;
  issueType: 'TEXT_OVERFLOW' | 'UNTRANSLATED_KEY' | 'API_ERROR';
  details: string;
}

test.describe('Bilingual UI Automated Visual Audit', () => {
  const anomalies: VisualAnomaly[] = [];

  for (const locale of LOCALES) {
    for (const vp of VIEWPORTS) {
      test(`Audit Locale: [${locale}] | Viewport: [${vp.name}]`, async ({ browser, request }) => {
        test.setTimeout(240_000);
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
        });

        // Set locale cookie explicitly
        await context.addCookies([
          {
            name: 'NEXT_LOCALE',
            value: locale,
            domain: 'localhost',
            path: '/',
          },
        ]);

        const page = await context.newPage();

        // Track API failure responses
        const networkErrors: string[] = [];
        page.on('response', (res) => {
          if (res.status() >= 400 && !res.url().includes('favicon') && !res.url().includes('login')) {
            networkErrors.push(`${res.status()} ${res.request().method()} ${res.url()}`);
          }
        });

        // Acquire session once for authenticated routes
        let authSession: any = null;
        try {
          authSession = await loginViaApi(request, AUTH_PERSONAS.SUPER_ADMIN_MANAGING);
        } catch (err: any) {
          console.warn(`[VisualAudit] API login warning: ${err.message}`);
        }

        const outDir = path.join(process.cwd(), 'visual-audit-results', locale, vp.name);
        fs.mkdirSync(outDir, { recursive: true });

        for (const route of AUDIT_ROUTES) {
          if (route.authRequired && authSession) {
            await page.addInitScript(
              ({ accessToken, refreshToken }) => {
                window.localStorage.setItem('kc_access_token', accessToken);
                if (refreshToken) {
                  window.localStorage.setItem('kc_refresh_token', refreshToken);
                }
              },
              {
                accessToken: authSession.accessToken,
                refreshToken: authSession.refreshToken || '',
              },
            );
          } else if (!route.authRequired) {
            await page.addInitScript(() => {
              window.localStorage.removeItem('kc_access_token');
              window.localStorage.removeItem('kc_refresh_token');
            });
          }

          try {
            await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 15_000 });
            await page.waitForTimeout(600); // Allow fonts, hydration, and layout transitions

            // 1. Detect Text Clipping & Container Overflows
            const overflowItems = await page.evaluate(() => {
              const clipped: string[] = [];
              const candidates = document.querySelectorAll(
                'button, a, th, td, h1, h2, h3, h4, p, span, [role="button"], .badge'
              );

              candidates.forEach((el) => {
                const htmlEl = el as HTMLElement;
                const style = window.getComputedStyle(htmlEl);
                if (
                  htmlEl.scrollWidth > htmlEl.clientWidth + 2 &&
                  style.overflowX === 'hidden' &&
                  htmlEl.offsetParent !== null &&
                  !htmlEl.hasAttribute('title')
                ) {
                  const text = (htmlEl.innerText || '').trim();
                  if (text && text.length > 0 && text.length < 120) {
                    clipped.push(
                      `<${htmlEl.tagName.toLowerCase()}> "${text.substring(0, 35)}..." (${htmlEl.scrollWidth}px > ${htmlEl.clientWidth}px)`
                    );
                    htmlEl.style.outline = '2px dashed #ef4444';
                  }
                }
              });
              return clipped;
            });

            if (overflowItems.length > 0) {
              anomalies.push({
                locale,
                viewport: vp.name,
                route: route.path,
                issueType: 'TEXT_OVERFLOW',
                details: overflowItems.join(' | '),
              });
            }

            // 2. Detect Untranslated Keys & Leaked Tokens
            const leakedKeys = await page.evaluate(() => {
              const bodyText = document.body.innerText || '';
              const matches: string[] = [];
              const pattern = /\b(common|nav|schemes|customers|auctions|disbursements|collections|reports|reversals|sidebar)\.[a-zA-Z0-9_.-]+\b/g;
              const found = bodyText.match(pattern);
              if (found) {
                matches.push(...found);
              }
              if (bodyText.includes('missing "') || bodyText.includes('[missing')) {
                matches.push('next-intl missing message warning in DOM');
              }
              return Array.from(new Set(matches));
            });

            if (leakedKeys.length > 0) {
              anomalies.push({
                locale,
                viewport: vp.name,
                route: route.path,
                issueType: 'UNTRANSLATED_KEY',
                details: leakedKeys.join(', '),
              });
            }

            // 3. Capture Full-Page Screenshot
            const screenshotFile = path.join(outDir, `${route.name}.png`);
            await page.screenshot({ path: screenshotFile, fullPage: true });
          } catch (navErr: any) {
            console.warn(`[VisualAudit] Skipping ${route.path} on error: ${navErr.message}`);
          }
        }

        // Check if network errors were logged during crawl
        if (networkErrors.length > 0) {
          anomalies.push({
            locale,
            viewport: vp.name,
            route: 'ALL_ROUTES',
            issueType: 'API_ERROR',
            details: networkErrors.slice(0, 5).join(' | '),
          });
        }

        await context.close();
      });
    }
  }

  test.afterAll(async () => {
    const reportDir = path.join(process.cwd(), 'visual-audit-results');
    fs.mkdirSync(reportDir, { recursive: true });
    const summaryFile = path.join(reportDir, 'audit-summary.json');
    fs.writeFileSync(summaryFile, JSON.stringify(anomalies, null, 2), 'utf8');
    console.log(`\n======================================================`);
    console.log(`[VisualAudit] Completed crawl! Total anomalies detected: ${anomalies.length}`);
    console.log(`[VisualAudit] Summary report: ${summaryFile}`);
    console.log(`======================================================\n`);
  });
});
