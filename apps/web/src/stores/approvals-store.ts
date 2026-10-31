import { create } from 'zustand';

export interface ApprovalsSummary {
  totalPendingCount: number;
  cashHandoversCount: number;
  disbursementAuthorizationsCount: number;
  paymentReversalsCount: number;
}

export interface ApprovalsState {
  totalPendingCount: number;
  cashHandoversCount: number;
  disbursementAuthorizationsCount: number;
  paymentReversalsCount: number;
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
  isConnected: false,
  lastUpdated: null,

  setSummary: (summary) =>
    set((state) => {
      const cashHandovers = summary.cashHandoversCount ?? state.cashHandoversCount;
      const disbursements = summary.disbursementAuthorizationsCount ?? state.disbursementAuthorizationsCount;
      const reversals = summary.paymentReversalsCount ?? state.paymentReversalsCount;
      const total =
        summary.totalPendingCount ?? (cashHandovers + disbursements + reversals);

      return {
        cashHandoversCount: cashHandovers,
        disbursementAuthorizationsCount: disbursements,
        paymentReversalsCount: reversals,
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
      isConnected: false,
      lastUpdated: null,
    }),
}));
