import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { fontInter, fontTamil } from '@/lib/fonts';
import { QueryProvider } from '@/providers/query-provider';
import { SessionInactivityGuard } from '@/components/security/session-inactivity-guard';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kumaran Chits — Kumaran Finance (Perundurai)',
  description: 'Official chit-fund operations platform for Kumaran Finance, Perundurai, Tamil Nadu',
  other: {
    google: 'notranslate',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${fontInter.variable} ${fontTamil.variable}`}
      translate="no"
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased" suppressHydrationWarning>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <QueryProvider>
            <SessionInactivityGuard />
            {children}
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
