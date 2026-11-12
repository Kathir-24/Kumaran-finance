// ==============================================================================
// Kumaran Chits — Whole Rupee Currency Utilities (Guardrail 2)
// Pure Whole Rupee Math: Zero paise, zero decimals (.00), BigInt / int compatibility.
// ==============================================================================

/**
 * Formats a monetary value strictly in whole integer Indian Rupees (e.g., ₹1,00,000).
 * Decimal fractions (.00) and paise are strictly prohibited from display.
 */
export function formatRupee(amount: number | bigint | string | null | undefined): string {
  if (amount === null || amount === undefined) {
    return '₹0';
  }

  const num = typeof amount === 'bigint' ? Number(amount) : typeof amount === 'string' ? parseInt(amount, 10) : amount;
  if (isNaN(num)) {
    return '₹0';
  }

  // Format with Indian grouping (e.g. 1,00,000) and 0 fraction digits
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(num);
}

/**
 * Formats rupee amount as plain number string with Indian commas (e.g. "1,00,000").
 */
export function formatRupeeAmount(amount: number | bigint | string | null | undefined): string {
  if (amount === null || amount === undefined) {
    return '0';
  }

  const num = typeof amount === 'bigint' ? Number(amount) : typeof amount === 'string' ? parseInt(amount, 10) : amount;
  if (isNaN(num)) {
    return '0';
  }

  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(num);
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
