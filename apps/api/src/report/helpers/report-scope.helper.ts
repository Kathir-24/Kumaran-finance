import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Fixed IST (Asia/Kolkata) offset: UTC+05:30 (+19,800,000 ms).
 * India observes no Daylight Saving Time, so fixed-offset arithmetic is exact
 * and immune to host OS timezone configuration.
 */
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_PREFIX_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/;

const GLOBAL_REPORT_ROLES: readonly Role[] = [
  Role.SUPER_ADMIN,
  Role.PARTNER,
  Role.ACCOUNTANT,
  Role.AUDITOR,
];

const SENSITIVE_AUDIT_KEYS = new Set([
  'password',
  'passwordhash',
  'temporarypassword',
  'temppassword',
  'totpsecret',
  'mpin',
  'mpinhash',
  'refreshtoken',
  'refreshtokenhash',
  'accesstoken',
  'temptoken',
  'fcmtoken',
  'otp',
  'otphash',
  'secret',
  'privatekey',
  'apikey',
  'authorization',
  'cookie',
  'setcookie',
  'sessiontoken',
  'bearertoken',
]);

const PAN_AUDIT_KEYS = new Set(['pan', 'pannumber']);
const AADHAAR_AUDIT_KEYS = new Set([
  'aadhaar',
  'aadhaarnumber',
  'aadhar',
  'aadharnumber',
]);

/**
 * Fail-closed Anti-BOLA branch scoping for report endpoints.
 * - Global roles (SUPER_ADMIN, ACCOUNTANT, AUDITOR): may query all branches or filter by requestedBranchId.
 * - Branch-scoped roles (BRANCH_MANAGER, and optionally COLLECTION_AGENT):
 *   - MUST have a non-empty `user.branchId` (fails closed with 403 if null/undefined/blank).
 *   - MUST NOT request a foreign `requestedBranchId` (fails closed with 403).
 * - All other roles (e.g., CUSTOMER, or COLLECTION_AGENT when disallowed): rejected with 403.
 */
export function resolveScopedBranchId(
  user: JwtPayload,
  requestedBranchId?: string,
  options?: { allowCollectionAgent?: boolean },
): string | undefined {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.length === 0) {
    throw new ForbiddenException('ACCESS_DENIED: Missing role claims');
  }

  const normalizedRequested = requestedBranchId?.trim() || undefined;

  if (roles.some((r) => GLOBAL_REPORT_ROLES.includes(r))) {
    return normalizedRequested;
  }

  const isBranchManager = roles.includes(Role.BRANCH_MANAGER);
  const isAllowedAgent =
    Boolean(options?.allowCollectionAgent) && roles.includes(Role.COLLECTION_AGENT);

  if (isBranchManager || isAllowedAgent) {
    const assignedBranchId = user.branchId?.trim();
    if (!assignedBranchId) {
      throw new ForbiddenException(
        'BRANCH_SCOPE_REQUIRED: Branch assignment is required to access branch-scoped reports',
      );
    }

    if (normalizedRequested && normalizedRequested !== assignedBranchId) {
      throw new ForbiddenException(
        'Access denied: Cannot access reports belonging to another branch',
      );
    }

    return assignedBranchId;
  }

  throw new ForbiddenException(
    'Access denied: Insufficient role permissions to view this report',
  );
}

/**
 * Pre-lookup role & branch/identity validation for chit-scoped statutory registers (Form XVII, Form XXI).
 * Executed BEFORE `prisma.chitGroup.findUnique` to eliminate 404 vs 403 UUID existence oracles.
 */
export function assertStatutoryRegisterCallerPrecheck(
  user: JwtPayload,
  options?: { allowCustomer?: boolean },
): void {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.length === 0) {
    throw new ForbiddenException('ACCESS_DENIED: Missing role claims');
  }

  if (roles.some((r) => GLOBAL_REPORT_ROLES.includes(r))) {
    return;
  }

  if (roles.includes(Role.BRANCH_MANAGER)) {
    const assignedBranchId = user.branchId?.trim();
    if (!assignedBranchId) {
      throw new ForbiddenException(
        'BRANCH_SCOPE_REQUIRED: Branch assignment is required to access chit statutory registers',
      );
    }
    return;
  }

  if (options?.allowCustomer && roles.includes(Role.CUSTOMER)) {
    const sub = user.sub?.trim();
    const phone = user.phone?.trim();
    if (!sub && !phone) {
      throw new ForbiddenException(
        'Access denied: Missing subscriber identity for Form XXI ledger isolation',
      );
    }
    return;
  }

  throw new ForbiddenException(
    'Access denied: Insufficient role permissions to access this statutory register',
  );
}

