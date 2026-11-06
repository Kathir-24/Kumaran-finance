// ==============================================================================
// Kumaran Chits — Centralized Cache Constants & Key Factories
// ==============================================================================

/** Master Reference Data TTL: 1 hour (3600 seconds) */
export const MASTER_CACHE_BRANCH_TTL_SECONDS = 3600;

/** Master Chit Schemes TTL: 30 minutes (1800 seconds) */
export const MASTER_CACHE_SCHEME_TTL_SECONDS = 1800;

/** Key Factories for Redis Master Data Caching */
export const MasterCacheKeys = {
  branchesAll: 'cache:master:branches:all',
  branchesActive: 'cache:master:branches:active',
  branchById: (id: string) => `cache:master:branch:${id}`,
  schemesAll: 'cache:master:schemes:all',
  schemeById: (id: string) => `cache:master:scheme:${id}`,
  reportEtag: (reportName: string, dateOrId: string) =>
    `etag:report:${reportName}:${dateOrId}`,
} as const;
