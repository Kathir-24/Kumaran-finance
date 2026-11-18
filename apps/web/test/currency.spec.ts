// ==============================================================================
// Kumaran Chits — Web Currency Utilities Test Suite (Guardrail 2)
// Pure Whole Rupee Math: Zero paise, zero decimals (.00), BigInt / integer compatibility.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  assert.equal(formatRupee(9007199254740993n), '₹9,00,71,99,25,47,40,993');
  assert.equal(formatRupee('9007199254740993'), '₹9,00,71,99,25,47,40,993');
  assert.equal(formatRupee('1,00,000'), '₹1,00,000');

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

test('Guardrail 2: parseWholeRupees splits on decimal points without 100x paise concatenation (DEF-FE-10)', () => {
  assert.equal(parseWholeRupees(1500.99), 1500);
  assert.equal(parseWholeRupees('₹25,000'), 25000);
  assert.equal(parseWholeRupees('1,00,000'), 100000);
  assert.equal(parseWholeRupees('₹500.50'), 500);
  assert.equal(parseWholeRupees('25000.50'), 25000);
  assert.equal(parseWholeRupees('100000.00'), 100000);
  assert.equal(parseWholeRupees('  INR 1,00,000.75 '), 100000);
  assert.equal(parseWholeRupees('25,000.50.10'), 25000);
  assert.equal(parseWholeRupees('.50'), 0);
  assert.equal(parseWholeRupees('0.99'), 0);
  assert.equal(parseWholeRupees('₹.99'), 0);
  assert.equal(parseWholeRupees(Number.NaN), 0);
  assert.equal(parseWholeRupees(Number.POSITIVE_INFINITY), 0);
  assert.equal(Object.is(parseWholeRupees(-0.5), 0), true);
  assert.equal(parseWholeRupees(null as unknown as string), 0);
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

test('Guardrail 2: sanitizeWholeRupeeInput drops decimal fractions, strips non-digits and leading zeros (DEF-FE-10)', () => {
  assert.equal(sanitizeWholeRupeeInput('1000.50'), '1000');
  assert.equal(sanitizeWholeRupeeInput('22000.50'), '22000');
  assert.equal(sanitizeWholeRupeeInput('₹25,000.99'), '25000');
  assert.equal(sanitizeWholeRupeeInput('1000.'), '1000');
  assert.equal(sanitizeWholeRupeeInput('.50'), '');
  assert.equal(sanitizeWholeRupeeInput('0.50'), '0');
  assert.equal(sanitizeWholeRupeeInput('00500.25'), '500');
  assert.equal(sanitizeWholeRupeeInput('000'), '0');
  assert.equal(sanitizeWholeRupeeInput('abc₹500'), '500');
  assert.equal(sanitizeWholeRupeeInput('00500'), '500');
  assert.equal(sanitizeWholeRupeeInput('0'), '0');
  assert.equal(sanitizeWholeRupeeInput(''), '');
  assert.equal(sanitizeWholeRupeeInput('-25000.50'), '25000');
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

test('DEF-FE-10 (N5): Web currency helpers share compiled @kumaran/api-client dist/ implementation with zero duplicate sanitization logic', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webCurrencyPath = path.resolve(__dirname, '../src/lib/currency.ts');
  const sdkDistCurrencyPath = path.resolve(
    __dirname,
    '../../../packages/api-client/dist/utils/currency.js',
  );

  const webCurrencySource = fs.readFileSync(webCurrencyPath, 'utf-8');
  assert.match(webCurrencySource, /sanitizeWholeRupeeInput/);
  assert.match(webCurrencySource, /from '@kumaran\/api-client'/);
  assert.doesNotMatch(
    webCurrencySource,
    /replace\s*\(\s*\/\\D\/g/,
    'apps/web/src/lib/currency.ts must re-export sanitizeWholeRupeeInput from @kumaran/api-client instead of duplicating digit regexes',
  );

  const sdkDistSource = fs.readFileSync(sdkDistCurrencyPath, 'utf-8');
  assert.match(
    sdkDistSource,
    /\.split\(['"]\.['"]\)/,
    'packages/api-client/dist/utils/currency.js must be rebuilt with DEF-FE-10 decimal-split fix',
  );
});
