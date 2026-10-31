'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Coins,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useApprovalsStore } from '@/stores/approvals-store';
import { MAIN_NAV_ITEMS, filterNavItemsByRoles, type NavItem } from './nav-items';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({
  isCollapsed,
  onToggleCollapse,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const tNav = useTranslations('nav');
  const tSidebar = useTranslations('sidebar');
  const tCommon = useTranslations('common');

  const user = useAuthStore((s) => s.user);
  const userRoles = user?.roles || [];

  const cashHandoversCount = useApprovalsStore((s) => s.cashHandoversCount);
  const disbursementAuthorizationsCount = useApprovalsStore(
    (s) => s.disbursementAuthorizationsCount
  );
  const paymentReversalsCount = useApprovalsStore((s) => s.paymentReversalsCount);

  // Filter items matching current staff user's roles
  const allowedNavItems = React.useMemo(() => {
    return filterNavItemsByRoles(MAIN_NAV_ITEMS, userRoles);
  }, [userRoles]);

  const getBadgeCount = (badgeKey?: NavItem['badgeKey']) => {
    if (!badgeKey) return 0;
    if (badgeKey === 'cashHandovers') return cashHandoversCount;
    if (badgeKey === 'disbursements') return disbursementAuthorizationsCount;
    if (badgeKey === 'reversals') return paymentReversalsCount;
    return 0;
  };

  const isItemActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const renderNavContent = () => (
    <div className="flex h-full flex-col justify-between bg-slate-950 border-r border-slate-800 text-slate-200">
      {/* Top Header / Branding */}
      <div>
        <div
          className={cn(
            'flex h-16 items-center border-b border-slate-800/80 px-4 transition-all duration-200',
            isCollapsed ? 'justify-center px-2' : 'justify-between'
          )}
        >
          <Link
            href="/"
            className="flex items-center gap-3 focus:outline-none"
            onClick={onMobileClose}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-sm">
              <Coins className="h-5 w-5" />
            </div>

            {!isCollapsed && (
              <div className="flex flex-col overflow-hidden">
                <span className="font-bold text-base tracking-tight text-white leading-tight truncate">
                  குமரன் சிட்ஸ்
                </span>
                <span className="text-[11px] font-medium text-emerald-400 tracking-wider uppercase">
                  Kumaran Chits
                </span>
              </div>
            )}
          </Link>

          {/* Mobile close button */}
          {mobileOpen && (
            <button
              type="button"
              onClick={onMobileClose}
              className="lg:hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Navigation Item List */}
        <TooltipProvider delayDuration={150}>
          <nav className="flex flex-col gap-1 p-3">
            {allowedNavItems.map((item) => {
              const active = isItemActive(item.href);
              const Icon = item.icon;
              const badgeCount = getBadgeCount(item.badgeKey);
              const labelSubKey = item.labelKey.replace('nav.', '');
              let label = labelSubKey;
              try {
                label = tNav(labelSubKey as any);
              } catch {
                label = labelSubKey;
              }

              const linkElement = (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onMobileClose}
                  className={cn(
                    'group relative flex items-center rounded-lg transition-all duration-150',
                    isCollapsed
                      ? 'h-11 w-11 justify-center mx-auto'
                      : 'h-10 px-3 gap-3',
                    active
                      ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                  )}
                >
                  {/* Active Indicator Bar */}
                  {active && (
                    <span
                      className={cn(
                        'absolute rounded-r-full bg-emerald-400',
                        isCollapsed
                          ? 'left-0 top-1.5 bottom-1.5 w-1'
                          : 'left-0 top-1 bottom-1 w-1'
                      )}
                    />
                  )}

                  <Icon
                    className={cn(
                      'shrink-0 transition-transform duration-150 group-hover:scale-105',
                      isCollapsed ? 'h-5 w-5' : 'h-4 w-4',
                      active ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'
                    )}
                  />

                  {!isCollapsed && (
                    <span className="truncate text-sm tracking-normal flex-1">
                      {label}
                    </span>
                  )}

                  {/* Badge Counter */}
                  {badgeCount > 0 && (
                    <span
                      className={cn(
                        'flex items-center justify-center rounded-full text-[10px] font-bold',
                        active
                          ? 'bg-emerald-500 text-slate-950 font-black'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
                        isCollapsed
                          ? 'absolute -top-1 -right-1 h-4 w-4'
                          : 'h-5 min-w-[20px] px-1.5 ml-auto'
                      )}
                    >
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </Link>
              );

              if (isCollapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      {label}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return linkElement;
            })}
          </nav>
        </TooltipProvider>
      </div>

      {/* Footer: Tagline & Desktop Collapse Button */}
      <div className="border-t border-slate-800/80 p-3">
        {!isCollapsed && (
          <div className="mb-2 px-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="truncate">{tSidebar('brandTagline')}</span>
            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
              v1.0
            </span>
          </div>
        )}

        {/* Desktop Collapse Toggle */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn(
            'hidden lg:flex w-full items-center rounded-lg py-2 text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200',
            isCollapsed ? 'justify-center px-0' : 'px-3 gap-2.5 text-xs font-medium'
          )}
          aria-label={isCollapsed ? tSidebar('expand') : tSidebar('collapse')}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>{tSidebar('collapse')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={cn(
          'hidden lg:block shrink-0 transition-all duration-200 ease-in-out',
          isCollapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        <div className="fixed top-0 bottom-0 z-30 flex flex-col h-screen">
          <div className={cn('h-full', isCollapsed ? 'w-[72px]' : 'w-64')}>
            {renderNavContent()}
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={onMobileClose}
          />
          {/* Drawer Panel */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            {renderNavContent()}
          </div>
        </div>
      )}
    </>
  );
}
