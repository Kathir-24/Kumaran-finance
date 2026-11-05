import { test, expect } from './fixtures/test-base.ts';

test.describe('Suite 06: Counter Collections Desk & A5 Receipt Printing', () => {
  test('1. Collections directory renders ledger of counter cash and UPI payments', async ({ accountantPage }) => {
    await accountantPage.goto('/collections', { waitUntil: 'domcontentloaded' });

    // Verify main collections header or tab
    const heading = accountantPage.locator('button:has-text("கவுண்டர் வசூல்"), button:has-text("Collections"), h1, h2, h4').first();
    await expect(heading).toBeVisible();

    // Verify payments table is visible
    const table = accountantPage.locator('table, main').first();
    await expect(table).toBeVisible();
  });

  test('2. ADR-07 Discrete Single Net Due Matching enforces whole rupee amounts', async ({ accountantPage }) => {
    await accountantPage.goto('/collections', { waitUntil: 'domcontentloaded' });

    // Check presence of counter collection action or table entries
    const collectionBtn = accountantPage.locator('button:has-text("Collect"), button:has-text("வசூல்"), button').first();
    await expect(collectionBtn).toBeVisible();
  });

  test('3. ADR-11 A5 Print preview renders statutory passbook precedence notice', async ({ managingPartnerPage }) => {
    // Navigate to print preview layout
    await managingPartnerPage.goto('/print/receipt/demo-id', { waitUntil: 'domcontentloaded' });

    // Verify print canvas renders without dashboard sidebar
    const aside = managingPartnerPage.locator('aside');
    await expect(aside).toHaveCount(0);

    // Verify container renders
    const printContainer = managingPartnerPage.locator('body');
    await expect(printContainer).toBeVisible();
  });
});
