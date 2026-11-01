/**
 * Date utility helpers for safe ISO parsing and projected schedules.
 * Guarantees zero unhandled RangeErrors on invalid/malformed date strings.
 */

/**
 * Safely parses input date strings to ISO 8601 UTC string.
 * Returns undefined if input is null, undefined, empty, or an invalid date value.
 */
export function toSafeIsoDate(dateStr?: string | null): string | undefined {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) return undefined;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

/**
 * Computes default scheduled start date (1st of next month in YYYY-MM-DD).
 */
export function getDefaultStartDate(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

/**
 * Projects scheduled end date (+ durationMonths from start date in YYYY-MM-DD).
 */
export function projectEndDate(startDateStr: string, durationMonths: number): string {
  try {
    const d = new Date(startDateStr);
    if (isNaN(d.getTime())) return '';
    d.setMonth(d.getMonth() + durationMonths);
    return d.toISOString().split('T')[0];
  } catch {
    return '';
  }
}
