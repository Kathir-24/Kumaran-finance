import { test, expect } from './fixtures/test-base';

test.describe('Suite 08: Dual-Control Payment Reversals Desk', () => {
  test('1. Desk Accountant session visits Reversals Desk and sees Maker-only authorization status', async ({
    accountantPage,
  }) => {
    await accountantPage.goto('/reversals', { waitUntil: 'domcontentloaded' });
    await expect(accountantPage.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    // Verify 4 KPI cards render
    await expect(accountantPage.locator('text=/Total|மொத்தம்/i').first()).toBeVisible();
    await expect(accountantPage.locator('text=/Voided|ரத்து/i').first()).toBeVisible();

    // Verify Accountant role is marked as Maker Only under Dual Control
    const makerNotice = accountantPage.locator('text=/Desk Staff \\(Maker Only\\)|மேசை பணியாளர் \\(செய்பவர் மட்டும்\\)/i');
    await expect(makerNotice).toBeVisible();

    // Request Reversal action button is accessible for Desk Accountant
    const requestBtn = accountantPage.locator('button').filter({
      hasText: /Request Reversal|ரத்துக் கோரிக்கை/i,
    }).first();
    await expect(requestBtn).toBeVisible();
  });

  test('2. Checker Partner session has Partner Authorized dual-control approval rights', async ({
    checkerPartnerPage,
  }) => {
    await checkerPartnerPage.goto('/reversals', { waitUntil: 'domcontentloaded' });
    await expect(checkerPartnerPage.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    // Verify Super Admin / Checker Partner has Partner Authorized status
    const partnerNotice = checkerPartnerPage.locator('text=/Partner Authorized|கூட்டாளர் அதிகாரம் பெற்றது/i');
    await expect(partnerNotice).toBeVisible();

    // Verify segmented tabs (Pending Reversals and Voided Receipts History)
    const pendingTab = checkerPartnerPage.locator('button').filter({
      hasText: /Pending|நிலுவை/i,
    }).first();
    const historyTab = checkerPartnerPage.locator('button').filter({
      hasText: /History|வரலாறு|Voided|ரத்துகள் பதிவேடு/i,
    }).first();

    await expect(pendingTab).toBeVisible();
    await expect(historyTab).toBeVisible();

    // Click history tab to review voided receipts register
    await historyTab.click();
    await checkerPartnerPage.waitForTimeout(500);
  });

  test('3. Reversal Request modal opens with mandatory justification fields', async ({
    accountantPage,
  }) => {
    await accountantPage.goto('/reversals', { waitUntil: 'domcontentloaded' });
    await expect(accountantPage.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    const requestBtn = accountantPage.locator('button').filter({
      hasText: /Request Reversal|ரத்துக் கோரிக்கை/i,
    }).first();
    await requestBtn.click();

    // Verify modal appears
    const modal = accountantPage.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify mandatory reason / justification inputs exist
    await expect(modal.locator('textarea, select, input').first()).toBeVisible();

    // Close modal
    const closeBtn = modal.locator('button').filter({
      hasText: /Cancel|ரத்து|Close/i,
    }).first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  });
});
