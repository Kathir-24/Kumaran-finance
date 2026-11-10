// ==============================================================================
// Kumaran Chits — Client-Side Auth Store (Zustand)
// BFF + HttpOnly Cookie Architecture: zero secret tokens in client state.
// ==============================================================================

import { create } from 'zustand';
import {
  getStoredUserProfile,
  setStoredUserProfile,
  clearStoredTokens,
} from '../lib/api-client.ts';

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  roles: string[];
  branchId?: string | null;
  activeBranchId?: string | null;
  isTotpEnabled?: boolean;
  hasMpin?: boolean;
  fullNameTamil?: string | null;
  customerCode?: string;
  lastLoginAt?: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  tempToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  activeBranchId: string | null;
  lastActivity: number;
}

export interface AuthActions {
  setAuth: (user: AuthUser, tokens?: { accessToken?: string; refreshToken?: string }) => void;
  setTempToken: (token: string | null) => void;
  updateUser: (partial: Partial<AuthUser>) => void;
  setActiveBranchId: (branchId: string | null) => void;
  recordActivity: () => void;
  logout: (reason?: 'manual' | 'timeout' | 'revoked') => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  tempToken: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,
  activeBranchId: null,
  lastActivity: Date.now(),

  setTempToken: (token) => {
    if (typeof window !== 'undefined') {
      try {
        if (token) {
          sessionStorage.setItem('kc_temp_token', token);
        } else {
          sessionStorage.removeItem('kc_temp_token');
        }
      } catch {
        // Safe fallback in restricted environments
      }
    }
    set({ tempToken: token });
  },

  setAuth: (user, tokens) => {
    const activeBranchId = user.activeBranchId || user.branchId || null;
    const fullUser = { ...user, activeBranchId };

    // Persist non-sensitive cached user profile for fast initial paint
    setStoredUserProfile(fullUser);

    // Clear temporary 2FA challenge token from sessionStorage
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('kc_temp_token');
      } catch {
        // Safe fallback in restricted environments
      }
    }

    set({
      user: fullUser,
      accessToken: tokens?.accessToken || null,
      refreshToken: tokens?.refreshToken || null,
      tempToken: null,
      isAuthenticated: true,
      isLoading: false,
      isHydrated: true,
      activeBranchId,
      lastActivity: Date.now(),
    });
  },

  updateUser: (partial) => {
    const currentUser = get().user;
    if (!currentUser) return;
    const updated = { ...currentUser, ...partial };
    setStoredUserProfile(updated);
    set({
      user: updated,
    });
  },

  setActiveBranchId: (branchId) => {
    set({ activeBranchId: branchId });
    const currentUser = get().user;
    if (currentUser) {
      const updated = { ...currentUser, activeBranchId: branchId };
      setStoredUserProfile(updated);
      set({ user: updated });
    }
  },

  recordActivity: () => {
    set({ lastActivity: Date.now() });
  },

  logout: async (reason = 'manual') => {
    // 1. Notify Next.js BFF logout handler (which revokes tokens in NestJS & Redis and clears HttpOnly cookies)
    try {
      if (typeof window !== 'undefined') {
        await fetch('/api/auth/logout', { method: 'POST' });
      }
    } catch (err) {
      console.warn('[AuthStore] BFF logout request failed, proceeding with local cleanup', err);
    }

    // 2. Purge local profile cache & temporary challenge tokens
    clearStoredTokens();
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('kc_temp_token');
      } catch {
        // Safe fallback in restricted environments
      }
    }

    // 3. Reset store state
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      tempToken: null,
      isAuthenticated: false,
      isLoading: false,
      isHydrated: true,
      activeBranchId: null,
    });

    // 4. In browser, navigate to login with query reason if not already there
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      if (!currentPath.includes('/login')) {
        window.location.href = `/login?reason=${reason}`;
      }
    }
  },

  hydrate: async () => {
    const cachedProfile = getStoredUserProfile<AuthUser>();

    // Immediately restore cached non-sensitive user profile on client mount for 0ms visual render
    if (cachedProfile) {
      const activeBranchId = cachedProfile.activeBranchId || cachedProfile.branchId || null;
      set({
        user: cachedProfile,
        isAuthenticated: true,
        isHydrated: true,
        isLoading: false,
        activeBranchId,
      });
    }

    // In non-browser environments, conclude hydration
    if (typeof window === 'undefined') {
      set({ isHydrated: true, isLoading: false });
      return;
    }

    try {
      // Validate session with Next.js BFF session handler
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          const activeBranchId = data.user.activeBranchId || data.user.branchId || null;
          const fullProfile = { ...data.user, activeBranchId };
          setStoredUserProfile(fullProfile);

          set({
            user: fullProfile,
            isAuthenticated: true,
            isLoading: false,
            isHydrated: true,
            activeBranchId,
            lastActivity: Date.now(),
          });
          return;
        }
      }

      // Session is not valid
      clearStoredTokens();
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        isHydrated: true,
        activeBranchId: null,
      });
    } catch (err) {
      console.warn('[AuthStore] Session hydration failed', err);
      set({
        isLoading: false,
        isHydrated: true,
      });
    }
  },
}));

// Initialize browser-side event listeners for multi-tab sync & unauthorized events
if (typeof window !== 'undefined') {
  window.addEventListener('kumaran:unauthorized', () => {
    useAuthStore.getState().logout('revoked');
  });

  window.addEventListener('kumaran:auth_change', () => {
    // Re-verify session on auth change event
    useAuthStore.getState().hydrate();
  });
}
