'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Check,
  X,
  UserCheck,
  Calendar,
  AlertCircle,
  HelpCircle,
  Trophy,
  Search,
  UserPlus,
} from 'lucide-react';
import { formatRupee } from '@kumaran/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomerSearchPicker, type CustomerSearchResult } from './customer-search-picker';
import { apiClient, unwrapApiResponse, unwrapPaginatedList } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export interface HistoricalAuctionState {
  month: number;
  ticketNumber: number;
  bidDiscount: number;
  auctionDate: string;
}

export interface CellPayment {
  status: 'PAID' | 'UNPAID';
  receiptNumber?: string;
}

export interface GridMemberRow {
  ticketNumber: number;
  customerId: string;
  customerName: string;
  customerCode: string;
  phone: string;
  payments: Record<number, CellPayment>; // month -> CellPayment
}

export interface NotebookEntryGridProps {
  chitValue: number;
  durationMonths: number;
  onboardedAtMonth: number;
  startDate: string;
  historicalWinners: HistoricalAuctionState[];
  onAuctionChange: (month: number, patch: Partial<HistoricalAuctionState>) => void;
  members: GridMemberRow[];
  onMemberChange: (ticketNumber: number, patch: Partial<GridMemberRow>) => void;
  onCellToggle: (ticketNumber: number, month: number) => void;
  onReceiptChange: (ticketNumber: number, month: number, receiptNo: string) => void;
  isLocked?: boolean;
}

