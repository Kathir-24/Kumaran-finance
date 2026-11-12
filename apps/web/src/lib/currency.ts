// ==============================================================================
// Kumaran Chits — Whole Rupee Currency Utilities (Guardrail 2)
// Pure Whole Rupee Math: Zero paise, zero decimals (.00), BigInt / integer compatibility.
// ==============================================================================

import { formatRupee as baseFormatRupee } from '@kumaran/api-client';

// Re-export core whole-rupee utilities from shared client SDK (single source of truth)
export {
  formatRupee,
  formatRupeeAmount,
  parseWholeRupees,
  sanitizeWholeRupeeInput,
} from '@kumaran/api-client';

/**
 * Asserts that a value represents a valid non-negative whole integer Rupee amount.
 * Throws a descriptive RangeError if any decimal fractions, paise, or negative values are detected.
 *
 * @param amount Number, BigInt, or numeric string to validate.
 * @param context Optional context string for clearer error messages.
 */
export function assertWholeRupee(
  amount: number | bigint | string | null | undefined,
  context = 'Financial Amount',
): void {
  if (amount === null || amount === undefined) {
    return;
  }

  if (typeof amount === 'bigint') {
    if (amount < 0n) {
      throw new RangeError(
        `[Guardrail 2 Violation] ${context} cannot be negative. Received: ${amount}`,
      );
    }
    return;
  }

  if (typeof amount === 'number') {
    if (isNaN(amount) || !Number.isFinite(amount)) {
      throw new RangeError(
        `[Guardrail 2 Violation] ${context} must be a finite number. Received: ${amount}`,
      );
    }
    if (amount < 0) {
      throw new RangeError(
        `[Guardrail 2 Violation] ${context} cannot be negative. Received: ${amount}`,
      );
    }
    if (!Number.isInteger(amount)) {
      throw new RangeError(
        `[Guardrail 2 Violation] ${context} strictly forbids paise/decimals. Fractional rupees prohibited. Received: ${amount}`,
      );
    }
    return;
  }

  if (typeof amount === 'string') {
    const trimmed = amount.trim();
    if (trimmed.includes('.')) {
      throw new RangeError(
        `[Guardrail 2 Violation] ${context} contains decimal point (.): "${amount}". Whole rupees only.`,
      );
    }
    const num = Number(trimmed);
    if (isNaN(num) || !Number.isInteger(num) || num < 0) {
      throw new RangeError(
        `[Guardrail 2 Violation] ${context} must parse to a non-negative integer. Received: "${amount}"`,
      );
    }
  }
}

/**
 * Checks whether an input string represents a valid whole non-negative rupee number.
 */
export function isValidWholeRupeeInput(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed);
}

/**
 * Converts a whole rupee amount into human-readable Indian denomination words
 * (Crores, Lakhs, Thousands, or Rupees) for verification banners and bilingual receipts.
 * Strictly avoids decimal fractions.
 *
 * Examples:
 * - 10000000 -> "1 Crore"
 * - 500000 -> "5 Lakhs"
 * - 25000 -> "25 Thousand"
 * - 500 -> "₹500"
 */
export function formatRupeeWords(amount: number | bigint | string | null | undefined): string {
  if (amount === null || amount === undefined) {
    return '₹0';
  }

  const num = typeof amount === 'bigint' ? Number(amount) : typeof amount === 'string' ? parseInt(amount, 10) : amount;
  if (isNaN(num) || num === 0) {
    return '₹0';
  }

  if (num >= 10000000 && num % 10000000 === 0) {
    const crores = num / 10000000;
    return `${crores} ${crores === 1 ? 'Crore' : 'Crores'}`;
  }

  if (num >= 100000 && num % 100000 === 0) {
    const lakhs = num / 100000;
    return `${lakhs} ${lakhs === 1 ? 'Lakh' : 'Lakhs'}`;
  }

  if (num >= 1000 && num % 1000 === 0) {
    const thousands = num / 1000;
    return `${thousands} Thousand`;
  }

  return baseFormatRupee(num);
}
