import {
  LayoutDashboard,
  Landmark,
  BookOpen,
  Users,
  Gavel,
  Award,
  Receipt,
  Banknote,
  RefreshCw,
  FileSpreadsheet,
  BookCheck,
  Building2,
  UserCog,
  Activity,
  type LucideIcon,
} from 'lucide-react';

import {
  ROUTE_PERMISSIONS_BY_HREF,
  type UserRole,
} from '../../lib/route-permissions.ts';

export type { UserRole };

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  allowedRoles: UserRole[];
  badgeKey?: 'pendingApprovals' | 'cashHandovers' | 'disbursements' | 'reversals';
  isAuditOnly?: boolean;
}

export const MAIN_NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    labelKey: 'nav.dashboard',
    icon: LayoutDashboard,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/'],
  },
  {
    href: '/schemes',
    labelKey: 'nav.schemes',
    icon: Landmark,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/schemes'],
  },
  {
    href: '/schemes/onboard',
    labelKey: 'nav.onboardGrid',
    icon: BookOpen,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/schemes/onboard'],
  },
  {
    href: '/customers',
    labelKey: 'nav.customers',
    icon: Users,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/customers'],
  },
  {
    href: '/auctions',
    labelKey: 'nav.auctions',
    icon: Gavel,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/auctions'],
  },
  {
    href: '/disbursements',
    labelKey: 'nav.disbursements',
    icon: Award,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/disbursements'],
    badgeKey: 'disbursements',
  },
  {
    href: '/collections',
    labelKey: 'nav.collections',
    icon: Receipt,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/collections'],
  },
  {
    href: '/collections/handover',
    labelKey: 'nav.handover',
    icon: Banknote,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/collections/handover'],
    badgeKey: 'cashHandovers',
  },
  {
    href: '/reversals',
    labelKey: 'nav.reversals',
    icon: RefreshCw,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/reversals'],
    badgeKey: 'reversals',
  },
  {
    href: '/reports',
    labelKey: 'nav.reports',
    icon: FileSpreadsheet,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/reports'],
  },
  {
    href: '/instructions',
    labelKey: 'nav.instructions',
    icon: BookCheck,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/instructions'],
  },
  {
    href: '/branches',
    labelKey: 'nav.branches',
    icon: Building2,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/branches'],
  },
  {
    href: '/users',
    labelKey: 'nav.users',
    icon: UserCog,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/users'],
  },
  {
    href: '/admin/jobs',
    labelKey: 'nav.jobs',
    icon: Activity,
    allowedRoles: ROUTE_PERMISSIONS_BY_HREF['/admin/jobs'],
  },
];

/**
 * Filter navigation items based on current authenticated user roles.
 */
export function filterNavItemsByRoles(items: NavItem[], userRoles: string[] = []): NavItem[] {
  if (!userRoles || userRoles.length === 0) return [];
  return items.filter((item) =>
    item.allowedRoles.some((role) => userRoles.includes(role))
  );
}
