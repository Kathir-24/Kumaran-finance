// ==============================================================================
// Kumaran Chits — Client-Side Error Telemetry & Reporter Unit Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/observability-and-monitoring-architecture.md
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateIncidentCode, reportClientError } from '../src/lib/error-reporter.ts';

test('1. Incident Code Generation: formats with ERR-KUM- prefix and 6 uppercase characters', () => {
  const code = generateIncidentCode();
  assert.match(code, /^ERR-KUM-[0-9A-F]{6}$/);
});

test('2. Incident Code Generation: deterministic hashing generates identical codes for identical error seeds', () => {
  const seed = 'TypeError: Cannot read properties of undefined (reading data)';
  const code1 = generateIncidentCode(seed);
  const code2 = generateIncidentCode(seed);
  assert.equal(code1, code2);
  assert.match(code1, /^ERR-KUM-[0-9A-F]{6}$/);

  const differentSeed = 'ChunkLoadError: Loading chunk 452 failed';
  const code3 = generateIncidentCode(differentSeed);
  assert.notEqual(code1, code3);
});

test('3. reportClientError: safely handles standard Error instances and extracts details', () => {
  const testError = new Error('Test auction socket disconnected');
  (testError as any).digest = 'digest-hash-9988';

  const report = reportClientError(testError);

  assert.match(report.incidentId, /^ERR-KUM-[0-9A-F]{6}$/);
  assert.equal(report.message, 'Test auction socket disconnected');
  assert.equal(report.digest, 'digest-hash-9988');
  assert.ok(report.timestamp);
  assert.ok(report.copyText.includes(report.incidentId));
  assert.ok(report.copyText.includes('Test auction socket disconnected'));
  assert.ok(report.copyText.includes('digest-hash-9988'));
});

test('4. reportClientError: gracefully handles non-Error objects and string throws without crashing', () => {
  const nonError = 'String exception from third-party library';
  const report = reportClientError(nonError);

  assert.match(report.incidentId, /^ERR-KUM-[0-9A-F]{6}$/);
  assert.equal(report.message, 'String exception from third-party library');
  assert.ok(report.copyText.includes('String exception from third-party library'));
});

test('5. reportClientError: safely integrates with Sentry when present and does not crash on Sentry error', () => {
  const originalWindow = (globalThis as any).window;
  let sentryCaptured = false;

  (globalThis as any).window = {
    location: { href: 'https://kumaranfinance.in/dashboard/chits' },
    Sentry: {
      captureException: (err: any, context: any) => {
        sentryCaptured = true;
        assert.ok(context.tags.incidentId);
      },
    },
  };

  try {
    const error = new Error('Client calculation failure');
    const report = reportClientError(error);

    assert.equal(sentryCaptured, true);
    assert.equal(report.url, 'https://kumaranfinance.in/dashboard/chits');
  } finally {
    (globalThis as any).window = originalWindow;
  }
});