export function NotebookEntryGrid({
  chitValue,
  durationMonths,
  onboardedAtMonth,
  startDate,
  historicalWinners,
  onAuctionChange,
  members,
  onMemberChange,
  onCellToggle,
  onReceiptChange,
  isLocked = false,
}: NotebookEntryGridProps) {
  const t = useTranslations('onboarding');
  const tSchemes = useTranslations('schemes');

  // Active customer picker state
  const [activePickerTicket, setActivePickerTicket] = React.useState<number | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [customerResults, setCustomerResults] = React.useState<CustomerSearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  // Focus matrix tracking for keyboard navigation [ticketNumber, month]
  const [focusedCell, setFocusedCell] = React.useState<{ ticket: number; month: number } | null>(null);

  const cellLabels = React.useMemo(() => ({
    paid: t('paidStatus'),
    unpaid: t('unpaidStatus'),
    recPlaceholder: t('receiptPlaceholder'),
  }), [t]);

  const baseInstallment = durationMonths > 0 ? Math.floor(chitValue / durationMonths) : 0;
  const foremanCommission = Math.floor((chitValue * 4) / 100);
  const maxCeilingDiscount = Math.floor(chitValue / 4);

  // Calculate monthly stats (dividend and net installment) for each month
  const monthlyCalculations = React.useMemo(() => {
    const map: Record<number, { dividendPerTicket: number; netInstallment: number }> = {};

    // Month 1 is always Base Installment, 0 Dividend
    map[1] = { dividendPerTicket: 0, netInstallment: baseInstallment };

    // Months 2 to onboardedAtMonth - 1
    for (let m = 2; m < onboardedAtMonth; m++) {
      const auction = historicalWinners.find((w) => w.month === m);
      const discount = auction?.bidDiscount || 0;
      const totalDividend = Math.max(0, discount - foremanCommission);
      const divPerTicket = durationMonths > 0 ? Math.floor(totalDividend / durationMonths) : 0;
      const netInstallment = Math.max(0, baseInstallment - divPerTicket);
      map[m] = { dividendPerTicket: divPerTicket, netInstallment };
    }

    return map;
  }, [baseInstallment, foremanCommission, durationMonths, onboardedAtMonth, historicalWinners]);

  // Handle live customer search via real backend API
  React.useEffect(() => {
    if (!searchTerm.trim() || activePickerTicket === null) {
      setCustomerResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const result = await unwrapApiResponse<any>(
          apiClient.GET('/api/v1/customers', {
            params: {
              query: {
                search: searchTerm,
                limit: 10,
              },
            },
            signal: controller.signal,
          }),
        );
        const items = unwrapPaginatedList<any>(result);
        setCustomerResults(
          items.map((c: any) => ({
            id: c.id,
            customerCode: c.customerCode,
            fullName: c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim(),
            phone: c.phone || '',
          })),
        );
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Customer search error:', err);
        }
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm, activePickerTicket]);

  // Handle keyboard navigation across the grid
  const handleKeyDown = (e: React.KeyboardEvent, ticket: number, month: number) => {
    if (isLocked) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevTicket = Math.max(1, ticket - 1);
      setFocusedCell({ ticket: prevTicket, month });
      const el = document.getElementById(`cell-${prevTicket}-${month}`);
      el?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextTicket = Math.min(durationMonths, ticket + 1);
      setFocusedCell({ ticket: nextTicket, month });
      const el = document.getElementById(`cell-${nextTicket}-${month}`);
      el?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevMonth = Math.max(1, month - 1);
      setFocusedCell({ ticket, month: prevMonth });
      const el = document.getElementById(`cell-${ticket}-${prevMonth}`);
      el?.focus();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextMonth = Math.min(onboardedAtMonth - 1, month + 1);
      setFocusedCell({ ticket, month: nextMonth });
      const el = document.getElementById(`cell-${ticket}-${nextMonth}`);
      el?.focus();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onCellToggle(ticket, month);
    }
  };

  // Assigned tickets for ADR-13 unique customer check
  const assignedTicketsList = React.useMemo(() => {
    return members
      .filter((m) => m.customerId)
      .map((m) => ({
        ticketNumber: m.ticketNumber,
        customerId: m.customerId,
        customerName: m.customerName,
      }));
  }, [members]);

  const selectCustomerForTicket = (cust: CustomerSearchResult) => {
    if (activePickerTicket === null) return;
    onMemberChange(activePickerTicket, {
      customerId: cust.id,
      customerName: cust.fullName,
      customerCode: cust.customerCode,
      phone: cust.phone,
    });
    setActivePickerTicket(null);
    setSearchTerm('');
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
      {/* 1. Header & Navigation Instructions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            <span>{t('step2Title')}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('step2Desc')}</p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="neutral" className="text-[11px] bg-slate-800 text-slate-300 border-slate-700">
            {t('keyboardHelp')}
          </Badge>
        </div>
      </div>

      {/* 2. Customer Picker Modal / Drawer if active */}
      {activePickerTicket !== null && (
        <div className="rounded-lg border border-indigo-500/40 bg-slate-950 p-4 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5" />
              <span>{t('assignSubscriberTitle', { ticket: activePickerTicket })}</span>
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setActivePickerTicket(null)}
              className="h-6 w-6 p-0 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <CustomerSearchPicker
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            isSearching={isSearching}
            customerResults={customerResults}
            selectedCustomer={null}
            onSelectCustomer={selectCustomerForTicket}
            assignedTickets={assignedTicketsList}
          />
        </div>
      )}

      {/* 3. The 400-Cell Historical Matrix */}
      <div className="overflow-x-auto scrollbar-thin rounded-lg border border-slate-800">
        <table className="w-full min-w-max border-collapse text-left text-xs font-mono">
          <thead>
            {/* Row 1: Month Numbers and Notices */}
            <tr className="border-b border-slate-800 bg-slate-950 text-slate-400">
              <th className="sticky left-0 z-20 bg-slate-950 p-3 min-w-[200px] font-sans font-semibold text-slate-200">
                {t('ticketSubscriberHeader')}
              </th>

              {/* Month 1 Header */}
              <th className="p-3 min-w-[130px] border-l border-slate-800 text-center bg-indigo-950/20 font-sans">
                <span className="font-bold text-indigo-300">{t('month1Header')}</span>
                <span className="block text-[10px] text-indigo-400/80 font-normal">{t('companyTicketLabel')}</span>
              </th>

              {/* Months 2 to M-1 Headers */}
              {Array.from({ length: Math.max(0, onboardedAtMonth - 2) }, (_, i) => i + 2).map((m) => {
                const auction = historicalWinners.find((w) => w.month === m);
                const discount = auction?.bidDiscount || 0;
                const isOverCeiling = discount > maxCeilingDiscount;

                return (
                  <th key={m} className="p-3 min-w-[160px] border-l border-slate-800 text-center font-sans">
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-bold text-slate-200">{t('monthColHeader', { m })}</span>
                      <Trophy className="h-3 w-3 text-amber-400" />
                    </div>

                    {/* Past Auction inputs in header */}
                    <div className="mt-2 space-y-1.5 text-left font-sans">
                      <div>
                        <label className="text-[10px] text-slate-400 block">{t('winnerTicket')}</label>
                        <select
                          value={auction?.ticketNumber || 2}
                          onChange={(e) =>
                            onAuctionChange(m, { ticketNumber: parseInt(e.target.value, 10) })
                          }
                          disabled={isLocked}
                          className="w-full h-6 rounded border border-slate-700 bg-slate-900 px-1 text-[11px] text-slate-100"
                        >
                          {Array.from({ length: durationMonths - 1 }, (_, tIdx) => tIdx + 2).map((tNum) => (
                            <option key={tNum} value={tNum}>
                              {t('ticketNumber')} #{tNum}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block">{t('winningDiscount')} (₹)</label>
                        <Input
                          type="number"
                          value={discount || ''}
                          onChange={(e) =>
                            onAuctionChange(m, { bidDiscount: parseInt(e.target.value || '0', 10) })
                          }
                          placeholder={`<= ${maxCeilingDiscount}`}
                          disabled={isLocked}
                          className={cn(
                            'h-6 text-[11px] px-1.5 font-mono bg-slate-900',
                            isOverCeiling ? 'border-rose-500 text-rose-300' : 'border-slate-700'
                          )}
                        />
                        {isOverCeiling && (
                          <span className="text-[9px] text-rose-400 block">{t('ceilingExceededBadge')}</span>
                        )}
                      </div>

                      <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between">
                        <span>{t('netPayable')}:</span>
                        <span className="font-mono text-emerald-400 font-semibold">
                          {formatRupee(monthlyCalculations[m]?.netInstallment || 0)}
                        </span>
                      </div>
                    </div>
                  </th>
                );
              })}

              {/* Forward/Upcoming Active Month Indicator */}
              <th className="p-3 min-w-[140px] border-l border-slate-800 text-center bg-slate-950 text-slate-500 font-sans">
                <span className="font-bold text-slate-400">{t('monthColHeader', { m: `${onboardedAtMonth}..${durationMonths}` })}</span>
                <span className="block text-[10px] text-slate-500 font-normal">{t('futureLiveAuctions')}</span>
              </th>

              {/* Total Arrears Column */}
              <th className="p-3 min-w-[120px] border-l border-slate-800 text-right font-sans font-semibold text-amber-300">
                {t('openingArrears')}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800">
            {members.map((member) => {
              // Calculate subscriber's total opening arrears
              let subscriberArrears = 0;
              for (let m = 1; m < onboardedAtMonth; m++) {
                const cell = member.payments[m];
                if (cell?.status === 'UNPAID') {
                  subscriberArrears += monthlyCalculations[m]?.netInstallment || 0;
                }
              }

              const isCompanyRep = member.ticketNumber === 1;

              return (
                <tr key={member.ticketNumber} className="hover:bg-slate-800/30 transition-colors">
                  {/* Sticky Member Column */}
                  <td className="sticky left-0 z-10 bg-slate-900/95 p-2.5 border-r border-slate-800 font-sans">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-[11px] font-bold text-slate-300 font-mono">
                          {member.ticketNumber}
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-slate-100 leading-tight">
                            {member.customerName || `${t('ticketNumber')} #${member.ticketNumber}`}
                          </p>
                          <p className="text-[10px] text-slate-400 leading-tight">
                            {isCompanyRep ? (
                              <span className="text-indigo-400 font-medium">{t('companyRepresentative')}</span>
                            ) : (
                              member.phone || member.customerCode || t('assignSubscriber')
                            )}
                          </p>
                        </div>
                      </div>

                      {!isLocked && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setActivePickerTicket(member.ticketNumber)}
                          className="h-6 w-6 p-0 text-slate-400 hover:text-emerald-400"
                          title={t('assignSubscriber')}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>

                  {/* Month 1 Cell */}
                  <td className="p-2 border-l border-slate-800 text-center bg-indigo-950/10">
                    {renderCellButton(
                      member.ticketNumber,
                      1,
                      member.payments[1]?.status || 'PAID',
                      member.payments[1]?.receiptNumber,
                      monthlyCalculations[1]?.netInstallment,
                      handleKeyDown,
                      onCellToggle,
                      onReceiptChange,
                      isLocked,
                      cellLabels
                    )}
                  </td>

                  {/* Months 2 to M-1 Cells */}
                  {Array.from({ length: Math.max(0, onboardedAtMonth - 2) }, (_, i) => i + 2).map((m) => {
                    const status = member.payments[m]?.status || 'PAID';
                    const receiptNo = member.payments[m]?.receiptNumber;
                    const netDue = monthlyCalculations[m]?.netInstallment;

                    return (
                      <td key={m} className="p-2 border-l border-slate-800 text-center">
                        {renderCellButton(
                          member.ticketNumber,
                          m,
                          status,
                          receiptNo,
                          netDue,
                          handleKeyDown,
                          onCellToggle,
                          onReceiptChange,
                          isLocked,
                          cellLabels
                        )}
                      </td>
                    );
                  })}

                  {/* Upcoming Months Disabled Cell */}
                  <td className="p-2 border-l border-slate-800 text-center text-slate-600 bg-slate-950/40">
                    <span className="text-[10px] italic">Forward</span>
                  </td>

                  {/* Calculated Opening Arrears */}
                  <td className="p-2.5 border-l border-slate-800 text-right font-mono font-bold text-xs">
                    {subscriberArrears > 0 ? (
                      <span className="text-rose-400">{formatRupee(subscriberArrears)}</span>
                    ) : (
                      <span className="text-emerald-400">₹0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Helper to render an individual matrix payment cell with keyboard focusability
 */
function renderCellButton(
  ticket: number,
  month: number,
  status: 'PAID' | 'UNPAID',
  receiptNo: string | undefined,
  netDue: number | undefined,
  onKeyDown: (e: React.KeyboardEvent, ticket: number, month: number) => void,
  onCellToggle: (ticket: number, month: number) => void,
  onReceiptChange: (ticket: number, month: number, val: string) => void,
  isLocked: boolean,
  labels?: { paid: string; unpaid: string; recPlaceholder: string }
) {
  const isPaid = status === 'PAID';
  const paidText = labels?.paid || 'PAID';
  const unpaidText = labels?.unpaid || 'UNPAID';
  const recPlaceholder = labels?.recPlaceholder || 'Rec #';

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        id={`cell-${ticket}-${month}`}
        type="button"
        disabled={isLocked}
        onClick={() => onCellToggle(ticket, month)}
        onKeyDown={(e) => onKeyDown(e, ticket, month)}
        className={cn(
          'w-full py-1 px-1.5 rounded text-[11px] font-bold border transition-colors focus:ring-2 focus:ring-emerald-400 focus:outline-none flex items-center justify-center gap-1',
          isPaid
            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25'
            : 'bg-rose-500/15 border-rose-500/40 text-rose-400 hover:bg-rose-500/25'
        )}
      >
        {isPaid ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        <span>{isPaid ? paidText : unpaidText}</span>
      </button>

      {/* Optional physical receipt number input */}
      <input
        type="text"
        value={receiptNo || ''}
        placeholder={recPlaceholder}
        disabled={isLocked || !isPaid}
        onChange={(e) => onReceiptChange(ticket, month, e.target.value)}
        className="w-full h-5 rounded border border-slate-800 bg-slate-950 px-1 text-[10px] text-center text-slate-300 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
      />
    </div>
  );
}
