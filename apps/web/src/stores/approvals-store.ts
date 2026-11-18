import { create } from 'zustand';
import { playNotificationChime } from '../lib/sound.ts';

export interface ApprovalsSummary {
  totalPendingCount: number;
  cashHandoversCount: number;
  disbursementAuthorizationsCount: number;
  paymentReversalsCount: number;
  safetyProofVerificationsCount: number;
  auctionFinalizationsCount?: number;
  auctionCorrectionsCount?: number;
  defaulterRemovalsCount?: number;
  finalMonthSettlementsCount?: number;
}

export interface ApprovalsState {
  totalPendingCount: number;
  cashHandoversCount: number;
  disbursementAuthorizationsCount: number;
  paymentReversalsCount: number;
  safetyProofVerificationsCount: number;
  auctionFinalizationsCount: number;
  auctionCorrectionsCount: number;
  defaulterRemovalsCount: number;
  finalMonthSettlementsCount: number;
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
  auctionFinalizationsCount: 0,
  auctionCorrectionsCount: 0,
  defaulterRemovalsCount: 0,
  finalMonthSettlementsCount: 0,
  isConnected: false,
  lastUpdated: null,

  setSummary: (summary) =>
    set((state) => {
      const cashHandovers = summary.cashHandoversCount ?? state.cashHandoversCount;
      const disbursements = summary.disbursementAuthorizationsCount ?? state.disbursementAuthorizationsCount;
      const reversals = summary.paymentReversalsCount ?? state.paymentReversalsCount;
      const safetyProofs = summary.safetyProofVerificationsCount ?? state.safetyProofVerificationsCount;
      const auctionFinalizations = summary.auctionFinalizationsCount ?? state.auctionFinalizationsCount;
      const auctionCorrections = summary.auctionCorrectionsCount ?? state.auctionCorrectionsCount;
      const defaulterRemovals = summary.defaulterRemovalsCount ?? state.defaulterRemovalsCount;
      const finalMonthSettlements = summary.finalMonthSettlementsCount ?? state.finalMonthSettlementsCount;
      const total =
        summary.totalPendingCount ??
        (cashHandovers +
          disbursements +
          reversals +
          safetyProofs +
          auctionFinalizations +
          auctionCorrections +
          defaulterRemovals +
          finalMonthSettlements);

      // Play subtle chime strictly when new approvals arrive while the session is live
      if (state.lastUpdated !== null && total > state.totalPendingCount) {
        playNotificationChime();
      }

      return {
        cashHandoversCount: cashHandovers,
        disbursementAuthorizationsCount: disbursements,
        paymentReversalsCount: reversals,
        safetyProofVerificationsCount: safetyProofs,
        auctionFinalizationsCount: auctionFinalizations,
        auctionCorrectionsCount: auctionCorrections,
        defaulterRemovalsCount: defaulterRemovals,
        finalMonthSettlementsCount: finalMonthSettlements,
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
      auctionFinalizationsCount: 0,
      auctionCorrectionsCount: 0,
      defaulterRemovalsCount: 0,
      finalMonthSettlementsCount: 0,
      isConnected: false,
      lastUpdated: null,
    }),
}));
