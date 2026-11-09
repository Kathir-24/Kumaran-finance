'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useApprovalsStream } from '@/hooks/use-approvals-stream';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  // Guard: If client has confirmed unauthenticated state, prevent content flash while redirecting
  if (isHydrated && !isAuthenticated) {
    return null;
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
