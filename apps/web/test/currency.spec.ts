// ==============================================================================
// Kumaran Chits — Web Currency Utilities Test Suite (Guardrail 2)
// Pure Whole Rupee Math: Zero paise, zero decimals (.00), BigInt / integer compatibility.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRupee,
  formatRupeeAmount,
  parseWholeRupees,
  assertWholeRupee,
  sanitizeWholeRupeeInput,
  isValidWholeRupeeInput,
  formatRupeeWords,
} from '../src/lib/currency.ts';

test('Guardrail 2: formatRupee correctly formats whole rupees without decimals', () => {
  assert.equal(formatRupee(0), '₹0');
  assert.equal(formatRupee(100000), '₹1,00,000');
  assert.equal(formatRupee(5000000n), '₹50,00,000');
  assert.equal(formatRupee('25000'), '₹25,000');
  assert.equal(formatRupee(null), '₹0');
  assert.equal(formatRupee(undefined), '₹0');

  // Verify that decimal fractions are never included
  const formatted = formatRupee(50000);
  assert.ok(!formatted.includes('.'), 'Formatted rupee must not contain decimal points');
  assert.ok(!formatted.includes('.00'), 'Formatted rupee must not contain .00 paise');
});

test('Guardrail 2: formatRupeeAmount produces comma-grouped whole integer strings', () => {
  assert.equal(formatRupeeAmount(100000), '1,00,000');
  assert.equal(formatRupeeAmount(5000000n), '50,00,000');
  assert.equal(formatRupeeAmount(0), '0');
  assert.equal(formatRupeeAmount(null), '0');
  assert.equal(formatRupeeAmount(undefined), '0');
});

test('Guardrail 2: parseWholeRupees converts inputs to integer rupees, stripping decimals', () => {
  assert.equal(parseWholeRupees(1500.99), 1500);
  assert.equal(parseWholeRupees('₹25,000'), 25000);
  assert.equal(parseWholeRupees('1,00,000'), 100000);
  assert.equal(parseWholeRupees('₹500.50'), 50050);
});

test('Guardrail 2: assertWholeRupee rejects negative numbers, fractions, and paise', () => {
  // Valid amounts should pass without throwing
  assert.doesNotThrow(() => assertWholeRupee(1000));
  assert.doesNotThrow(() => assertWholeRupee(0));
  assert.doesNotThrow(() => assertWholeRupee(5000000n));
  assert.doesNotThrow(() => assertWholeRupee('25000'));
  assert.doesNotThrow(() => assertWholeRupee(null));
  assert.doesNotThrow(() => assertWholeRupee(undefined));

  // Invalid amounts must throw RangeError
  assert.throws(() => assertWholeRupee(-100), /cannot be negative/);
  assert.throws(() => assertWholeRupee(-500n), /cannot be negative/);
  assert.throws(() => assertWholeRupee(100.5), /forbids paise\/decimals/);
  assert.throws(() => assertWholeRupee('100.50'), /contains decimal point/);
  assert.throws(() => assertWholeRupee(NaN), /must be a finite number/);
  assert.throws(() => assertWholeRupee(Infinity), /must be a finite number/);
});

test('Guardrail 2: sanitizeWholeRupeeInput strips non-digits and leading zeros', () => {
  assert.equal(sanitizeWholeRupeeInput('1000.50'), '100050');
  assert.equal(sanitizeWholeRupeeInput('abc₹500'), '500');
  assert.equal(sanitizeWholeRupeeInput('00500'), '500');
  assert.equal(sanitizeWholeRupeeInput('0'), '0');
  assert.equal(sanitizeWholeRupeeInput(''), '');
  assert.equal(sanitizeWholeRupeeInput('-25000'), '25000');
});

test('Guardrail 2: isValidWholeRupeeInput validates whole integer strings', () => {
  assert.equal(isValidWholeRupeeInput('50000'), true);
  assert.equal(isValidWholeRupeeInput('0'), true);
  assert.equal(isValidWholeRupeeInput('100.00'), false);
  assert.equal(isValidWholeRupeeInput('-500'), false);
  assert.equal(isValidWholeRupeeInput('abc'), false);
  assert.equal(isValidWholeRupeeInput(''), false);
});

test('Guardrail 2: formatRupeeWords converts integer amounts to Indian denominations', () => {
  assert.equal(formatRupeeWords(10000000), '1 Crore');
  assert.equal(formatRupeeWords(20000000), '2 Crores');
  assert.equal(formatRupeeWords(500000), '5 Lakhs');
  assert.equal(formatRupeeWords(100000), '1 Lakh');
  assert.equal(formatRupeeWords(25000), '25 Thousand');
  assert.equal(formatRupeeWords(500), '₹500');
  assert.equal(formatRupeeWords(0), '₹0');
  assert.equal(formatRupeeWords(null), '₹0');
});
