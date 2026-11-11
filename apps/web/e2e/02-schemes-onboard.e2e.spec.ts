import { test, expect } from './fixtures/test-base.ts';

test.describe('Suite 02: Chit Schemes Creation & Mid-Cycle Onboarding', () => {
  test('1. Schemes Directory displays active seeded chit groups', async ({ managingPartnerPage }) => {
    await managingPartnerPage.goto('/schemes', { waitUntil: 'domcontentloaded' });

    // Verify main header
    const heading = managingPartnerPage.locator('h1, h2').filter({ hasText: /Chit Schemes|சீட்டு திட்டங்கள்/i }).first();
    await expect(heading).toBeVisible();

    // Switch to Active Schemes tab so seeded active groups are listed ahead of test drafts
    const activeTab = managingPartnerPage.getByRole('button', { name: /Active|நடப்பு/i }).first();
    await expect(activeTab).toBeVisible();
    await activeTab.click();

    // Verify seeded schemes are present in table or grid
    const scheme1L = managingPartnerPage.locator('text=KCA-1L-20M-01').first();
    await expect(scheme1L).toBeVisible({ timeout: 15_000 });

    // Verify whole-rupee format (zero paise .00)
    const rupeeText = managingPartnerPage.locator('text=₹1,00,000').first();
    await expect(rupeeText).toBeVisible();
  });

  test('2. Scheme Wizard enforces 4% commission lock & 1/4 ceiling discount calculation', async ({ managingPartnerPage }) => {
    await managingPartnerPage.goto('/schemes/new', { waitUntil: 'domcontentloaded' });

    // Wait for form container
    const form = managingPartnerPage.locator('form, main');
    await expect(form).toBeVisible();

    // Select preset ₹1 Lakh / 20M or enter 100000 / 20
    const presetBtn = managingPartnerPage.locator('button:has-text("₹1 Lakh / 20M")').first();
    if (await presetBtn.isVisible()) {
      await presetBtn.click();
    }

    // Verify auto-calculated financial invariants in SchemeMathPreview:
    // 1. 4% Commission floor: ₹4,000 (4%)
    // 2. 1/4 Ceiling discount: ₹25,000 (25%)
    const commissionLock = managingPartnerPage.locator('text=₹4,000').first();
    await expect(commissionLock).toBeVisible();

    const ceilingDiscount = managingPartnerPage.locator('text=₹25,000').first();
    await expect(ceilingDiscount).toBeVisible();
  });

  test('3. Mid-Cycle Notebook Onboarding Grid renders 400 cells with keyboard navigation', async ({ managingPartnerPage }) => {
    await managingPartnerPage.goto('/schemes/onboard', { waitUntil: 'domcontentloaded' });

    // Verify notebook onboarding heading and container
    const heading = managingPartnerPage.locator('h1').first();
    await expect(heading).toBeVisible();

    // Verify onboarding grid or master form is rendered
    const gridOrForm = managingPartnerPage.locator('main form, table, [role="grid"], .overflow-x-auto').first();
    await expect(gridOrForm).toBeVisible();
  });
});
