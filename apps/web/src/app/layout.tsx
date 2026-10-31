import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { fontInter, fontTamil } from '@/lib/fonts';
import { QueryProvider } from '@/providers/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kumaran Chits — Kumaran Finance (Perundurai)',
  description: 'Official chit-fund operations platform for Kumaran Finance, Perundurai, Tamil Nadu',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${fontInter.variable} ${fontTamil.variable}`}>
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <QueryProvider>
            {children}
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
