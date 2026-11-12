'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { RotateCcw, Filter } from 'lucide-react';

interface StaffUserOption {
  id: string;
  name: string;
  roles: string[];
}

interface AuditLogFiltersProps {
  selectedAction: string;
  onActionChange: (action: string) => void;
  selectedEntity: string;
  onEntityChange: (entity: string) => void;
  selectedUserId: string;
  onUserIdChange: (userId: string) => void;
  fromDate: string;
  onFromDateChange: (date: string) => void;
  toDate: string;
  onToDateChange: (date: string) => void;
  limit: number;
  onLimitChange: (limit: number) => void;
  onReset: () => void;
  staffUsers?: StaffUserOption[];
}

export function AuditLogFilters({
  selectedAction,
  onActionChange,
  selectedEntity,
  onEntityChange,
  selectedUserId,
  onUserIdChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
  limit,
  onLimitChange,
  onReset,
  staffUsers = [],
}: AuditLogFiltersProps) {
  const t = useTranslations('reports.auditTrail');

  const actionOptions = [
    { value: 'ALL', labelKey: 'allActions' },
    { value: 'AUCTION_FINALIZED', labelKey: 'actionAuctionFinalized' },
    { value: 'AUCTION_TIE_BREAK_DRAWN', labelKey: 'actionAuctionTieBreakDrawn' },
    { value: 'MINUTES_FILED_AT_REGISTRAR', labelKey: 'actionMinutesFiledAtRegistrar' },
    { value: 'CASH_HANDOVER_ACKNOWLEDGED', labelKey: 'actionCashHandoverAcknowledged' },
    { value: 'PAYMENT_REVERSAL_REQUESTED', labelKey: 'actionPaymentReversalRequested' },
    { value: 'PAYMENT_REVERSED', labelKey: 'actionPaymentReversed' },
    { value: 'PAYMENT_REVERSAL_REJECTED', labelKey: 'actionPaymentReversalRejected' },
    { value: 'UPI_CLAIM_VERIFIED', labelKey: 'actionUpiClaimVerified' },
    { value: 'SAFETY_PROOF_VERIFIED', labelKey: 'actionSafetyProofVerified' },
    { value: 'SAFETY_PROOF_DOCUMENT_UPLOADED', labelKey: 'actionSafetyProofDocumentUploaded' },
    { value: 'PRIZE_PAYOUT_AUTHORIZED', labelKey: 'actionPrizePayoutAuthorized' },
    { value: 'PRIZE_PAYOUT_DISBURSED', labelKey: 'actionPrizePayoutDisbursed' },
    { value: 'FINAL_MONTH_SETTLEMENT_EXECUTED', labelKey: 'actionFinalMonthSettlementExecuted' },
    { value: 'TICKET_SUBSCRIBER_SUBSTITUTED', labelKey: 'actionTicketSubscriberSubstituted' },
    { value: 'DEF_SETTLEMENT_PROCESSED', labelKey: 'actionDefSettlementProcessed' },
    { value: 'CHIT_GROUP_DRAFT_UPDATED', labelKey: 'actionChitGroupDraftUpdated' },
    { value: 'TICKET_UNASSIGNED_PRE_ACTIVATION', labelKey: 'actionTicketUnassigned' },
    { value: 'CUSTOMER_DOCUMENT_DELETED', labelKey: 'actionCustomerDocumentDeleted' },
  ] as const;

  const entityOptions = [
    { value: 'ALL', labelKey: 'allEntities' },
    { value: 'Payment', labelKey: 'entityPayment' },
    { value: 'Auction', labelKey: 'entityAuction' },
    { value: 'ChitGroup', labelKey: 'entityChitGroup' },
    { value: 'SubscriberTicket', labelKey: 'entitySubscriberTicket' },
    { value: 'CustomerDocument', labelKey: 'entityCustomerDocument' },
    { value: 'AuctionMinutes', labelKey: 'entityAuctionMinutes' },
    { value: 'AuctionWinner', labelKey: 'entityAuctionWinner' },
  ] as const;

  const hasActiveFilters =
    selectedAction !== 'ALL' ||
    selectedEntity !== 'ALL' ||
    selectedUserId !== 'ALL' ||
    fromDate !== '' ||
    toDate !== '' ||
    limit !== 50;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4 print:hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Filter className="h-4 w-4 text-emerald-400" />
          <span>{t('filterAction')}</span>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-7 text-xs text-slate-400 hover:text-rose-400 hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            {t('resetFilters')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Action Select */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-400">{t('filterAction')}</label>
          <select
            value={selectedAction}
            onChange={(e) => onActionChange(e.target.value)}
            className="w-full h-9 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {actionOptions.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Entity Type Select */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-400">{t('filterEntity')}</label>
          <select
            value={selectedEntity}
            onChange={(e) => onEntityChange(e.target.value)}
            className="w-full h-9 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {entityOptions.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Staff Actor Select */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-400">{t('filterActor')}</label>
          <select
            value={selectedUserId}
            onChange={(e) => onUserIdChange(e.target.value)}
            className="w-full h-9 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="ALL" className="bg-slate-900 text-slate-200">
              {t('allActors')}
            </option>
            {staffUsers.map((u) => (
              <option key={u.id} value={u.id} className="bg-slate-900 text-slate-200">
                {u.name} ({u.roles[0]?.replace('_', ' ') || 'Staff'})
              </option>
            ))}
          </select>
        </div>

        {/* From Date */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-400">{t('fromDate')}</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
            className="w-full h-9 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* To Date */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-400">{t('toDate')}</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
            className="w-full h-9 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Page Size Limit */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-400">{t('rowsPerPage')}</label>
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="w-full h-9 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value={25} className="bg-slate-900 text-slate-200">25</option>
            <option value={50} className="bg-slate-900 text-slate-200">50</option>
            <option value={100} className="bg-slate-900 text-slate-200">100</option>
          </select>
        </div>
      </div>
    </div>
  );
}
