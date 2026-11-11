// ==============================================================================
// Kumaran Chits — Shared Whole-Rupee Parsing & Fail-Closed BigInt Guards
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: AGENTS.md Guardrail 2 & financial-rules.md §9 (Zero Paise / Zero Floats)
// ==============================================================================

import { BadRequestException } from '@nestjs/common';

/**
 * Maximum integer safely representable in JSON/IEEE-754 without single-Rupee precision loss.
 */
export const MAX_SAFE_WHOLE_RUPEE = Number.MAX_SAFE_INTEGER;

/**
 * Strict class-transformer normalizer for monetary DTO inputs.
 *
 * Preserves undefined and null so:
 * - Required fields with @IsNotEmpty() + @IsInt() fail closed on null/undefined
 * - Optional fields (@IsOptional()) remain backward-compatible with Flutter Dart toJson() nulls
 * Rejects booleans (true/false -> 1/0), empty/whitespace strings ("" -> 0), objects, and arrays
 * by returning NaN so @IsInt() fails closed with HTTP 400.
 */
export function parseStrictWholeRupeeValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  if (
    typeof value === 'boolean' ||
    Array.isArray(value) ||
    typeof value === 'object'
  ) {
    return Number.NaN;
  }

  if (typeof value === 'string') {
    if (value.trim() === '') {
      return Number.NaN;
    }
    return Number(value);
  }

  if (typeof value === 'number') {
    return value;
  }

  return Number.NaN;
}

/**
 * Converts a Rupee input number/bigint into 64-bit integer BigInt without truncating paise.
 * Fails closed with BadRequestException on fractional decimals, NaN/Infinity, precision overflow,
 * or lower-bound violations (enforcing financial-rules.md §9.1 zero-Math.floor mandate).
 */
export function toWholeRupeeBigInt(
  value: number | bigint,
  fieldName: string,
  options?: { min?: bigint },
): bigint {
  let result: bigint;

  if (typeof value === 'bigint') {
    result = value;
  } else {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      !Number.isInteger(value)
    ) {
      throw new BadRequestException(
        `${fieldName} must be a whole Rupee integer amount (zero paise/decimals)`,
      );
    }

    if (!Number.isSafeInteger(value)) {
      throw new BadRequestException(
        `${fieldName} exceeds maximum safe whole-Rupee integer precision`,
      );
    }

    result = BigInt(value);
  }

  if (options?.min !== undefined && result < options.min) {
    throw new BadRequestException(
      options.min === 0n
        ? `${fieldName} cannot be negative`
        : `${fieldName} must be at least ₹${options.min.toString()}`,
    );
  }

  return result;
}
