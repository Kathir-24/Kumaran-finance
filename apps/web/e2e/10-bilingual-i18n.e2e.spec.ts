import { test, expect } from './fixtures/test-base';

test.describe('Suite 10: Bilingual Localization & Typography', () => {
  test('1. Topbar Locale Switcher toggles between தமிழ் and English', async ({
    managingPartnerPage,
  }) => {
    await managingPartnerPage.goto('/', { waitUntil: 'domcontentloaded' });
    const switcher = managingPartnerPage.locator('[data-testid="locale-switcher"]').first();
    await expect(switcher).toBeVisible({ timeout: 10000 });

    const initialText = (await switcher.textContent())?.trim() || '';

    // Click switcher to toggle locale
    await switcher.click();
    await managingPartnerPage.waitForTimeout(1000);

    // Verify button text changes to opposite language label
    const newText = (await switcher.textContent())?.trim() || '';
    expect(newText).not.toBe(initialText);
  });

  test('2. Tamil mode renders authentic Tamil terminology across navigation and headers', async ({
    managingPartnerPage,
  }) => {
    await managingPartnerPage.goto('/', { waitUntil: 'domcontentloaded' });
    const switcher = managingPartnerPage.locator('[data-testid="locale-switcher"]').first();
    await expect(switcher).toBeVisible({ timeout: 10000 });

    const currentButtonText = (await switcher.textContent())?.trim() || '';
    // If the button says 'தமிழ்', clicking it switches the app into Tamil mode
    if (currentButtonText.includes('தமிழ்')) {
      await switcher.click();
      await managingPartnerPage.waitForTimeout(1000);
    }

    // Verify navigation renders authentic Tamil terms
    const nav = managingPartnerPage.locator('nav').first();
    await expect(nav).toBeVisible();

    const tamilNavLinks = managingPartnerPage.locator('nav a');
    const tamilNavContent = await tamilNavLinks.allTextContents();
    const combinedText = tamilNavContent.join(' ');

    // Must contain authentic Tamil chit terms
    expect(
      combinedText.includes('சீட்டு') ||
      combinedText.includes('சந்தாதாரர்') ||
      combinedText.includes('வசூல்') ||
      combinedText.includes('முகப்பு')
    ).toBe(true);
  });

  test('3. Zero unrendered translation keys appear in DOM', async ({
    managingPartnerPage,
  }) => {
    await managingPartnerPage.goto('/schemes', { waitUntil: 'domcontentloaded' });
    await expect(managingPartnerPage.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    // Inspect visible text on page to ensure zero raw translation token leaks
    const pageText = await managingPartnerPage.locator('body').innerText();

    expect(pageText).not.toContain('missing "');
    expect(pageText).not.toContain('[missing');
    expect(pageText).not.toContain('undefined');
  });

  test('4. Switching back to English restores English navigation and typography', async ({
    managingPartnerPage,
  }) => {
    await managingPartnerPage.goto('/', { waitUntil: 'domcontentloaded' });
    const switcher = managingPartnerPage.locator('[data-testid="locale-switcher"]').first();
    await expect(switcher).toBeVisible({ timeout: 10000 });

    const currentButtonText = (await switcher.textContent())?.trim() || '';
    // If the button says 'English', clicking it switches the app into English mode
    if (currentButtonText.includes('English')) {
      await switcher.click();
      await managingPartnerPage.waitForTimeout(1000);
    }

    // Verify button now offers Tamil toggle
    await expect(switcher).toContainText('தமிழ்');

    // Verify navigation links render in English
    const nav = managingPartnerPage.locator('nav').first();
    await expect(nav).toBeVisible();

    const navLinks = managingPartnerPage.locator('nav a');
    const navText = (await navLinks.allTextContents()).join(' ');

    expect(
      navText.includes('Chit') ||
      navText.includes('Customers') ||
      navText.includes('Collections') ||
      navText.includes('Dashboard')
    ).toBe(true);
  });
});
