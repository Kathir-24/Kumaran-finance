// ==============================================================================
// Kumaran Chits — Whole-Rupee BigInt Math Helpers for Reports, Dashboard & Print
// Guardrail 2: Pure 64-bit integer Rupee math; zero IEEE-754 float precision loss
// or NaN on large BigInt-serialized decimal strings.
// ==============================================================================

export type WholeRupeeValue = number | bigint | string | null | undefined;

const RAW_INT_PATTERN = /^-?\d+$/;

/**
 * Safely converts a monetary rupee value (`bigint`, `number`, or BigInt-serialized
 * decimal string) into an exact native `bigint` without `Number()` truncation or throws.
 */
export function toSafeBigInt(value: WholeRupeeValue): bigint {
  if (value === null || value === undefined) {
    return 0n;
  }

  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 0n;
    }
    return BigInt(Math.trunc(value));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0n;
    }

    if (RAW_INT_PATTERN.test(trimmed)) {
      return BigInt(trimmed);
    }

    const isNegative = trimmed.startsWith('-');
    const integerPart = (isNegative ? trimmed.slice(1) : trimmed).split('.')[0] ?? '';
    const digitsOnly = integerPart.replace(/[^0-9]/g, '');
    if (!digitsOnly) {
      return 0n;
    }

    const parsed = BigInt(digitsOnly);
    return isNegative && parsed !== 0n ? -parsed : parsed;
  }

  return 0n;
}

/**
 * Sums an array of whole-rupee values using exact BigInt arithmetic.
 */
export function sumWholeRupees(values: readonly WholeRupeeValue[]): bigint {
  let total = 0n;
  for (const val of values) {
    total += toSafeBigInt(val);
  }
  return total;
}

/**
 * Parses a frozen foreman commission rate (e.g. "4.00%", "4.00", "3.5", 4)
 * into integer basis points (1% = 100 bps, 4.00% = 400 bps) without float math.
 */
export function parseCommissionRateToBps(
  rate: string | number | null | undefined,
  fallbackBps = 400n,
): bigint {
  if (rate === null || rate === undefined) {
    return fallbackBps;
  }

  const normalized = String(rate).replace(/%/g, '').trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    return fallbackBps;
  }

  const whole = BigInt(match[1]);
  const fracStr = (match[2] ?? '').slice(0, 2).padEnd(2, '0');
  const bps = whole * 100n + BigInt(fracStr);
  if (bps <= 0n || bps > 10000n) {
    return fallbackBps;
  }

  return bps;
}

/**
 * Computes frozen foreman commission in whole rupees using exact BigInt basis points.
 */
export function calculateCommissionRupees(
  chitValue: WholeRupeeValue,
  commissionRate?: string | number | null,
): bigint {
  const bps = parseCommissionRateToBps(commissionRate);
  return (toSafeBigInt(chitValue) * bps) / 10000n;
}

/**
 * Formats a frozen foreman commission rate label (e.g. "4.00%").
 */
export function formatCommissionRateLabel(
  commissionRate?: string | number | null,
): string {
  const bps = parseCommissionRateToBps(commissionRate);
  const whole = bps / 100n;
  const frac = (bps % 100n).toString().padStart(2, '0');
  return `${whole.toString()}.${frac}%`;
}

/**
 * Formats a Date as YYYY-MM-DD in India Standard Time (Asia/Kolkata).
 */
export function formatIstDateString(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

/**
 * Formats a date/timestamp string for display strictly in IST (Asia/Kolkata),
 * returning '—' for nullish or invalid dates (zero browser timezone drift or NaN).
 */
export function formatIstDisplayDate(input: string | Date | null | undefined): string {
  if (!input) return '—';
  const parsed = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Formats a timestamp string for display strictly in IST (Asia/Kolkata),
 * returning '—' for nullish or invalid dates.
 */
export function formatIstDisplayTime(input: string | Date | null | undefined): string {
  if (!input) return '—';
  const parsed = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
