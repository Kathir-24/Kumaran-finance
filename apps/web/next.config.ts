import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Use standalone output in CI/Docker environments; default to standard build on Windows host to prevent EPERM symlink restrictions
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-tabs',
      '@radix-ui/react-slot',
      '@radix-ui/react-label',
    ],
  },
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
