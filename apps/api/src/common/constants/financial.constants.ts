/**
 * 10 Invariant Architectural Guardrails (AGENTS.md):
 * - ADR-04: Foreman commission defaults to 4.00%, permanently frozen per chit group upon activation.
 * - ADR-06: Fixed 1/4 (25%) discount ceiling: D <= V / 4.
 * - ADR-07 & ADR-12: 3 consecutive unpaid months grants company removal rights.
 * - Month 1 (Company ticket, no auction) & Month N (final subscriber, no auction).
 */

/** Foreman commission as a decimal percentage (4.00%) for display/Prisma Decimal */
export const FOREMAN_COMMISSION_PERCENT = 4.0;

/** Foreman commission numerator for whole-rupee math ((chitValue * 4n) / 100n) */
export const FOREMAN_COMMISSION_NUMERATOR = 4n;

/** Percentage denominator for whole-rupee arithmetic */
export const PERCENT_DENOMINATOR = 100n;

/** Fixed discount ceiling divisor (chitValue / 4n) per ADR-06 */
export const DISCOUNT_CEILING_DIVISOR = 4n;

/** Default standard chit duration in months */
export const DEFAULT_CHIT_DURATION_MONTHS = 20;

/** Consecutive unpaid months that triggers DEFAULT_3_MONTHS and company removal rights */
export const CONSECUTIVE_UNPAID_DEFAULT_THRESHOLD_MONTHS = 3;

/** Month 1: Company ticket pool, zero auction, zero dividend */
export const COMPANY_POOL_MONTH = 1;

/** First month eligible for open auction bidding (Month 2) */
export const FIRST_AUCTION_MONTH = 2;