/**
 * Fail-closed Anti-BOLA branch verification for chit-scoped statutory registers (Form XVII, Form XXI).
 */
export function assertChitBranchAccess(
  chitBranchId: string,
  user: JwtPayload,
  options?: { allowCustomer?: boolean },
): void {
  assertStatutoryRegisterCallerPrecheck(user, options);

  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.some((r) => GLOBAL_REPORT_ROLES.includes(r))) {
    return;
  }

  if (roles.includes(Role.BRANCH_MANAGER)) {
    const assignedBranchId = user.branchId?.trim();
    if (!assignedBranchId) {
      throw new ForbiddenException(
        'BRANCH_SCOPE_REQUIRED: Branch assignment is required to access chit statutory registers',
      );
    }
    if (chitBranchId !== assignedBranchId) {
      throw new ForbiddenException('Access denied: Chit belongs to another branch');
    }
    return;
  }
}

/**
 * Resolves strict self-isolation Prisma filter for pure CUSTOMER callers on Form XXI.
 * Fails closed if neither `sub` nor `phone` is present (never returns all tickets).
 */
export function resolveCustomerLedgerWhere(
  user: JwtPayload,
): { isPureCustomer: boolean; customerFilter?: Record<string, unknown> } {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const hasStaffOrAuditorRole = roles.some(
    (r) => GLOBAL_REPORT_ROLES.includes(r) || r === Role.BRANCH_MANAGER,
  );

  if (hasStaffOrAuditorRole) {
    return { isPureCustomer: false };
  }

  if (!roles.includes(Role.CUSTOMER)) {
    throw new ForbiddenException(
      'Access denied: Insufficient role permissions to access subscriber ledger',
    );
  }

  const sub = user.sub?.trim();
  const phone = user.phone?.trim();

  if (!sub && !phone) {
    throw new ForbiddenException(
      'Access denied: Missing subscriber identity for Form XXI ledger isolation',
    );
  }

  if (sub && phone) {
    return {
      isPureCustomer: true,
      customerFilter: {
        OR: [{ customerId: sub }, { customer: { phone } }],
      },
    };
  }

  if (sub) {
    return {
      isPureCustomer: true,
      customerFilter: { customerId: sub },
    };
  }

  return {
    isPureCustomer: true,
    customerFilter: { customer: { phone } },
  };
}

/**
 * Formats an instant as a `YYYY-MM-DD` calendar date string in Asia/Kolkata (IST).
 */
export function formatIstDate(date: Date = new Date()): string {
  const istShifted = new Date(date.getTime() + IST_OFFSET_MS);
  const year = istShifted.getUTCFullYear();
  const month = String(istShifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istShifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function assertValidCalendarDateParts(
  year: number,
  month: number,
  day: number,
  rawInput: string,
  fieldName: string,
): string {
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    throw new BadRequestException(
      `INVALID_DATE: ${fieldName} "${rawInput}" is not a valid calendar date`,
    );
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const HAS_EXPLICIT_TZ_REGEX = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

function parseValidatedDateString(
  raw: string,
  fieldName: string,
  boundary: 'start' | 'end',
): { date: Date; istDateStr: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new BadRequestException(`INVALID_DATE: ${fieldName} cannot be empty`);
  }

  const dateOnlyMatch = DATE_ONLY_REGEX.exec(trimmed);
  if (dateOnlyMatch) {
    const normalized = assertValidCalendarDateParts(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]),
      Number(dateOnlyMatch[3]),
      raw,
      fieldName,
    );
    const suffix = boundary === 'start' ? 'T00:00:00.000+05:30' : 'T23:59:59.999+05:30';
    return {
      date: new Date(`${normalized}${suffix}`),
      istDateStr: normalized,
    };
  }

  const prefixMatch = ISO_DATE_PREFIX_REGEX.exec(trimmed);
  if (prefixMatch) {
    assertValidCalendarDateParts(
      Number(prefixMatch[1]),
      Number(prefixMatch[2]),
      Number(prefixMatch[3]),
      raw,
      fieldName,
    );
  }

  // XR-M7-RPT-05: Anchor timezone-less ISO datetimes explicitly to IST (+05:30)
  // so host OS local timezone never introduces 05:30 drift.
  const isoInput =
    trimmed.includes('T') && !HAS_EXPLICIT_TZ_REGEX.test(trimmed)
      ? `${trimmed}+05:30`
      : trimmed;

  const parsed = new Date(isoInput);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(
      `INVALID_DATE: ${fieldName} "${raw}" is not a valid ISO date`,
    );
  }

  return {
    date: parsed,
    istDateStr: formatIstDate(parsed),
  };
}

