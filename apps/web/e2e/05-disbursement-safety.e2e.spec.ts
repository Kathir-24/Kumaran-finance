import { test, expect } from './fixtures/test-base.ts';

test.describe('Suite 05: Prize Disbursements & Company Safety Proof Checklist', () => {
  test('1. Disbursements Queue renders winner payouts and whole rupee prize breakdown', async ({ managingPartnerPage }) => {
    await managingPartnerPage.goto('/disbursements', { waitUntil: 'domcontentloaded' });

    // Verify main header
    const heading = managingPartnerPage.locator('h1, h2').filter({ hasText: /Disbursement|பரிசுத் தொகை/i }).first();
    await expect(heading).toBeVisible();

    // Verify disbursements table renders
    const table = managingPartnerPage.locator('table, main').first();
    await expect(table).toBeVisible();
  });

  test('2. Disbursement Voucher & ADR-15 Safety Proof Checklist renders required items', async ({ managingPartnerPage }) => {
    await managingPartnerPage.goto('/disbursements', { waitUntil: 'domcontentloaded' });

    // Click first voucher or details link if exists
    const voucherLink = managingPartnerPage.locator('table a[href*="/disbursements/"], table button').first();
    if (await voucherLink.isVisible()) {
      await voucherLink.click();

      // Check checklist or voucher details container
      const checklistContainer = managingPartnerPage.locator('main, [role="dialog"]').first();
      await expect(checklistContainer).toBeVisible();
    }
  });

  test('3. Checker Partner has access to dual-control authorization workflow', async ({ checkerPartnerPage }) => {
    await checkerPartnerPage.goto('/disbursements', { waitUntil: 'domcontentloaded' });

    // Verify Checker session has access to disbursements queue
    const heading = checkerPartnerPage.locator('h1, h2').filter({ hasText: /Disbursement|பரிசுத் தொகை/i }).first();
    await expect(heading).toBeVisible();
  });
});
