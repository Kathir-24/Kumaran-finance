'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  RotateCcw,
  Trash2,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { apiClient, getErrorMessage, unwrapApiResponse, KumaranApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { getDefaultStartDate, projectEndDate } from '@/lib/date-utils';

interface ActiveBranchOption {
  id: string;
  name: string;
  branchCode: string;
  isActive?: boolean;
}

interface DemoCustomerOption {
  id: string;
  fullName: string;
  customerCode?: string;
  phone?: string;
}

interface OnboardResultResponse {
  id?: string;
  data?: { id?: string };
}
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import {
  NotebookMasterForm,
  type MasterSchemeState,
} from '@/components/schemes/notebook-master-form';
import {
  NotebookEntryGrid,
  type GridMemberRow,
  type HistoricalAuctionState,
} from '@/components/schemes/notebook-entry-grid';
import { NotebookValidationPanel } from '@/components/schemes/notebook-validation-panel';

const STORAGE_KEY_PREFIX = 'kc_onboard_draft_';

// Factory for initial member rows (Tickets 1..N)
function generateInitialMembers(duration: number): GridMemberRow[] {
  return Array.from({ length: duration }, (_, idx) => {
    const tNum = idx + 1;
    const initialPayments: GridMemberRow['payments'] = {};
    for (let m = 1; m <= duration; m++) {
      initialPayments[m] = { status: 'PAID' }; // default to paid
    }
    return {
      ticketNumber: tNum,
      customerId: '',
      customerName: '',
      customerCode: '',
      phone: '',
      payments: initialPayments,
    };
  });
}

// Factory for initial historical auctions (Months 2..M-1)
function generateInitialAuctions(
  duration: number,
  intakeMonth: number,
  startDateStr: string
): HistoricalAuctionState[] {
  const auctions: HistoricalAuctionState[] = [];
  const start = new Date(startDateStr || new Date());

  for (let m = 2; m < intakeMonth; m++) {
    const aucDate = new Date(start);
    aucDate.setMonth(aucDate.getMonth() + (m - 1));
    auctions.push({
      month: m,
      ticketNumber: m, // default to ticket m
      bidDiscount: 0,
      auctionDate: aucDate.toISOString(),
    });
  }

  return auctions;
}

export default function NotebookOnboardingPage() {
  const t = useTranslations('onboarding');
  const tSchemes = useTranslations('schemes');
  const router = useRouter();
  const queryClient = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);

  // Check role authorization: Partner, Branch Manager, or Accountant (Maker)
  const isAuthorized =
    user?.roles?.includes('PARTNER') ||
    user?.roles?.includes('BRANCH_MANAGER') ||
    user?.roles?.includes('ACCOUNTANT');

  // Fetch branches for branch dropdown
  const { data: branchesData } = useQuery<ActiveBranchOption[]>({
    queryKey: ['branches', 'active'],
    queryFn: async () => {
      const res = await unwrapApiResponse<
        { data?: ActiveBranchOption[]; items?: ActiveBranchOption[] } | ActiveBranchOption[]
      >(
        apiClient.GET('/api/v1/branches', {
          params: { query: { activeOnly: 'true' } },
        })
      );
      const items = Array.isArray(res) ? res : res?.data || res?.items || [];
      return items.filter((b) => b.isActive !== false);
    },
    staleTime: 5 * 60 * 1000,
  });

  const branches = branchesData || [
    { id: activeBranchId || 'default-branch', name: 'Head Office - Perundurai', branchCode: 'PRD' },
  ];

  // 1. Master Scheme State
  const defaultStartDate = getDefaultStartDate();
  const [masterState, setMasterState] = React.useState<MasterSchemeState>({
    groupCode: '',
    groupName: '₹1 Lakh 20 Months Ongoing Group (Intake Month 7)',
    groupNameTamil: '',
    chitValue: 100000,
    durationMonths: 20,
    totalTickets: 20,
    onboardedAtMonth: 7,
    startDate: defaultStartDate,
    endDate: projectEndDate(defaultStartDate, 20),
    sanctionOrderNumber: '',
    sanctionDate: '',
    branchId: activeBranchId || branches[0]?.id || '',
  });

  // Keep branchId aligned if activeBranchId resolves later
  React.useEffect(() => {
    if (!masterState.branchId && activeBranchId) {
      setMasterState((s) => ({ ...s, branchId: activeBranchId }));
    }
  }, [activeBranchId, masterState.branchId]);

  // 2. Members and Historical Auctions State
  const [members, setMembers] = React.useState<GridMemberRow[]>(() =>
    generateInitialMembers(20)
  );
  const [historicalWinners, setHistoricalWinners] = React.useState<HistoricalAuctionState[]>(() =>
    generateInitialAuctions(20, 7, defaultStartDate)
  );

  // 3. Balancing Guard Input
  const [physicalNotebookTotal, setPhysicalNotebookTotal] = React.useState<number>(0);

  // 4. Draft Persistence States
  const [lastSavedTime, setLastSavedTime] = React.useState<string | null>(null);
  const [hasDraftAvailable, setHasDraftAvailable] = React.useState(false);
  const [submissionError, setSubmissionError] = React.useState<string | null>(null);

  // Dynamically adjust members and auctions when duration or intakeMonth changes
  const handleMasterChange = (patch: Partial<MasterSchemeState>) => {
    setMasterState((prev) => {
      const next = { ...prev, ...patch };

      // If duration changed, re-sync members array length
      if (patch.durationMonths && patch.durationMonths !== prev.durationMonths) {
        setMembers((prevMembers) => {
          if (patch.durationMonths! > prevMembers.length) {
            // Append missing tickets
            const extra = Array.from(
              { length: patch.durationMonths! - prevMembers.length },
              (_, i) => {
                const tNum = prevMembers.length + i + 1;
                const p: GridMemberRow['payments'] = {};
                for (let m = 1; m <= patch.durationMonths!; m++) p[m] = { status: 'PAID' };
                return {
                  ticketNumber: tNum,
                  customerId: '',
                  customerName: '',
                  customerCode: '',
                  phone: '',
                  payments: p,
                };
              }
            );
            return [...prevMembers, ...extra];
          } else {
            return prevMembers.slice(0, patch.durationMonths);
          }
        });
      }

      // If intakeMonth or duration or startDate changed, re-sync historical auctions
      if (
        (patch.onboardedAtMonth && patch.onboardedAtMonth !== prev.onboardedAtMonth) ||
        (patch.durationMonths && patch.durationMonths !== prev.durationMonths) ||
        (patch.startDate && patch.startDate !== prev.startDate)
      ) {
        const intake = next.onboardedAtMonth;
        const sDate = next.startDate;

        setHistoricalWinners((prevAuctions) => {
          const nextAuctions: HistoricalAuctionState[] = [];
          for (let m = 2; m < intake; m++) {
            const existing = prevAuctions.find((a) => a.month === m);
            if (existing) {
              nextAuctions.push(existing);
            } else {
              const d = new Date(sDate);
              d.setMonth(d.getMonth() + (m - 1));
              nextAuctions.push({
                month: m,
                ticketNumber: m,
                bidDiscount: 0,
                auctionDate: d.toISOString(),
              });
            }
          }
          return nextAuctions;
        });
      }

      return next;
    });
  };

  // Check for existing draft on initial mount
  React.useEffect(() => {
    try {
      const key = `${STORAGE_KEY_PREFIX}active`;
      const saved = localStorage.getItem(key);
      if (saved) {
        setHasDraftAvailable(true);
      }
    } catch {}
  }, []);

  // Save draft to localStorage
  const saveDraft = React.useCallback(() => {
    try {
      const key = `${STORAGE_KEY_PREFIX}active`;
      const draft = {
        masterState,
        members,
        historicalWinners,
        physicalNotebookTotal,
        savedAt: new Date().toLocaleTimeString(),
      };
      localStorage.setItem(key, JSON.stringify(draft));
      setLastSavedTime(draft.savedAt);
      setHasDraftAvailable(true);
    } catch (err) {
      console.warn('Unable to auto-save draft to localStorage:', err);
    }
  }, [masterState, members, historicalWinners, physicalNotebookTotal]);

  // Auto-save draft debounced
  React.useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft();
    }, 2000);
    return () => clearTimeout(timer);
  }, [saveDraft]);

  // Restore draft handler
  const restoreDraft = () => {
    try {
      const key = `${STORAGE_KEY_PREFIX}active`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.masterState) setMasterState(draft.masterState);
        if (draft.members) setMembers(draft.members);
        if (draft.historicalWinners) setHistoricalWinners(draft.historicalWinners);
        if (draft.physicalNotebookTotal) setPhysicalNotebookTotal(draft.physicalNotebookTotal);
        setLastSavedTime(draft.savedAt || new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to restore draft:', err);
    }
  };

  // Clear draft handler
  const clearDraft = () => {
    if (window.confirm(t('confirmClearDraft'))) {
      try {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}active`);
        setHasDraftAvailable(false);
        setLastSavedTime(null);
        setMembers(generateInitialMembers(masterState.durationMonths));
        setHistoricalWinners(
          generateInitialAuctions(masterState.durationMonths, masterState.onboardedAtMonth, masterState.startDate)
        );
        setPhysicalNotebookTotal(0);
      } catch {}
    }
  };

  // Demo Sample Data Auto-Filler for Instant Testing & Verification
  const [isDemoLoading, setIsDemoLoading] = React.useState(false);

  const fillSampleData = async () => {
    setIsDemoLoading(true);
    try {
      const res = await unwrapApiResponse<
        { data?: DemoCustomerOption[]; items?: DemoCustomerOption[] } | DemoCustomerOption[]
      >(
        apiClient.GET('/api/v1/customers', {
          params: { query: { limit: 30 } },
        })
      );
      const custList: DemoCustomerOption[] = Array.isArray(res)
        ? res
        : res?.data || res?.items || [];

      // 1. Assign unique verified subscribers to all durationMonths tickets (ADR-13 compliant)
      const count = masterState.durationMonths;
      const newMembers = generateInitialMembers(count);
      for (let i = 0; i < count; i++) {
        const c = custList[i] || {
          id: `cust-demo-${i + 1}`,
          fullName: `Verified Subscriber ${i + 1}`,
          customerCode: `KC-CUST-${String(i + 1).padStart(5, '0')}`,
          phone: `98427${String(10000 + i).slice(0, 5)}`,
        };
        newMembers[i].customerId = c.id;
        newMembers[i].customerName = c.fullName;
        newMembers[i].customerCode = c.customerCode || `KC-CUST-${String(i + 1).padStart(5, '0')}`;
        newMembers[i].phone = c.phone || '9876543210';

        // Mark past months as PAID with realistic receipt numbers
        for (let m = 1; m < masterState.onboardedAtMonth; m++) {
          newMembers[i].payments[m] = {
            status: 'PAID',
            receiptNumber: `REC-M${m}-${String(i + 1).padStart(3, '0')}`,
          };
        }
      }
      setMembers(newMembers);

      // 2. Set valid past auction discounts (under 1/4 ceiling, tickets >= 2)
      const maxCeiling = Math.floor(masterState.chitValue / 4);
      const sampleAuctions: HistoricalAuctionState[] = [];
      const start = new Date(masterState.startDate || new Date());
      for (let m = 2; m < masterState.onboardedAtMonth; m++) {
        const aucDate = new Date(start);
        aucDate.setMonth(aucDate.getMonth() + (m - 1));
        sampleAuctions.push({
          month: m,
          ticketNumber: m, // Ticket m won month m
          bidDiscount: Math.min(20000 + (m * 1000), maxCeiling),
          auctionDate: aucDate.toISOString(),
        });
      }
      setHistoricalWinners(sampleAuctions);

      // 3. Compute exact whole-rupee system total to achieve zero discrepancy
      const baseInst = Math.floor(masterState.chitValue / count);
      let calculatedTotal = 0;
      // Month 1 collections = count * baseInst (since all marked PAID)
      calculatedTotal += count * baseInst;
      // Months 2..M-1 collections = count * netInstallment
      for (const auc of sampleAuctions) {
        const foremanComm = Math.floor((masterState.chitValue * 4) / 100);
        const totDiv = Math.max(0, auc.bidDiscount - foremanComm);
        const divPerTkt = Math.floor(totDiv / count);
        const netInst = Math.max(0, baseInst - divPerTkt);
        calculatedTotal += count * netInst;
      }

      setPhysicalNotebookTotal(calculatedTotal);
    } catch (err) {
      console.error('Failed to fill sample data:', err);
    } finally {
      setIsDemoLoading(false);
    }
  };

  // Grid Member Row Mutator
  const handleMemberChange = (ticketNumber: number, patch: Partial<GridMemberRow>) => {
    setMembers((prev) =>
      prev.map((m) => (m.ticketNumber === ticketNumber ? { ...m, ...patch } : m))
    );
  };

  // Grid Cell Toggle (PAID <-> UNPAID)
  const handleCellToggle = (ticketNumber: number, month: number) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.ticketNumber !== ticketNumber) return m;
        const curStatus = m.payments[month]?.status || 'PAID';
        const nextStatus = curStatus === 'PAID' ? 'UNPAID' : 'PAID';
        return {
          ...m,
          payments: {
            ...m.payments,
            [month]: {
              ...m.payments[month],
              status: nextStatus,
            },
          },
        };
      })
    );
  };

  // Grid Receipt Number Mutator
  const handleReceiptChange = (ticketNumber: number, month: number, receiptNo: string) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.ticketNumber !== ticketNumber) return m;
        return {
          ...m,
          payments: {
            ...m.payments,
            [month]: {
              ...m.payments[month],
              receiptNumber: receiptNo,
            },
          },
        };
      })
    );
  };

  // Historical Auction Mutator
  const handleAuctionChange = (month: number, patch: Partial<HistoricalAuctionState>) => {
    setHistoricalWinners((prev) =>
      prev.map((a) => (a.month === month ? { ...a, ...patch } : a))
    );
  };

  // 5. Submit Ongoing Chit Mutation (Real API)
  const mutation = useMutation({
    mutationFn: async () => {
      setSubmissionError(null);

      // Calculate opening balance per member
      const memberAllocations = members.map((m) => {
        let openingBalance = 0;
        const baseInst = Math.floor(masterState.chitValue / masterState.durationMonths);
        const commission = Math.floor((masterState.chitValue * 4) / 100);

        for (let month = 1; month < masterState.onboardedAtMonth; month++) {
          if (m.payments[month]?.status === 'UNPAID') {
            const auction = historicalWinners.find((w) => w.month === month);
            const discount = auction?.bidDiscount || 0;
            const totalDiv = Math.max(0, discount - commission);
            const divPerTicket = month === 1 ? 0 : Math.floor(totalDiv / masterState.durationMonths);
            const netDue = Math.max(0, baseInst - divPerTicket);
            openingBalance += netDue;
          }
        }

        return {
          ticketNumber: m.ticketNumber,
          customerId: m.customerId,
          openingBalance,
        };
      });

      const payload = {
        groupCode: masterState.groupCode.trim(),
        groupName: masterState.groupName.trim(),
        groupNameTamil: masterState.groupNameTamil?.trim() || undefined,
        chitValue: masterState.chitValue,
        durationMonths: masterState.durationMonths,
        totalTickets: masterState.totalTickets,
        onboardedAtMonth: masterState.onboardedAtMonth,
        sanctionOrderNumber: masterState.sanctionOrderNumber?.trim() || undefined,
        sanctionDate: masterState.sanctionDate || undefined,
        startDate: new Date(masterState.startDate).toISOString(),
        endDate: new Date(masterState.endDate).toISOString(),
        branchId: masterState.branchId || undefined,
        historicalWinners: historicalWinners.map((hw) => ({
          month: hw.month,
          ticketNumber: hw.ticketNumber,
          bidDiscount: hw.bidDiscount,
          auctionDate: new Date(hw.auctionDate).toISOString(),
        })),
        memberAllocations,
      };

      return unwrapApiResponse<OnboardResultResponse>(
        apiClient.POST('/api/v1/chits/onboard-ongoing', {
          body: payload,
        })
      );
    },
    onSuccess: (data) => {
      // Clear draft on successful submission
      try {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}active`);
      } catch {}

      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.all });
      const chitId = data?.id || data?.data?.id;
      if (chitId) {
        router.push(`/schemes/${chitId}`);
      } else {
        router.push('/schemes');
      }
    },
    onError: (err: unknown) => {
      if (err instanceof KumaranApiError) {
        setSubmissionError(err.message);
      } else {
        setSubmissionError(getErrorMessage(err, 'Failed to onboard ongoing chit scheme'));
      }
    },
  });

  // Guard Unauthorized Role
  if (!isAuthorized) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-400 mb-2" />
          <h2 className="text-base font-bold text-white">Access Denied (Unauthorized Role)</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
            Mid-cycle notebook onboarding is restricted exclusively to Desk Accountants, Branch Managers, and Super Admin Partners under Guardrail 10.
          </p>
          <Button asChild variant="outline" className="mt-4" size="sm">
            <Link href="/schemes">Return to Schemes</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Top Breadcrumb & Draft Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
            <Link href="/schemes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 mb-0.5">
              <BookOpen className="h-3.5 w-3.5" />
              <span>{tSchemes('title')} • Physical Notebook Onboarding</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <span>{t('pageTitle')}</span>
              <Badge variant="neutral" className="text-xs font-mono bg-blue-500/10 text-blue-400 border-blue-500/20">
                Maker Portal
              </Badge>
            </h1>
          </div>
        </div>

        {/* Draft Actions & Status */}
        <div className="flex items-center gap-2 flex-wrap">
          {lastSavedTime && (
            <Badge variant="neutral" className="text-[11px] bg-slate-800 text-slate-300 border-slate-700">
              {t('draftSavedAt', { time: lastSavedTime })}
            </Badge>
          )}

          {hasDraftAvailable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={restoreDraft}
              className="h-8 text-xs gap-1.5 border-slate-700 hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5 text-blue-400" />
              <span>{t('restoreDraft')}</span>
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearDraft}
            className="h-8 text-xs gap-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{t('clearDraft')}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fillSampleData}
            disabled={isDemoLoading}
            className="h-8 text-xs gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 font-semibold cursor-pointer"
            title="Auto-fill verified subscribers, past auctions, and balanced collections for instant testing"
          >
            {isDemoLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            )}
            <span>{t('fillSampleData')}</span>
          </Button>
        </div>
      </div>

      {/* 2. Embedded Business Rule Banner */}
      <BusinessRuleBanner
        ruleNumber={5}
        title={t('month1CompanyNotice')}
        description={t('bannerDescription')}
        bulletPoints={[
          t('bannerBullet1'),
          t('bannerBullet2'),
          t('bannerBullet3'),
          t('bannerBullet4'),
          t('bannerBullet5'),
        ]}
        referencePath="/instructions"
      />

      {/* Submission Error Banner */}
      {submissionError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-xs text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{submissionError}</span>
        </div>
      )}

      {/* 3. Step 1: Master Parameters Form */}
      <NotebookMasterForm
        state={masterState}
        onChange={handleMasterChange}
        branches={branches}
        isLocked={mutation.isPending}
      />

      {/* 4. Step 2: 400-Cell Historical Transcription Grid */}
      <NotebookEntryGrid
        chitValue={masterState.chitValue}
        durationMonths={masterState.durationMonths}
        onboardedAtMonth={masterState.onboardedAtMonth}
        startDate={masterState.startDate}
        historicalWinners={historicalWinners}
        onAuctionChange={handleAuctionChange}
        members={members}
        onMemberChange={handleMemberChange}
        onCellToggle={handleCellToggle}
        onReceiptChange={handleReceiptChange}
        isLocked={mutation.isPending}
      />

      {/* 5. Step 3: Balancing Guard & Maker Submission Panel */}
      <NotebookValidationPanel
        chitValue={masterState.chitValue}
        durationMonths={masterState.durationMonths}
        onboardedAtMonth={masterState.onboardedAtMonth}
        members={members}
        historicalWinners={historicalWinners}
        physicalNotebookTotal={physicalNotebookTotal}
        onPhysicalNotebookTotalChange={setPhysicalNotebookTotal}
        onSubmit={() => mutation.mutate()}
        isSubmitting={mutation.isPending}
        isLocked={mutation.isPending}
      />
    </div>
  );
}