/**
 * Computes exact IST (Asia/Kolkata) day boundaries (`00:00:00.000+05:30` to `23:59:59.999+05:30`).
 * Rejects malformed or calendar-overflow dates (e.g. `2026-02-30`) with HTTP 400.
 */
export function getIstDayBounds(
  dateInput?: string | Date,
  fieldName: string = 'date',
): { dateStr: string; startOfDay: Date; endOfDay: Date } {
  let dateStr: string;

  if (dateInput === undefined || dateInput === null || dateInput === '') {
    dateStr = formatIstDate(new Date());
  } else if (dateInput instanceof Date) {
    if (Number.isNaN(dateInput.getTime())) {
      throw new BadRequestException(`INVALID_DATE: ${fieldName} is invalid`);
    }
    dateStr = formatIstDate(dateInput);
  } else {
    dateStr = parseValidatedDateString(dateInput, fieldName, 'start').istDateStr;
  }

  return {
    dateStr,
    startOfDay: new Date(`${dateStr}T00:00:00.000+05:30`),
    endOfDay: new Date(`${dateStr}T23:59:59.999+05:30`),
  };
}

/**
 * Validates and builds a Prisma timestamp range filter from optional `fromDate` / `toDate`.
 * - Date-only strings (`YYYY-MM-DD`) expand to full IST day boundaries.
 * - Rejects invalid dates and inverted ranges (`fromDate > toDate`) with HTTP 400.
 */
export function parseStrictIstDateRange(
  fromDate?: string,
  toDate?: string,
): { gte?: Date; lte?: Date } | undefined {
  if (!fromDate && !toDate) {
    return undefined;
  }

  const gte = fromDate
    ? parseValidatedDateString(fromDate, 'fromDate', 'start').date
    : undefined;
  const lte = toDate
    ? parseValidatedDateString(toDate, 'toDate', 'end').date
    : undefined;

  if (gte && lte && gte.getTime() > lte.getTime()) {
    throw new BadRequestException(
      'INVALID_DATE_RANGE: fromDate cannot be later than toDate',
    );
  }

  return {
    ...(gte ? { gte } : {}),
    ...(lte ? { lte } : {}),
  };
}

/**
 * Enforces strict service-level pagination bounds (`1 <= page <= 10000`, `1 <= limit <= 100`).
 */
export function validatePagination(
  pageInput: number | undefined,
  limitInput: number | undefined,
  defaultLimit: number,
  maxLimit: number = 100,
  maxPage: number = 10000,
): { page: number; limit: number; skip: number } {
  const page = pageInput ?? 1;
  const limit = limitInput ?? defaultLimit;

  if (!Number.isInteger(page) || page < 1 || page > maxPage) {
    throw new BadRequestException(
      `INVALID_PAGINATION: page must be an integer between 1 and ${maxPage}`,
    );
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new BadRequestException(
      `INVALID_PAGINATION: limit must be an integer between 1 and ${maxLimit}`,
    );
  }

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Formats a frozen Prisma Decimal / string / number foreman commission rate
 * into a canonical 2-decimal percentage label (e.g. `4.00%`, `5.00%`, `3.50%`)
 * without floating-point precision loss or hardcoded 4% assumptions (Guardrail 3 / ADR-04).
 */
export function formatFrozenCommissionRate(
  auctionRate?: unknown,
  chitGroupRate?: unknown,
): string {
  const raw = auctionRate ?? chitGroupRate;
  if (raw === null || raw === undefined) {
    return '4.00%';
  }

  const cleaned = String(raw).trim().replace(/%$/, '');
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) {
    return '4.00%';
  }

  const intPart = match[1];
  const fracPart = (match[2] || '').padEnd(2, '0').slice(0, 2);
  return `${intPart}.${fracPart}%`;
}

export interface RegistrarFilingCompliance {
  filingDeadline: Date;
  filingDeadlineDate: string;
  filingDaysRemaining: number | null;
  isFilingOverdue: boolean;
  filingStatus: 'FILED' | 'FILED_LATE' | 'OVERDUE' | 'DUE_SOON' | 'PENDING';
}

