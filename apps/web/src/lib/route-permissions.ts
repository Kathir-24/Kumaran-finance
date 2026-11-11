// ==============================================================================
// Kumaran Chits — Canonical Route RBAC Permissions Registry (Single Source of Truth)
// Dependency-free data module shared cleanly across Next.js Edge Middleware,
// Dashboard Client Guard, Sidebar Navigation, and Unit Test Suites.
// ==============================================================================

export type UserRole =
  | 'SUPER_ADMIN'
  | 'BRANCH_MANAGER'
  | 'ACCOUNTANT'
  | 'COLLECTION_AGENT'
  | 'AUDITOR'
  | 'CUSTOMER';

export const DASHBOARD_STAFF_ROLES: readonly UserRole[] = [
  'SUPER_ADMIN',
  'BRANCH_MANAGER',
  'ACCOUNTANT',
  'AUDITOR',
  'COLLECTION_AGENT',
] as const;

export interface RoutePermissionRule {
  href: string;
  allowedRoles: UserRole[];
}

/**
 * Canonical permission rules mapped to the 14 primary navigation modules.
 */
export const NAV_ROUTE_PERMISSIONS = {
  '/': ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR', 'COLLECTION_AGENT'],
  '/schemes': ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'],
  '/schemes/onboard': ['SUPER_ADMIN', 'ACCOUNTANT'],
  '/customers': ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR', 'COLLECTION_AGENT'],
  '/auctions': ['SUPER_ADMIN', 'BRANCH_MANAGER', 'AUDITOR'],
  '/disbursements': ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
  '/collections': ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'COLLECTION_AGENT'],
  '/collections/handover': ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'COLLECTION_AGENT'],
  '/reversals': ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
  '/reports': ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'],
  '/instructions': ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR', 'COLLECTION_AGENT'],
  '/branches': ['SUPER_ADMIN'],
  '/users': ['SUPER_ADMIN'],
  '/admin/jobs': ['SUPER_ADMIN'],
} as const satisfies Record<string, readonly UserRole[]>;

export type NavRouteHref = keyof typeof NAV_ROUTE_PERMISSIONS;

export const ROUTE_PERMISSIONS_BY_HREF: Record<NavRouteHref, UserRole[]> = Object.fromEntries(
  Object.entries(NAV_ROUTE_PERMISSIONS).map(([href, roles]) => [href, [...roles]]),
) as Record<NavRouteHref, UserRole[]>;

/**
 * Complete ordered permission matrix enforced by Edge Middleware & client shells,
 * covering all navigation modules plus top-level `/admin` and `/print/*` templates.
 */
export const ROUTE_PERMISSIONS: RoutePermissionRule[] = [
  ...Object.entries(NAV_ROUTE_PERMISSIONS).map(([href, allowedRoles]) => ({
    href,
    allowedRoles: [...allowedRoles],
  })),
  {
    href: '/admin',
    allowedRoles: ['SUPER_ADMIN'],
  },
  {
    href: '/print',
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR', 'COLLECTION_AGENT'],
  },
  {
    href: '/print/receipt',
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR', 'COLLECTION_AGENT'],
  },
  {
    href: '/print/voucher',
    allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'],
  },
];

const SORTED_ROUTE_PERMISSIONS = [...ROUTE_PERMISSIONS].sort(
  (a, b) => b.href.length - a.href.length,
);

/**
 * Resolves the most specific route permission rule for a pathname using
 * longest-prefix matching (e.g. `/schemes/onboard` takes precedence over `/schemes`).
 */
export function resolveRoutePermission(pathname: string): RoutePermissionRule | undefined {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  return SORTED_ROUTE_PERMISSIONS.find((rule) => {
    if (rule.href === '/') {
      return normalized === '/';
    }
    return normalized === rule.href || normalized.startsWith(`${rule.href}/`);
  });
}

/**
 * Checks whether a user's roles authorize access to the given pathname.
 * Rejects unauthenticated, empty, or non-staff (e.g. CUSTOMER) role sets across all routes.
 */
export function isRoleAuthorizedForPath(
  pathname: string,
  userRoles: readonly string[] = [],
): boolean {
  if (!userRoles || userRoles.length === 0) {
    return false;
  }

  const matchedRule = resolveRoutePermission(pathname);
  if (matchedRule) {
    return matchedRule.allowedRoles.some((role) => userRoles.includes(role));
  }

  return DASHBOARD_STAFF_ROLES.some((role) => userRoles.includes(role));
}
