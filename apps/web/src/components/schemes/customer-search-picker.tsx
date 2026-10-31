'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AssignedTicketRef } from './assign-ticket-dialog';

export interface CustomerSearchResult {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
}

export interface CustomerSearchPickerProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  isSearching: boolean;
  customerResults?: CustomerSearchResult[];
  selectedCustomer: CustomerSearchResult | null;
  onSelectCustomer: (customer: CustomerSearchResult) => void;
  assignedTickets: AssignedTicketRef[];
}

export function CustomerSearchPicker({
  searchTerm,
  onSearchChange,
  isSearching,
  customerResults,
  selectedCustomer,
  onSelectCustomer,
  assignedTickets,
}: CustomerSearchPickerProps) {
  const t = useTranslations('schemes');

  return (
    <div className="space-y-2">
      {/* Search Input Box */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-300">
          {t('searchCustomerLabel')}
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            type="text"
            placeholder={t('searchCustomerPlaceholder')}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 text-xs border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-2.5 h-3.5 w-3.5 animate-spin text-emerald-400" />
          )}
        </div>

        {/* Search Results Dropdown List */}
        {customerResults && customerResults.length > 0 && (
          <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-700 bg-slate-950 p-1 shadow-lg divide-y divide-slate-800">
            {customerResults.map((cust) => {
              const alreadyAssigned = assignedTickets.find((t) => t.customerId === cust.id);
              const isSelected = selectedCustomer?.id === cust.id;

              return (
                <button
                  key={cust.id}
                  type="button"
                  onClick={() => onSelectCustomer(cust)}
                  className={cn(
                    'w-full flex items-center justify-between p-2 text-left text-xs transition-colors rounded hover:bg-slate-800/70',
                    isSelected && 'bg-emerald-950/40 border border-emerald-500/40',
                    alreadyAssigned && 'opacity-70 bg-rose-950/20'
                  )}
                >
                  <div>
                    <p className="font-semibold text-slate-200">{cust.fullName}</p>
                    <p className="font-mono text-[11px] text-slate-400">
                      {cust.customerCode} • +91 {cust.phone}
                    </p>
                  </div>
                  {alreadyAssigned ? (
                    <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30">
                      Ticket #{alreadyAssigned.ticketNumber}
                    </span>
                  ) : (
                    isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Subscriber Details Card */}
      {selectedCustomer && (
        <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400">
            {t('selectedCustomer')}
          </span>
          <p className="font-bold text-slate-100 text-sm">{selectedCustomer.fullName}</p>
          <p className="font-mono text-slate-300">
            {selectedCustomer.customerCode} • +91 {selectedCustomer.phone}
          </p>
        </div>
      )}
    </div>
  );
}
