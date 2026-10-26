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
 * Converts user input into whole integer Rupees, stripping any accidental paise or decimals.
 */
export function parseWholeRupees(value: string | number): number {
  if (typeof value === 'number') {
    return Math.trunc(value);
  }
  const cleaned = value.replace(/[^0-9]/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}
