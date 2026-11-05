// ==============================================================================
// Kumaran Chits — TanStack Query v5 Key Factory
// Centralized, type-safe cache keys matching the master invalidation graph.
// ==============================================================================

export const queryKeys = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    kpis: (branchId?: string) => ['dashboard', 'kpis', { branchId }] as const,
  },
  branches: {
    all: ['branches'] as const,
    list: () => ['branches', 'list'] as const,
    detail: (id: string) => ['branches', id] as const,
  },
  schemes: {
    all: ['schemes'] as const,
    list: (params?: { status?: string; search?: string; page?: number; limit?: number }) =>
      ['schemes', 'list', params] as const,
    detail: (id: string) => ['schemes', id] as const,
    roster: (id: string) => ['schemes', id, 'roster'] as const,
  },
  tickets: {
    all: ['tickets'] as const,
    detail: (id: string) => ['tickets', id] as const,
    passbook: (id: string) => ['tickets', id, 'passbook'] as const,
    ledger: (id: string) => ['tickets', id, 'ledger'] as const,
    defaulters: (params?: { branchId?: string; minConsecutiveMonths?: number }) =>
      ['tickets', 'defaulters', params] as const,
  },
  installments: {
    all: ['installments'] as const,
    groupMonth: (chitGroupId: string, month: number, status?: string) =>
      ['installments', 'group-month', { chitGroupId, month, status }] as const,
    upiIntent: (dueId: string) => ['installments', dueId, 'upi-intent'] as const,
    defaulters: (branchId?: string, minMonths?: number) =>
      ['installments', 'defaulters', { branchId, minMonths }] as const,
  },
  auctions: {
    all: ['auctions'] as const,
    list: (chitGroupId?: string) => ['auctions', { chitGroupId }] as const,
    detail: (auctionId: string) => ['auctions', auctionId] as const,
    eligibleBidders: (id: string, month?: number) =>
      ['auctions', id, 'eligible-bidders', { month }] as const,
    minutes: (auctionId: string) => ['auctions', auctionId, 'minutes'] as const,
  },
  disbursements: {
    all: ['disbursements'] as const,
    list: () => ['disbursements', 'list'] as const,
    detail: (id: string) => ['disbursements', id] as const,
  },
  approvals: {
    all: ['approvals'] as const,
    pending: () => ['approvals', 'pending'] as const,
  },
  reports: {
    all: ['reports'] as const,
    cashBook: (date?: string) => ['reports', 'cash-book', date] as const,
    arrears: () => ['reports', 'arrears'] as const,
    formXvii: (chitGroupId: string, month: number) =>
      ['reports', 'form-xvii', { chitGroupId, month }] as const,
  },
  customers: {
    all: ['customers'] as const,
    list: (params?: string | { search?: string; page?: number; limit?: number; isKycVerified?: string }) =>
      ['customers', 'list', typeof params === 'string' ? { search: params } : params] as const,
    detail: (id: string) => ['customers', id] as const,
  },
  collections: {
    all: ['collections'] as const,
    agentSummary: (agentId?: string) => ['collections', 'agent-summary', { agentId }] as const,
    unacknowledged: () => ['collections', 'unacknowledged'] as const,
  },
} as const;
