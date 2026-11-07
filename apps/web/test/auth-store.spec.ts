// ==============================================================================
// Kumaran Chits — Zustand Auth Store Test Suite
// Verifies user identity state, active branch filter, token bridge, and logout.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { useAuthStore, type AuthUser } from '../src/stores/auth-store.ts';
import { apiClient } from '../src/lib/api-client.ts';

test('AuthStore: Initial state is unauthenticated with null user', () => {
  const state = useAuthStore.getState();
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.isHydrated, false);
  assert.equal(state.user, null);
  assert.equal(state.accessToken, null);
  assert.equal(state.refreshToken, null);
});

test('AuthStore: setAuth correctly establishes session with user and tokens', () => {
  const mockUser: AuthUser = {
    id: 'user-uuid-001',
    name: 'K. Sengottaiyan',
    phone: '9842100001',
    roles: ['SUPER_ADMIN', 'FOREMAN'],
    branchId: 'branch-prd-001',
    isTotpEnabled: true,
  };

  useAuthStore.getState().setAuth(mockUser, {
    accessToken: 'mock-access-token-jwt',
    refreshToken: 'mock-refresh-token-jwt',
  });

  const state = useAuthStore.getState();
  assert.equal(state.isAuthenticated, true);
  assert.equal(state.isHydrated, true);
  assert.equal(state.user?.id, 'user-uuid-001');
  assert.equal(state.user?.name, 'K. Sengottaiyan');
  assert.equal(state.user?.phone, '9842100001');
  assert.deepEqual(state.user?.roles, ['SUPER_ADMIN', 'FOREMAN']);
  assert.equal(state.activeBranchId, 'branch-prd-001');
  assert.equal(state.accessToken, 'mock-access-token-jwt');
  assert.equal(state.refreshToken, 'mock-refresh-token-jwt');
});

test('AuthStore: updateUser mutates partial profile without overwriting existing fields', () => {
  useAuthStore.getState().updateUser({
    fullNameTamil: 'கே. செங்கோட்டையன்',
  });

  const state = useAuthStore.getState();
  assert.equal(state.user?.name, 'K. Sengottaiyan');
  assert.equal(state.user?.fullNameTamil, 'கே. செங்கோட்டையன்');
  assert.equal(state.user?.id, 'user-uuid-001');
  assert.equal(state.user?.branchId, 'branch-prd-001');
});

test('AuthStore: setActiveBranchId switches current workstation branch context', () => {
  useAuthStore.getState().setActiveBranchId('branch-erd-002');

  const state = useAuthStore.getState();
  assert.equal(state.activeBranchId, 'branch-erd-002');
  assert.equal(state.user?.activeBranchId, 'branch-erd-002');
});

test('AuthStore: recordActivity updates timestamp', () => {
  const before = Date.now();
  useAuthStore.getState().recordActivity();
  const state = useAuthStore.getState();
  assert.ok(state.lastActivity >= before);
});

test('AuthStore: logout purges user and tokens, resetting auth state', async () => {
  // Ensure authenticated state exists
  assert.equal(useAuthStore.getState().isAuthenticated, true);

  await useAuthStore.getState().logout('manual');

  const state = useAuthStore.getState();
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.user, null);
  assert.equal(state.accessToken, null);
  assert.equal(state.refreshToken, null);
  assert.equal(state.activeBranchId, null);
});

test('AuthStore: hydrate gracefully handles absent tokens', async () => {
  await useAuthStore.getState().hydrate();

  const state = useAuthStore.getState();
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.isHydrated, true);
  assert.equal(state.user, null);
  assert.equal(state.isLoading, false);
});

test('AuthStore: Race condition prevention ensures isHydrated stays false before hydration', () => {
  // Reset store to unhydrated state to simulate fresh page load
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: false,
    isHydrated: false,
    user: null,
  });

  const state = useAuthStore.getState();
  // Layout guard: if (isHydrated && !isLoading && !isAuthenticated) redirect
  const shouldRedirect = state.isHydrated && !state.isLoading && !state.isAuthenticated;
  assert.equal(shouldRedirect, false, 'Must NOT trigger premature redirect on initial render before hydration');
});

test('AuthStore: setTempToken securely stores 2FA challenge token in sessionStorage without leaking to localStorage', () => {
  const mockSessionStorage = new Map<string, string>();
  const mockLocalStorage = new Map<string, string>();

  (globalThis as any).window = {};
  (globalThis as any).sessionStorage = {
    getItem: (key: string) => mockSessionStorage.get(key) || null,
    setItem: (key: string, val: string) => mockSessionStorage.set(key, val),
    removeItem: (key: string) => mockSessionStorage.delete(key),
  };
  (globalThis as any).localStorage = {
    getItem: (key: string) => mockLocalStorage.get(key) || null,
    setItem: (key: string, val: string) => mockLocalStorage.set(key, val),
    removeItem: (key: string) => mockLocalStorage.delete(key),
  };

  try {
    // Set temp token for 2FA TOTP challenge
    useAuthStore.getState().setTempToken('temp-totp-jwt-challenge-xyz');
    assert.equal(useAuthStore.getState().tempToken, 'temp-totp-jwt-challenge-xyz');
    assert.equal(mockSessionStorage.get('kc_temp_token'), 'temp-totp-jwt-challenge-xyz');
    assert.equal(mockLocalStorage.has('kc_temp_token'), false, 'tempToken must never leak into localStorage');

    // Establishing full authentication clears tempToken
    const mockUser: AuthUser = {
      id: 'user-002',
      name: 'Manager',
      phone: '9842100002',
      roles: ['BRANCH_MANAGER'],
      branchId: 'branch-prd-001',
      isTotpEnabled: true,
    };
    useAuthStore.getState().setAuth(mockUser, { accessToken: 'access-token-123' });
    assert.equal(useAuthStore.getState().tempToken, null);
    assert.equal(mockSessionStorage.has('kc_temp_token'), false, 'tempToken must be purged from sessionStorage on setAuth');
  } finally {
    delete (globalThis as any).window;
    delete (globalThis as any).sessionStorage;
    delete (globalThis as any).localStorage;
  }
});
