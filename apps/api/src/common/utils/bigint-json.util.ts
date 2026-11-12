/**
 * Explicit replacer for JSON.stringify that converts native 64-bit bigint values
 * into exact whole-number decimal strings without mutating BigInt.prototype.
 */
export function bigintSafeJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Serializes any payload containing bigint fields into JSON using exact decimal strings.
 */
export function stringifyBigIntSafe(data: unknown): string {
  return JSON.stringify(data, bigintSafeJsonReplacer);
}

/**
 * Revives a JSON-serialized bigint field (decimal string, bigint, or legacy safe integer number)
 * back into a native 64-bit bigint. Returns undefined for non-integer values.
 */
export function parseBigIntField(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  return undefined;
}
