// ==============================================================================
// Kumaran Chits — Client-Side Auth Store (Zustand)
// Manages authenticated staff identity, active branch context & session lifecycle.
// ==============================================================================

import { create } from 'zustand';
import {
  apiClient,
  unwrapApiResponse,
  getStoredAccessToken,
  getStoredRefreshToken,
  getStoredUserProfile,
  setStoredUserProfile,
  setStoredTokens,
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
  setAuth: (user: AuthUser, tokens: { accessToken: string; refreshToken?: string }) => void;
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
    // 1. Persist tokens and user profile in local storage bridge
    setStoredTokens(tokens);
    const activeBranchId = user.activeBranchId || user.branchId || null;
    setStoredUserProfile({ ...user, activeBranchId });

    // 2. Clear temporary 2FA challenge token from sessionStorage
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('kc_temp_token');
      } catch {
        // Safe fallback in restricted environments
      }
    }

    set({
      user: { ...user, activeBranchId },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || null,
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
    const hasToken = get().accessToken || getStoredAccessToken();

    // 1. Revoke active refresh token session in PostgreSQL backend
    if (hasToken) {
      try {
        await apiClient.POST('/api/v1/auth/logout');
      } catch (err) {
        // Network or timeout errors should not prevent local session termination
        console.warn('[AuthStore] Backend logout request failed, proceeding with local cleanup', err);
      }
    }

    // 2. Purge local storage tokens & temporary challenge tokens
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
    const token = getStoredAccessToken();
    const refreshToken = getStoredRefreshToken();
    const cachedProfile = getStoredUserProfile<AuthUser>();

    if (!token) {
      set({ isLoading: false, isAuthenticated: false, isHydrated: true, user: null });
      return;
    }

    // Immediately restore cached session from localStorage on client mount (0ms delay)
    if (cachedProfile) {
      const activeBranchId = cachedProfile.activeBranchId || cachedProfile.branchId || null;
      set({
        user: cachedProfile,
        accessToken: token,
        refreshToken: refreshToken || null,
        isAuthenticated: true,
        isHydrated: true,
        isLoading: false,
        activeBranchId,
      });
    }

    const state = get();
    if (state.isLoading) return;

    if (!cachedProfile) {
      set({ isLoading: true });
    }

    try {
      // Fetch authenticated user profile from backend
      const profile = await unwrapApiResponse<AuthUser>(
        apiClient.GET('/api/v1/auth/me'),
      );

      const activeBranchId = profile.activeBranchId || profile.branchId || null;
      const fullProfile = { ...profile, activeBranchId };

      setStoredUserProfile(fullProfile);

      set({
        user: fullProfile,
        accessToken: token,
        refreshToken: refreshToken || null,
        isAuthenticated: true,
        isLoading: false,
        isHydrated: true,
        activeBranchId,
        lastActivity: Date.now(),
      });
    } catch (err) {
      console.warn('[AuthStore] Session hydration failed, clearing session', err);
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
    }
  },
}));

// Initialize browser-side event listeners for multi-tab sync & unauthorized events
if (typeof window !== 'undefined') {
  window.addEventListener('kumaran:unauthorized', () => {
    useAuthStore.getState().logout('revoked');
  });

  window.addEventListener('kumaran:auth_change', (event: any) => {
    const detail = event?.detail;
    if (detail?.accessToken) {
      useAuthStore.setState({
        accessToken: detail.accessToken,
        refreshToken: detail.refreshToken || useAuthStore.getState().refreshToken,
      });
    }
  });
}
