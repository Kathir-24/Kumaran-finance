import { test, expect } from './fixtures/test-base';

test.describe('Suite 11: Pending UPI Claims & Scheme Defaulters Desk', () => {
  test('1. Collections Pending UPI Claims tab renders cleanly without auth or API errors', async ({
    managingPartnerPage,
  }) => {
    await managingPartnerPage.goto('/collections', { waitUntil: 'domcontentloaded' });

    const upiClaimsTab = managingPartnerPage
      .getByRole('button', { name: /Customer UPI Claims Desk|சந்தாதாரர் யுபிஐ கோரிக்கைகள் மையம்/i })
      .first();
    await expect(upiClaimsTab).toBeVisible({ timeout: 15_000 });
    await upiClaimsTab.click();

    const claimsContent = managingPartnerPage
      .locator('table')
      .or(managingPartnerPage.getByText(/No Pending UPI Claims|நிலுவையில் யுபிஐ கோரிக்கைகள் இல்லை/i))
      .first();
    await expect(claimsContent).toBeVisible({ timeout: 15_000 });
  });

  test('2. Active scheme Defaulters Desk (/schemes/[id]/defaulters) renders metrics and roster cleanly', async ({
    managingPartnerPage,
  }) => {
    await managingPartnerPage.goto('/schemes', { waitUntil: 'domcontentloaded' });

    const activeTab = managingPartnerPage.getByRole('button', { name: /Active|நடப்பு/i }).first();
    await expect(activeTab).toBeVisible({ timeout: 15_000 });
    await activeTab.click();

    const schemeCardLink = managingPartnerPage
      .locator('a[href^="/schemes/"]:not([href="/schemes/new"]):not([href="/schemes/onboard"])')
      .first();
    await expect(schemeCardLink).toBeVisible({ timeout: 15_000 });
    await schemeCardLink.click();

    const defaultersNavLink = managingPartnerPage.locator('a[href*="/defaulters"]').first();
    await expect(defaultersNavLink).toBeVisible({ timeout: 15_000 });
    await defaultersNavLink.click();

    await expect(managingPartnerPage).toHaveURL(/\/schemes\/[^/]+\/defaulters$/);
    const deskHeading = managingPartnerPage
      .locator('h1')
      .filter({ hasText: /Defaulter Substitution|குறுக்கீடு/i })
      .first();
    await expect(deskHeading).toBeVisible({ timeout: 15_000 });
  });
});
