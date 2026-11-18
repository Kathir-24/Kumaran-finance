// ==============================================================================
// Kumaran Chits — Pure Whole-Rupee BigInt Auction Math Helpers (Guardrails 2, 3, 4, 6)
// Zero IEEE-754 floating-point arithmetic; supports frozen commission rate & KFC-FIN-002.
// ==============================================================================

export const MAX_SAFE_WHOLE_RUPEE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Pure string-to-BigInt whole-Rupee parser (Guardrail 2 / XR-WM-05).
 * Never passes arbitrary user strings through Number/parseInt so 310+ digit pastes
 * never overflow to Infinity or throw RangeError when converted to BigInt.
 */
export function parseWholeRupeesBigInt(value: string | null | undefined): bigint {
  if (!value || typeof value !== 'string') return 0n;
  const integerPart = value.split('.')[0] ?? '';
  const digitsOnly = integerPart.replace(/[^0-9]/g, '');
  if (!digitsOnly) return 0n;
  try {
    return BigInt(digitsOnly);
  } catch {
    return 0n;
  }
}

/**
 * Safely converts a BigInt, integer number, or numeric string to a non-negative BigInt.
 * Rejects fractional/non-numeric noise by taking only the integer portion before any decimal.
 */
export function toSafeWholeRupeeBigInt(
  value: bigint | number | string | null | undefined,
  fallback = 0n,
): bigint {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'bigint') return value >= 0n ? value : fallback;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return fallback;
    return BigInt(Math.trunc(value));
  }
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const intPart = trimmed.split('.')[0]?.replace(/[^0-9]/g, '') ?? '';
  if (!intPart) return fallback;
  try {
    return BigInt(intPart);
  } catch {
    return fallback;
  }
}

/**
 * Computes Foreman Commission in whole integer Rupees from a frozen rate (defaults to 4.00%).
 * Converts percentage rate (e.g. 4, "4.00", 5.5) into basis points using integer math.
 */
export function computeForemanCommissionBigInt(
  chitValue: bigint,
  frozenRatePercent?: number | string | null,
): bigint {
  let basisPoints = 400n; // Default 4.00% (Guardrail 3 / ADR-04)
  if (frozenRatePercent !== null && frozenRatePercent !== undefined) {
    const raw = String(frozenRatePercent).trim();
    if (/^\d+(\.\d{1,2})?$/.test(raw)) {
      const [whole, frac = ''] = raw.split('.');
      const paddedFrac = (frac + '00').slice(0, 2);
      const parsedBp = BigInt(whole) * 100n + BigInt(paddedFrac);
      if (parsedBp > 0n && parsedBp <= 10000n) {
        basisPoints = parsedBp;
      }
    }
  }
  return (chitValue * basisPoints) / 10000n;
}

/**
 * Computes fixed 1/4 ceiling discount (D_max = V / 4) using exact BigInt division (Guardrail 6).
 */
export function computeCeilingDiscountBigInt(
  chitValue: bigint,
  explicitMaxCeiling?: bigint | number | string | null,
): bigint {
  if (explicitMaxCeiling !== null && explicitMaxCeiling !== undefined) {
    const parsed = toSafeWholeRupeeBigInt(explicitMaxCeiling, 0n);
    if (parsed > 0n) return parsed;
  }
  return chitValue / 4n;
}

export interface AuctionBidPreview {
  foremanCommission: bigint;
  ceilingDiscount: bigint;
  baseInstallment: bigint;
  totalDividend: bigint;
  dividendRemainder: bigint;
  isDivisible: boolean;
  dividendPerTicket: bigint;
  nextMonthNetInstallment: bigint;
  netPrizeMoney: bigint;
  isFloorViolated: boolean;
  isCeilingViolated: boolean;
  isCeilingReached: boolean;
}

/**
 * Computes real-time BigInt auction breakdown & validates Guardrails 2, 3, 4, 6 + KFC-FIN-002.
 */
export function computeAuctionBidPreview(params: {
  chitValue: bigint;
  totalTickets: number;
  bidDiscount: bigint;
  frozenCommissionRate?: number | string | null;
  maxDiscountCeiling?: bigint | number | string | null;
  explicitBaseInstallment?: bigint | number | string | null;
}): AuctionBidPreview {
  const ticketsBig = BigInt(Math.max(1, Math.trunc(params.totalTickets || 1)));
  const foremanCommission = computeForemanCommissionBigInt(
    params.chitValue,
    params.frozenCommissionRate,
  );
  const ceilingDiscount = computeCeilingDiscountBigInt(
    params.chitValue,
    params.maxDiscountCeiling,
  );
  const baseInstallment =
    params.explicitBaseInstallment !== undefined && params.explicitBaseInstallment !== null
      ? toSafeWholeRupeeBigInt(params.explicitBaseInstallment, params.chitValue / ticketsBig)
      : params.chitValue / ticketsBig;

  const isFloorViolated = params.bidDiscount < foremanCommission;
  const isCeilingViolated = params.bidDiscount > ceilingDiscount;
  const isCeilingReached = params.bidDiscount === ceilingDiscount;

  const totalDividend =
    params.bidDiscount >= foremanCommission ? params.bidDiscount - foremanCommission : 0n;
  const dividendRemainder = totalDividend % ticketsBig;
  const isDivisible = !isFloorViolated && !isCeilingViolated && dividendRemainder === 0n;
  const dividendPerTicket = totalDividend / ticketsBig;
  const nextMonthNetInstallment =
    baseInstallment >= dividendPerTicket ? baseInstallment - dividendPerTicket : 0n;
  const netPrizeMoney =
    params.chitValue >= params.bidDiscount ? params.chitValue - params.bidDiscount : 0n;

  return {
    foremanCommission,
    ceilingDiscount,
    baseInstallment,
    totalDividend,
    dividendRemainder,
    isDivisible,
    dividendPerTicket,
    nextMonthNetInstallment,
    netPrizeMoney,
    isFloorViolated,
    isCeilingViolated,
    isCeilingReached,
  };
}
