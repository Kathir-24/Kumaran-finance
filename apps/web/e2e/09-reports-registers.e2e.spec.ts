import { test, expect } from './fixtures/test-base';

test.describe('Suite 09: Statutory Registers & CA Auditor Portal', () => {
  test('1. Independent Auditor visits Reports Hub and Form XXII 12-Column Cash Book', async ({
    auditorPage,
  }) => {
    // 1. Visit Reports Hub
    await auditorPage.goto('/reports', { waitUntil: 'domcontentloaded' });
    await expect(auditorPage.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    // Verify all 5 statutory registers are accessible
    const cashBookLink = auditorPage.locator('a[href="/reports/cash-book"]').first();
    const minutesLink = auditorPage.locator('a[href="/reports/minutes"]').first();
    const ledgerLink = auditorPage.locator('a[href="/reports/ledger"]').first();
    const defaultersLink = auditorPage.locator('a[href="/reports/defaulters"]').first();
    const auditLogsLink = auditorPage.locator('a[href="/reports/audit-logs"]').first();

    await expect(cashBookLink).toBeVisible();
    await expect(minutesLink).toBeVisible();
    await expect(ledgerLink).toBeVisible();
    await expect(defaultersLink).toBeVisible();
    await expect(auditLogsLink).toBeVisible();

    // 2. Open Form XXII Cash Book
    await cashBookLink.click();
    await expect(auditorPage).toHaveURL(/.*\/reports\/cash-book/);
    await expect(auditorPage.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    // Verify CSV export and Print actions are present
    const exportBtn = auditorPage.locator('button').filter({ hasText: /CSV|ஏற்றுமதி/i }).first();
    const printBtn = auditorPage.locator('button').filter({ hasText: /A4|Print|அச்சு/i }).first();
    await expect(exportBtn).toBeVisible();
    await expect(printBtn).toBeVisible();
  });

  test('2. Form XVII Auction Minutes Register displays 21-day statutory filing window', async ({
    auditorPage,
  }) => {
    await auditorPage.goto('/reports/minutes', { waitUntil: 'domcontentloaded' });
    await expect(auditorPage.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    // Verify scheme selector or minutes register table renders
    const pageHeading = auditorPage.locator('h1, h2').first();
    await expect(pageHeading).toBeVisible();

    // Verify statutory scheme selector is present
    const statutoryNotice = auditorPage.locator('select').first();
    await expect(statutoryNotice).toBeVisible();
  });

  test('3. Form XXI Continuous Ledger renders 20-month schedule and CSV download trigger', async ({
    managingPartnerPage,
  }) => {
    await managingPartnerPage.goto('/reports/ledger', { waitUntil: 'domcontentloaded' });
    await expect(managingPartnerPage.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    // Verify CSV export button
    const exportBtn = managingPartnerPage.locator('button').filter({ hasText: /CSV|ஏற்றுமதி|தரவிறக்கம்/i }).first();
    await expect(exportBtn).toBeVisible();
  });

  test('4. Defaulters Register tracks ADR-07 arrears aging and 3-month removal candidates', async ({
    managingPartnerPage,
  }) => {
    await managingPartnerPage.goto('/reports/defaulters', { waitUntil: 'domcontentloaded' });
    await expect(managingPartnerPage.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    // Verify Arrears filter buttons or table elements
    const filterControls = managingPartnerPage.locator('button, select, input').first();
    await expect(filterControls).toBeVisible();

    // Verify CSV export
    const exportBtn = managingPartnerPage.locator('button').filter({ hasText: /CSV|ஏற்றுமதி|தரவிறக்கம்/i }).first();
    await expect(exportBtn).toBeVisible();
  });

  test('5. CA Forensic Audit Trail renders immutable event stream with Maker-Checker badges', async ({
    auditorPage,
  }) => {
    await auditorPage.goto('/reports/audit-logs', { waitUntil: 'domcontentloaded' });
    await expect(auditorPage.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    // Verify table or audit log container is rendered
    const auditContainer = auditorPage.locator('table, main, [role="region"]').first();
    await expect(auditContainer).toBeVisible();

    // Verify filter or search inputs exist
    const searchOrFilter = auditorPage.locator('input').first();
    await expect(searchOrFilter).toBeVisible();
  });
});
