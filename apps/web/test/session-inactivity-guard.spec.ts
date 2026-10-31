// ==============================================================================
// Kumaran Chits — Session Inactivity Guardian Logic Test Suite
// Verifies 20-minute timeout math, 18-minute warning detection, and countdown logic.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Pure state machine evaluator for inactivity idle times matching SessionInactivityGuard.
 */
function evaluateInactivity(
  idleMs: number,
  timeoutMs = 20 * 60 * 1000,
  warningMs = 18 * 60 * 1000,
) {
  if (idleMs >= timeoutMs) {
    return {
      status: 'TIMEOUT' as const,
      isWarningOpen: false,
      secondsRemaining: 0,
    };
  }

  if (idleMs >= warningMs) {
    const secondsRemaining = Math.max(0, Math.ceil((timeoutMs - idleMs) / 1000));
    return {
      status: 'WARNING' as const,
      isWarningOpen: true,
      secondsRemaining,
    };
  }

  return {
    status: 'ACTIVE' as const,
    isWarningOpen: false,
    secondsRemaining: Math.ceil((timeoutMs - idleMs) / 1000),
  };
}

test('InactivityGuard: Active state when idle time is under 18 minutes', () => {
  // 5 minutes idle
  const state5m = evaluateInactivity(5 * 60 * 1000);
  assert.equal(state5m.status, 'ACTIVE');
  assert.equal(state5m.isWarningOpen, false);
  assert.equal(state5m.secondsRemaining, 15 * 60);

  // 17 minutes 59 seconds idle
  const state17m59s = evaluateInactivity(17 * 60 * 1000 + 59 * 1000);
  assert.equal(state17m59s.status, 'ACTIVE');
  assert.equal(state17m59s.isWarningOpen, false);
  assert.equal(state17m59s.secondsRemaining, 121);
});

test('InactivityGuard: Warning state triggers at exactly 18 minutes (1,080,000 ms)', () => {
  // Exactly 18 minutes idle
  const state18m = evaluateInactivity(18 * 60 * 1000);
  assert.equal(state18m.status, 'WARNING');
  assert.equal(state18m.isWarningOpen, true);
  assert.equal(state18m.secondsRemaining, 120); // 2-minute countdown (120s)

  // 19 minutes idle (60 seconds left)
  const state19m = evaluateInactivity(19 * 60 * 1000);
  assert.equal(state19m.status, 'WARNING');
  assert.equal(state19m.isWarningOpen, true);
  assert.equal(state19m.secondsRemaining, 60);

  // 19 minutes 55 seconds idle (5 seconds left)
  const state19m55s = evaluateInactivity(19 * 60 * 1000 + 55 * 1000);
  assert.equal(state19m55s.status, 'WARNING');
  assert.equal(state19m55s.isWarningOpen, true);
  assert.equal(state19m55s.secondsRemaining, 5);
});

test('InactivityGuard: Timeout triggers at 20 minutes (1,200,000 ms)', () => {
  // Exactly 20 minutes idle
  const state20m = evaluateInactivity(20 * 60 * 1000);
  assert.equal(state20m.status, 'TIMEOUT');
  assert.equal(state20m.isWarningOpen, false);
  assert.equal(state20m.secondsRemaining, 0);

  // Past 20 minutes (e.g. 21 minutes)
  const state21m = evaluateInactivity(21 * 60 * 1000);
  assert.equal(state21m.status, 'TIMEOUT');
  assert.equal(state21m.isWarningOpen, false);
  assert.equal(state21m.secondsRemaining, 0);
});

test('InactivityGuard: Reset action restores status to ACTIVE and clears countdown', () => {
  // In warning state at 19 minutes
  let idleMs = 19 * 60 * 1000;
  let state = evaluateInactivity(idleMs);
  assert.equal(state.status, 'WARNING');
  assert.equal(state.isWarningOpen, true);

  // User moves mouse or clicks "Stay Logged In" -> idle time resets to 0
  idleMs = 0;
  state = evaluateInactivity(idleMs);
  assert.equal(state.status, 'ACTIVE');
  assert.equal(state.isWarningOpen, false);
  assert.equal(state.secondsRemaining, 20 * 60);
});

test('InactivityGuard: Custom threshold configuration operates accurately', () => {
  // Custom test thresholds: 2000ms timeout, 1800ms warning
  const customTimeout = 2000;
  const customWarning = 1800;

  assert.equal(evaluateInactivity(1000, customTimeout, customWarning).status, 'ACTIVE');
  assert.equal(evaluateInactivity(1800, customTimeout, customWarning).status, 'WARNING');
  assert.equal(evaluateInactivity(1800, customTimeout, customWarning).secondsRemaining, 1);
  assert.equal(evaluateInactivity(2000, customTimeout, customWarning).status, 'TIMEOUT');
});
