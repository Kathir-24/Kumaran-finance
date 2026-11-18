// ==============================================================================
// Kumaran Chits — Whole Rupee Currency Utilities (Guardrail 2)
// Pure Whole Rupee Math: Zero paise, zero decimals (.00), BigInt / int compatibility.
// ==============================================================================

const WHOLE_RUPEE_INT_PATTERN = /^-?\d+$/;

function normalizeToFormatValue(
  amount: number | bigint | string | null | undefined,
): number | bigint | null {
  if (amount === null || amount === undefined) {
    return null;
  }

  if (typeof amount === 'bigint') {
    return amount;
  }

  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) {
      return null;
    }
    const truncated = Math.trunc(amount);
    return truncated === 0 ? 0 : truncated;
  }

  if (typeof amount === 'string') {
    const trimmed = amount.trim();
    if (!trimmed) {
      return null;
    }

    // Exact arbitrary-precision BigInt path for raw integer strings (Guardrail 2)
    if (WHOLE_RUPEE_INT_PATTERN.test(trimmed)) {
      return BigInt(trimmed);
    }

    // Fallback for formatted/prefixed strings (e.g., "₹1,00,000.50", "-25,000")
    const isNegative = trimmed.startsWith('-');
    const integerPart = (isNegative ? trimmed.slice(1) : trimmed).split('.')[0] ?? '';
    const digitsOnly = integerPart.replace(/[^0-9]/g, '');
    if (!digitsOnly) {
      return null;
    }
    const parsed = BigInt(digitsOnly);
    return isNegative && parsed !== 0n ? -parsed : parsed;
  }

  return null;
}

/**
 * Formats a monetary value strictly in whole integer Indian Rupees (e.g., ₹1,00,000).
 * Decimal fractions (.00) and paise are strictly prohibited from display.
 * Preserves full 64-bit BigInt precision without IEEE-754 Number truncation (Guardrail 2).
 */
export function formatRupee(amount: number | bigint | string | null | undefined): string {
  const value = normalizeToFormatValue(amount);
  if (value === null) {
    return '₹0';
  }

  // Format with Indian grouping (e.g. 1,00,000) and 0 fraction digits
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
}

/**
 * Formats rupee amount as plain number string with Indian commas (e.g. "1,00,000").
 * Preserves full 64-bit BigInt precision without IEEE-754 Number truncation (Guardrail 2).
 */
export function formatRupeeAmount(amount: number | bigint | string | null | undefined): string {
  const value = normalizeToFormatValue(amount);
  if (value === null) {
    return '0';
  }

  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
}

/**
 * Sanitizes a raw monetary text input into normalized whole-Rupee digits only.
 * Splits on the decimal point FIRST (DEF-FE-10) so fractional paise never
 * concatenate onto the integer Rupee amount (e.g. "25000.50" -> "25000").
 */
export function sanitizeWholeRupeeInput(value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  const integerPart = value.split('.')[0] ?? '';
  const digitsOnly = integerPart.replace(/[^0-9]/g, '');
  if (digitsOnly.length > 1 && digitsOnly.startsWith('0')) {
    return digitsOnly.replace(/^0+/, '') || '0';
  }
  return digitsOnly;
}

/**
 * Converts user input into whole integer Rupees, discarding any fractional paise
 * before digit extraction so decimals never inflate amounts by 100x (DEF-FE-10).
 * Non-throwing input parser: returns 0 for nullish, empty, or non-finite values.
 * Strings are unsigned whole-Rupee inputs (signs stripped by sanitizer);
 * finite numeric values preserve truncation via Math.trunc with -0 normalized to 0.
 */
export function parseWholeRupees(value: string | number): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const truncated = Math.trunc(value);
    return truncated === 0 ? 0 : truncated;
  }
  if (typeof value !== 'string') {
    return 0;
  }
  const cleaned = sanitizeWholeRupeeInput(value);
  return cleaned ? parseInt(cleaned, 10) : 0;
}
