import { create } from 'zustand';
import { playNotificationChime } from '../lib/sound.ts';

export interface ApprovalsSummary {
  totalPendingCount: number;
  cashHandoversCount: number;
  disbursementAuthorizationsCount: number;
  paymentReversalsCount: number;
  safetyProofVerificationsCount: number;
}

export interface ApprovalsState {
  totalPendingCount: number;
  cashHandoversCount: number;
  disbursementAuthorizationsCount: number;
  paymentReversalsCount: number;
  safetyProofVerificationsCount: number;
  isConnected: boolean;
  lastUpdated: number | null;
  setSummary: (summary: Partial<ApprovalsSummary>) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

export const useApprovalsStore = create<ApprovalsState>((set) => ({
  totalPendingCount: 0,
  cashHandoversCount: 0,
  disbursementAuthorizationsCount: 0,
  paymentReversalsCount: 0,
  safetyProofVerificationsCount: 0,
  isConnected: false,
  lastUpdated: null,

  setSummary: (summary) =>
    set((state) => {
      const cashHandovers = summary.cashHandoversCount ?? state.cashHandoversCount;
      const disbursements = summary.disbursementAuthorizationsCount ?? state.disbursementAuthorizationsCount;
      const reversals = summary.paymentReversalsCount ?? state.paymentReversalsCount;
      const safetyProofs = summary.safetyProofVerificationsCount ?? state.safetyProofVerificationsCount;
      const total =
        summary.totalPendingCount ?? (cashHandovers + disbursements + reversals + safetyProofs);

      // Play subtle chime strictly when new approvals arrive while the session is live
      if (state.lastUpdated !== null && total > state.totalPendingCount) {
        playNotificationChime();
      }

      return {
        cashHandoversCount: cashHandovers,
        disbursementAuthorizationsCount: disbursements,
        paymentReversalsCount: reversals,
        safetyProofVerificationsCount: safetyProofs,
        totalPendingCount: total,
        lastUpdated: Date.now(),
      };
    }),

  setConnected: (connected) => set({ isConnected: connected }),

  reset: () =>
    set({
      totalPendingCount: 0,
      cashHandoversCount: 0,
      disbursementAuthorizationsCount: 0,
      paymentReversalsCount: 0,
      safetyProofVerificationsCount: 0,
      isConnected: false,
      lastUpdated: null,
    }),
}));
