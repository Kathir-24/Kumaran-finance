import { test as base, expect, type Page } from '@playwright/test';
import { AUTH_PERSONAS, type PersonaConfig } from './auth-personas.ts';
import { loginViaApi, injectSession } from './auth-fixtures.ts';

export interface CustomFixtures {
  managingPartnerPage: Page;
  checkerPartnerPage: Page;
  branchManagerPage: Page;
  accountantPage: Page;
  agentPage: Page;
  auditorPage: Page;
  createAuthenticatedPage: (persona: PersonaConfig, targetPath?: string) => Promise<Page>;
}

/**
 * Extended Playwright Test Fixture with pre-authenticated personas.
 * Eliminates repetitive login scripts and ensures 100% deterministic test execution.
 */
export const test = base.extend<CustomFixtures>({
  createAuthenticatedPage: async ({ browser, request }, use) => {
    const contextsToClose: any[] = [];

    await use(async (persona: PersonaConfig, targetPath: string = '/') => {
      const context = await browser.newContext();
      contextsToClose.push(context);
      const page = await context.newPage();
      const session = await loginViaApi(request, persona);
      await injectSession(page, session, targetPath);
      return page;
    });

    for (const ctx of contextsToClose) {
      await ctx.close();
    }
  },

  managingPartnerPage: async ({ createAuthenticatedPage }, use) => {
    const page = await createAuthenticatedPage(AUTH_PERSONAS.SUPER_ADMIN_MANAGING);
    await use(page);
  },

  checkerPartnerPage: async ({ createAuthenticatedPage }, use) => {
    const page = await createAuthenticatedPage(AUTH_PERSONAS.SUPER_ADMIN_CHECKER);
    await use(page);
  },

  branchManagerPage: async ({ createAuthenticatedPage }, use) => {
    const page = await createAuthenticatedPage(AUTH_PERSONAS.BRANCH_MANAGER);
    await use(page);
  },

  accountantPage: async ({ createAuthenticatedPage }, use) => {
    const page = await createAuthenticatedPage(AUTH_PERSONAS.ACCOUNTANT);
    await use(page);
  },

  agentPage: async ({ createAuthenticatedPage }, use) => {
    const page = await createAuthenticatedPage(AUTH_PERSONAS.COLLECTION_AGENT);
    await use(page);
  },

  auditorPage: async ({ createAuthenticatedPage }, use) => {
    const page = await createAuthenticatedPage(AUTH_PERSONAS.AUDITOR);
    await use(page);
  },
});

export { expect };
