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
  type LucideIcon,
} from 'lucide-react';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'BRANCH_MANAGER'
  | 'ACCOUNTANT'
  | 'COLLECTION_AGENT'
  | 'AUDITOR'
  | 'CUSTOMER';

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
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR', 'COLLECTION_AGENT'],
  },
  {
    href: '/schemes',
    labelKey: 'nav.schemes',
    icon: Landmark,
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'],
  },
  {
    href: '/schemes/onboard',
    labelKey: 'nav.onboardGrid',
    icon: BookOpen,
    allowedRoles: ['SUPER_ADMIN', 'ACCOUNTANT'],
  },
  {
    href: '/customers',
    labelKey: 'nav.customers',
    icon: Users,
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR', 'COLLECTION_AGENT'],
  },
  {
    href: '/auctions',
    labelKey: 'nav.auctions',
    icon: Gavel,
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'AUDITOR'],
  },
  {
    href: '/disbursements',
    labelKey: 'nav.disbursements',
    icon: Award,
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
    badgeKey: 'disbursements',
  },
  {
    href: '/collections',
    labelKey: 'nav.collections',
    icon: Receipt,
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'COLLECTION_AGENT'],
  },
  {
    href: '/collections/handover',
    labelKey: 'nav.handover',
    icon: Banknote,
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'COLLECTION_AGENT'],
    badgeKey: 'cashHandovers',
  },
  {
    href: '/reversals',
    labelKey: 'nav.reversals',
    icon: RefreshCw,
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
    badgeKey: 'reversals',
  },
  {
    href: '/reports',
    labelKey: 'nav.reports',
    icon: FileSpreadsheet,
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'],
  },
  {
    href: '/instructions',
    labelKey: 'nav.instructions',
    icon: BookCheck,
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR', 'COLLECTION_AGENT'],
  },
  {
    href: '/branches',
    labelKey: 'nav.branches',
    icon: Building2,
    allowedRoles: ['SUPER_ADMIN'],
  },
  {
    href: '/users',
    labelKey: 'nav.users',
    icon: UserCog,
    allowedRoles: ['SUPER_ADMIN'],
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
