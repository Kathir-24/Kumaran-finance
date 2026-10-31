export const routing = {
  locales: ['ta', 'en'] as const,
  defaultLocale: 'ta' as const,
};

export type Locale = (typeof routing.locales)[number];
