'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Receipt,
  Ticket,
  Users2,
  FileText,
  Loader2,
  AlertCircle,
  UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { CustomerProfileHeader } from '@/components/customers/customer-profile-header';
import { CustomerPassbookTab } from '@/components/customers/customer-passbook-tab';
import { CustomerTicketsTab } from '@/components/customers/customer-tickets-tab';
import { CustomerNomineesCard } from '@/components/customers/customer-nominees-card';
import { CustomerDocumentsCard } from '@/components/customers/customer-documents-card';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export default function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const t = useTranslations('customers');

  const [activeTab, setActiveTab] = React.useState<'passbook' | 'tickets' | 'nominees' | 'documents'>('passbook');
  const [selectedTicketId, setSelectedTicketId] = React.useState<string | undefined>(undefined);

  const { data: customer, isLoading, isError, error } = useQuery<any>({
    queryKey: queryKeys.customers.detail(id),
    queryFn: async () => {
      return unwrapApiResponse<any>(
        apiClient.GET('/api/v1/customers/{id}' as any, {
          params: { path: { id } },
        }),
      );
    },
    enabled: Boolean(id),
  });

  const handleSelectTicketFromTab = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setActiveTab('passbook');
  };

  if (isLoading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        <p className="text-xs text-slate-400">Loading Customer 360 profile...</p>
      </div>
    );
  }

  if (isError || !customer) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-8 text-center space-y-4">
        <UserX className="mx-auto h-10 w-10 text-red-400" />
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white">Subscriber Not Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {error instanceof Error ? error.message : 'Unable to find customer profile with this ID.'}
          </p>
        </div>
        <Button size="sm" variant="outline" asChild className="border-slate-700 bg-slate-800 text-xs">
          <Link href="/customers">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            <span>{t('backToDirectory')}</span>
          </Link>
        </Button>
      </div>
    );
  }

  const tickets = customer.tickets || [];
  const nominees = customer.nominees || [];
  const documents = customer.documents || [];

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/customers" className="hover:text-emerald-400 flex items-center gap-1 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('title')}</span>
          </Link>
          <span>/</span>
          <span className="font-mono font-medium text-slate-200">{customer.customerCode}</span>
        </div>
      </div>

      {/* Governing Business Rule Banner: Guardrail 8 */}
      <BusinessRuleBanner
        ruleNumber={8}
        title="Defaulter & Single Discrete Payment Rules (ADR-07 & Guardrail 8)"
        description="Unpaid current installment strictly blocks auction bidding. 3 consecutive unpaid months grants company removal rights. Each month has strictly a single discrete payment matching exact net due."
        referencePath="/instructions?rule=8"
        defaultExpanded={false}
      />

      {/* Profile Overview Header Card */}
      <CustomerProfileHeader customer={customer} />

      {/* Profile Tabs Navigation */}
      <div className="border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('passbook')}
          className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'passbook'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Receipt className="h-3.5 w-3.5" />
          <span>{t('tabPassbook')}</span>
        </button>

        <button
          onClick={() => setActiveTab('tickets')}
          className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'tickets'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Ticket className="h-3.5 w-3.5" />
          <span>{t('tabTickets', { count: tickets.length })}</span>
        </button>

        <button
          onClick={() => setActiveTab('nominees')}
          className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'nominees'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Users2 className="h-3.5 w-3.5" />
          <span>{t('tabNominees', { count: nominees.length })}</span>
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'documents'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>{t('tabDocuments', { count: documents.length })}</span>
        </button>
      </div>

      {/* Tab Content Display */}
      <div>
        {activeTab === 'passbook' && (
          <CustomerPassbookTab
            tickets={tickets}
            selectedTicketId={selectedTicketId}
            onSelectTicket={(tkId) => setSelectedTicketId(tkId)}
          />
        )}

        {activeTab === 'tickets' && (
          <CustomerTicketsTab
            tickets={tickets}
            onSelectTicket={handleSelectTicketFromTab}
          />
        )}

        {activeTab === 'nominees' && (
          <CustomerNomineesCard
            customerId={customer.id}
            nominees={nominees}
          />
        )}

        {activeTab === 'documents' && (
          <CustomerDocumentsCard
            customerId={customer.id}
            documents={documents}
          />
        )}
      </div>
    </div>
  );
}
