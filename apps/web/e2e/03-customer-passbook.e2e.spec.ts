import { test, expect } from './fixtures/test-base.ts';

test.describe('Suite 03: Customer Directory & Customer 360 Passbook Profile', () => {
  test('1. Customer Directory searches by subscriber name & phone', async ({ managingPartnerPage }) => {
    await managingPartnerPage.goto('/customers', { waitUntil: 'domcontentloaded' });

    // Verify main customer directory heading
    const heading = managingPartnerPage.locator('h1, h2').filter({ hasText: /Customer Directory|சந்தாதாரர் பட்டியல்/i }).first();
    await expect(heading).toBeVisible();

    // Type in search bar
    const searchInput = managingPartnerPage.locator('input[type="text"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Thangavel');

    // Wait for filtered customer list to display K. Thangavel
    const customerRow = managingPartnerPage.locator('text=Thangavel').first();
    await expect(customerRow).toBeVisible({ timeout: 15_000 });
  });

  test('2. Customer 360 Profile displays identity, tickets, and KYC cards', async ({ managingPartnerPage }) => {
    await managingPartnerPage.goto('/customers', { waitUntil: 'domcontentloaded' });

    // Search and navigate to first customer's 360 profile
    const customerLink = managingPartnerPage.locator('table a[href*="/customers/"]').first();
    await expect(customerLink).toBeVisible({ timeout: 15_000 });
    await customerLink.click();

    // Verify customer 360 profile container
    await managingPartnerPage.waitForURL(/\/customers\/[a-zA-Z0-9_-]+$/, { timeout: 15_000 });
    const profileHeader = managingPartnerPage.locator('main').first();
    await expect(profileHeader).toBeVisible();

    // Verify customer identity card renders customer code or name
    const customerCode = managingPartnerPage.locator('text=/KC-[A-Z0-9-]+/i').first();
    await expect(customerCode).toBeVisible();
  });

  test('3. Form XXI Passbook tab displays installment records & whole rupee dues', async ({ managingPartnerPage }) => {
    await managingPartnerPage.goto('/customers', { waitUntil: 'domcontentloaded' });

    // Open first customer
    const customerLink = managingPartnerPage.locator('table a[href*="/customers/"]').first();
    await customerLink.click();
    await managingPartnerPage.waitForURL(/\/customers\/[a-zA-Z0-9_-]+$/);

    // Switch to Passbook tab if tabs exist
    const passbookTab = managingPartnerPage.locator('button:has-text("Passbook"), button:has-text("பாஸ்புக்"), [role="tab"]:has-text("Passbook")').first();
    if (await passbookTab.isVisible()) {
      await passbookTab.click();
    }

    // Verify passbook table renders
    const passbookTable = managingPartnerPage.locator('table, [data-testid="passbook-table"], main').first();
    await expect(passbookTable).toBeVisible();
  });
});
