'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { useApprovalsStream } from '@/hooks/use-approvals-stream';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { Coins, Loader2 } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations('common');
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);

  // Layout presentation state
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Initialize Server-Sent Events stream for real-time approvals
  useApprovalsStream();

  // Hydrate session on initial mount
  React.useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Auth redirect guard: Strictly evaluate after initial hydration is complete
  React.useEffect(() => {
    if (isHydrated && !isLoading && !isAuthenticated) {
      router.replace('/login?reason=unauthenticated');
    }
  }, [isHydrated, isLoading, isAuthenticated, router]);

  // Loading skeleton while validating session
  if (!isHydrated || isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-950 text-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 animate-pulse">
            <Coins className="h-7 w-7" />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
            <span>{t('workspaceInitializing')}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-slate-950 text-slate-100 antialiased">
      {/* Dynamic RBAC Sidebar */}
      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar Header */}
        <Topbar onMobileMenuToggle={() => setMobileOpen(true)} />

        {/* Dynamic Route Content */}
        <main className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
