import { Inter, Noto_Sans_Tamil } from 'next/font/google';

export const fontInter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
});

export const fontTamil = Noto_Sans_Tamil({
  subsets: ['tamil'],
  variable: '--font-tamil',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  fallback: ['sans-serif'],
});
