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
  pendingTotp: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  activeBranchId: string | null;
  lastActivity: number;
}

export interface AuthActions {
  setAuth: (user: AuthUser, tokens?: { accessToken?: string; refreshToken?: string }) => void;
  setPendingTotp: (pending: boolean) => void;
  updateUser: (partial: Partial<AuthUser>) => void;
  setActiveBranchId: (branchId: string | null) => void;
  recordActivity: () => void;
  logout: (reason?: 'manual' | 'timeout' | 'revoked') => Promise<void>;
  hydrate: () => Promise<void>;
}

let isLoggingOut = false;

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  pendingTotp: false,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,
  activeBranchId: null,
  lastActivity: Date.now(),

  setPendingTotp: (pending) => {
    set({ pendingTotp: pending });
  },

  setAuth: (user, tokens) => {
    const activeBranchId = user.activeBranchId || user.branchId || null;
    const fullUser = { ...user, activeBranchId };

    // Persist non-sensitive cached user profile for fast initial paint
    setStoredUserProfile(fullUser);

    set({
      user: fullUser,
      accessToken: tokens?.accessToken || null,
      refreshToken: tokens?.refreshToken || null,
      pendingTotp: false,
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
    if (isLoggingOut) {
      return;
    }
    isLoggingOut = true;

    try {
      // 1. Notify Next.js BFF logout handler (which revokes tokens in NestJS & Redis and clears HttpOnly cookies)
      try {
        if (typeof window !== 'undefined') {
          await fetch('/api/auth/logout', { method: 'POST' });
        }
      } catch (err) {
        console.warn('[AuthStore] BFF logout request failed, proceeding with local cleanup', err);
      }

      // 2. Purge local profile cache WITHOUT re-dispatching kumaran:unauthorized
      clearStoredTokens({ notify: false });

      // 3. Reset store state
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        pendingTotp: false,
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
    } finally {
      isLoggingOut = false;
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
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (data?.authenticated && data.user) {
        const activeBranchId = data.user.activeBranchId || data.user.branchId || null;
        const fullProfile = { ...data.user, activeBranchId };
        setStoredUserProfile(fullProfile);

        set({
          user: fullProfile,
          isAuthenticated: true,
          pendingTotp: false,
          isLoading: false,
          isHydrated: true,
          activeBranchId,
          lastActivity: Date.now(),
        });
        return;
      }

      // Session is not valid: clear cached profile quietly without triggering logout storm
      clearStoredTokens({ notify: false });
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        pendingTotp: Boolean(data?.pendingTotp),
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
    const state = useAuthStore.getState();
    if (state.isAuthenticated && !isLoggingOut) {
      void state.logout('revoked');
    }
  });

  window.addEventListener('kumaran:auth_change', () => {
    // Re-verify session on auth change event
    useAuthStore.getState().hydrate();
  });
}
