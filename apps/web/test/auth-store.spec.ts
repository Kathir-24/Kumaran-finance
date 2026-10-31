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
  assert.equal(state.user, null);
  assert.equal(state.isLoading, false);
});
