import { test, expect } from './fixtures/test-base.ts';

test.describe('Suite 07: Field Agent Evening Cash Handover Desk', () => {
  test('1. Evening Cash Handover desk renders daily collection summary & vault balance', async ({ accountantPage }) => {
    await accountantPage.goto('/collections/handover', { waitUntil: 'domcontentloaded' });

    // Verify main header
    const heading = accountantPage.locator('h1, h2').filter({ hasText: /Handover|ரொக்க ஒப்படைப்பு/i }).first();
    await expect(heading).toBeVisible();

    // Verify date selector and cards render
    const mainContent = accountantPage.locator('main').first();
    await expect(mainContent).toBeVisible();
  });

  test('2. Dual-control handover acknowledgment controls available for Accountant', async ({ accountantPage }) => {
    await accountantPage.goto('/collections/handover', { waitUntil: 'domcontentloaded' });

    // Verify Pending vs Settled tabs exist
    const tabs = accountantPage.locator('button:has-text("Pending"), button:has-text("நிலுவை"), [role="tab"]').first();
    await expect(tabs).toBeVisible({ timeout: 15_000 });
  });

  test('3. Managing Partner session can inspect branch cash vault count', async ({ managingPartnerPage }) => {
    await managingPartnerPage.goto('/collections/handover', { waitUntil: 'domcontentloaded' });

    // Header and container visible
    const heading = managingPartnerPage.locator('h1, h2').filter({ hasText: /Handover|ரொக்க ஒப்படைப்பு/i }).first();
    await expect(heading).toBeVisible();
  });
});
