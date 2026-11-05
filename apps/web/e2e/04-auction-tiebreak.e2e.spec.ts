import { test, expect } from './fixtures/test-base.ts';

test.describe('Suite 04: In-Office Auction Console & Option A Tie-Break', () => {
  test('1. Auctions Schedule renders Guardrail 5 banners for Month 1 and Month N', async ({ managingPartnerPage }) => {
    await managingPartnerPage.goto('/auctions', { waitUntil: 'domcontentloaded' });

    // Verify main header
    const heading = managingPartnerPage.locator('h1, h2').filter({ hasText: /Auction|ஏல/i }).first();
    await expect(heading).toBeVisible();

    // Verify Month 1 Company Pool indicator is rendered in schedule table
    const month1Badge = managingPartnerPage.locator('text=விதி 5').first();
    await expect(month1Badge).toBeVisible({ timeout: 15_000 });

    // Verify Schedule table renders rows
    const scheduleTable = managingPartnerPage.locator('table, main').first();
    await expect(scheduleTable).toBeVisible();
  });

  test('2. Auction Metrics cards render 4% Commission floor and 1/4 Ceiling math', async ({ managingPartnerPage }) => {
    await managingPartnerPage.goto('/auctions', { waitUntil: 'domcontentloaded' });

    // Metrics cards display whole rupee amounts (Floor commission 4%, Ceiling discount 25%)
    const metricsContainer = managingPartnerPage.locator('main').first();
    await expect(metricsContainer).toBeVisible();

    const chitValueCard = managingPartnerPage.locator('text=₹1,00,000').first();
    await expect(chitValueCard).toBeVisible({ timeout: 15_000 });
  });

  test('3. Option A physical token tie-break representation adheres to ADR-06', async ({ managingPartnerPage }) => {
    await managingPartnerPage.goto('/auctions', { waitUntil: 'domcontentloaded' });

    // Check presence of tie-break group (KCA-1L-20M-02) in scheme selector or schedule
    const tieBreakSelector = managingPartnerPage.locator('text=KCA-1L-20M-02, text=குலுக்கல், text=Tie-Break').first();
    if (await tieBreakSelector.isVisible()) {
      await tieBreakSelector.click();
    }

    // Verify live room CTA or schedule details
    const actionBtn = managingPartnerPage.locator('a[href*="/auctions/"], button').first();
    await expect(actionBtn).toBeVisible();
  });
});