function istDateStrToUtcMidnightMs(istDateStr: string): number {
  const [y, m, d] = istDateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Computes statutory 21-day Deputy Registrar of Chits Form XVII filing deadline & countdown
 * using exact Asia/Kolkata (IST) calendar days (Chit Funds Act §24).
 */
export function computeRegistrarFilingCompliance(
  auctionDate: Date,
  filedAtRegistrar: boolean,
  filedDate?: Date | null,
  now: Date = new Date(),
): RegistrarFilingCompliance {
  const auctionIstStr = formatIstDate(auctionDate);
  const auctionDayMs = istDateStrToUtcMidnightMs(auctionIstStr);
  const deadlineDayMs = auctionDayMs + 21 * MS_PER_DAY;
  const deadlineUtc = new Date(deadlineDayMs);
  const filingDeadlineDate = `${deadlineUtc.getUTCFullYear()}-${String(deadlineUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(deadlineUtc.getUTCDate()).padStart(2, '0')}`;
  const filingDeadline = new Date(`${filingDeadlineDate}T23:59:59.999+05:30`);

  if (filedAtRegistrar) {
    const filedLate = Boolean(
      filedDate && formatIstDate(filedDate) > filingDeadlineDate,
    );
    return {
      filingDeadline,
      filingDeadlineDate,
      filingDaysRemaining: null,
      isFilingOverdue: false,
      filingStatus: filedLate ? 'FILED_LATE' : 'FILED',
    };
  }

  const todayIstStr = formatIstDate(now);
  const todayDayMs = istDateStrToUtcMidnightMs(todayIstStr);
  const filingDaysRemaining = Math.round((deadlineDayMs - todayDayMs) / MS_PER_DAY);
  const isFilingOverdue = filingDaysRemaining < 0;

  const filingStatus: RegistrarFilingCompliance['filingStatus'] = isFilingOverdue
    ? 'OVERDUE'
    : filingDaysRemaining <= 5
      ? 'DUE_SOON'
      : 'PENDING';

  return {
    filingDeadline,
    filingDeadlineDate,
    filingDaysRemaining,
    isFilingOverdue,
    filingStatus,
  };
}

function maskPan(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 6) {
    return '[REDACTED]';
  }
  const s = value.trim();
  return `${s.slice(0, 2)}${'X'.repeat(s.length - 5)}${s.slice(-3)}`;
}

function maskAadhaar(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length <= 4) {
    return '[REDACTED]';
  }
  const s = value.trim();
  return `${'X'.repeat(s.length - 4)}${s.slice(-4)}`;
}

const SENSITIVE_AUDIT_SUBSTRINGS = [
  'password',
  'totpsecret',
  'totpuri',
  'otpauth',
  'mpin',
  'refreshtoken',
  'accesstoken',
  'fcmtoken',
  'privatekey',
  'apikey',
  'authkey',
  'sessiontoken',
  'authtoken',
  'bearertoken',
  'temptoken',
  'otphash',
  'otpcode',
  'loginotp',
  'recoverycode',
  'jwt',
  'bankaccount',
  'chequenumber',
  'secret',
];

const EXTRA_PAN_AUDIT_KEYS = new Set([
  'pan',
  'pannumber',
  'panno',
  'pancard',
  'oldpan',
  'newpan',
  'customerpan',
]);

function isSensitiveAuditKey(normalizedKey: string): boolean {
  if (SENSITIVE_AUDIT_KEYS.has(normalizedKey)) {
    return true;
  }
  return SENSITIVE_AUDIT_SUBSTRINGS.some((sub) => normalizedKey.includes(sub));
}

function isPanAuditKey(normalizedKey: string): boolean {
  return (
    PAN_AUDIT_KEYS.has(normalizedKey) ||
    EXTRA_PAN_AUDIT_KEYS.has(normalizedKey) ||
    normalizedKey.endsWith('pannumber') ||
    normalizedKey.endsWith('panno') ||
    normalizedKey.endsWith('pancard')
  );
}

function isAadhaarAuditKey(normalizedKey: string): boolean {
  if (normalizedKey === 'aadhaarlast4' || normalizedKey === 'aadharlast4') {
    return false;
  }
  return (
    AADHAAR_AUDIT_KEYS.has(normalizedKey) ||
    normalizedKey.includes('aadhaar') ||
    normalizedKey.includes('aadhar')
  );
}

/**
 * Recursively redacts secrets, cryptographic hashes, session/device tokens, and raw government IDs
 * from AuditLog `oldValue` / `newValue` JSON snapshots before returning to Super Admin.
 */
export function sanitizeAuditPayload(
  value: unknown,
  depth: number = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (depth > 12 || seen.has(value)) {
    return '[TRUNCATED]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditPayload(item, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');

    if (isSensitiveAuditKey(normalizedKey)) {
      result[key] = val === null || val === undefined ? val : '[REDACTED]';
      continue;
    }

    if (isPanAuditKey(normalizedKey)) {
      result[key] = val === null || val === undefined ? val : maskPan(val);
      continue;
    }

    if (isAadhaarAuditKey(normalizedKey)) {
      result[key] = val === null || val === undefined ? val : maskAadhaar(val);
      continue;
    }

    result[key] = sanitizeAuditPayload(val, depth + 1, seen);
  }

  return result;
}
