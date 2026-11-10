'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useApprovalsStream } from '@/hooks/use-approvals-stream';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MAIN_NAV_ITEMS } from '@/components/layout/nav-items';
import { AccessDeniedView } from '@/components/security/access-denied-view';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
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

  // FOUC Prevention Guard: While verifying session, render minimal clean skeleton
  if (!isHydrated || isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-800 border-t-emerald-500" />
          <p className="text-xs font-medium text-slate-500 animate-pulse">
            Verifying staff credentials...
          </p>
        </div>
      </div>
    );
  }

  // Guard: If client has confirmed unauthenticated state, prevent content flash while redirecting
  if (isHydrated && !isAuthenticated) {
    return null;
  }

  // Match current route against navigation permissions (longest matching path first)
  const userRoles = user?.roles || [];
  const matchedRoute = (() => {
    const sorted = [...MAIN_NAV_ITEMS].sort((a, b) => b.href.length - a.href.length);
    return sorted.find((item) =>
      item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
    );
  })();

  const isRoleAuthorized = !matchedRoute || matchedRoute.allowedRoles.some((role) => userRoles.includes(role));

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

        {/* Dynamic Route Content with Active RBAC Barrier */}
        <main className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {isRoleAuthorized ? (
              children
            ) : (
              <AccessDeniedView
                requiredRoles={matchedRoute.allowedRoles}
                userRoles={userRoles}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
