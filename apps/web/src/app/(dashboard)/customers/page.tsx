'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { useDebounce } from '@/hooks/use-debounce';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { Button } from '@/components/ui/button';
import {
  CustomerSummaryCards,
} from '@/components/customers/customer-summary-cards';
import {
  CustomerFilterBar,
  type KycFilterOption,
} from '@/components/customers/customer-filter-bar';
import {
  CustomerTable,
  type CustomerRowData,
} from '@/components/customers/customer-table';
import { CustomerPagination } from '@/components/customers/customer-pagination';

interface CustomerListResponse {
  data: CustomerRowData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function CustomersDirectoryPage() {
  const t = useTranslations('customers');
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);

  // Initialize query parameters from URL search params
  const initialSearch = searchParams.get('search') || '';
  const initialKyc = (searchParams.get('kyc') as KycFilterOption) || 'ALL';
  const initialPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const initialLimit = [10, 20, 50].includes(parseInt(searchParams.get('limit') || '20', 10))
    ? parseInt(searchParams.get('limit') || '20', 10)
    : 20;

  const [search, setSearch] = React.useState(initialSearch);
  const debouncedSearch = useDebounce(search, 300);
  const [kycFilter, setKycFilter] = React.useState<KycFilterOption>(initialKyc);
  const [page, setPage] = React.useState(initialPage);
  const [limit, setLimit] = React.useState(initialLimit);

  // Reset to page 1 on search keyword change
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Synchronize component state to URL query parameters
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (kycFilter !== 'ALL') params.set('kyc', kycFilter);
    if (page > 1) params.set('page', page.toString());
    if (limit !== 20) params.set('limit', limit.toString());

    const queryString = params.toString();
    const url = queryString ? `/customers?${queryString}` : '/customers';
    router.replace(url, { scroll: false });
  }, [debouncedSearch, kycFilter, page, limit, router]);

  // Prepare query parameters for backend GET /api/v1/customers
  const queryParams = React.useMemo(() => {
    const p: { search?: string; page: number; limit: number; isKycVerified?: string } = {
      page,
      limit,
    };
    if (debouncedSearch.trim()) {
      p.search = debouncedSearch.trim();
    }
    if (kycFilter === 'VERIFIED') {
      p.isKycVerified = 'true';
    } else if (kycFilter === 'PENDING') {
      p.isKycVerified = 'false';
    }
    return p;
  }, [page, limit, debouncedSearch, kycFilter]);

  // Execute real backend query
  const { data: response, isLoading, isFetching } = useQuery({
    queryKey: queryKeys.customers.list(queryParams),
    queryFn: async ({ signal }) => {
      return unwrapApiResponse<CustomerListResponse>(
        apiClient.GET('/api/v1/customers', {
          params: { query: queryParams },
          signal,
        })
      );
    },
    staleTime: 30_000,
  });

  const customers = React.useMemo(
    () => response?.data || [],
    [response?.data],
  );
  const total = response?.total || 0;
  const totalPages = response?.totalPages || Math.ceil(total / limit) || 1;

  // Compute metrics from current payload
  const verifiedCount = React.useMemo(() => {
    if (kycFilter === 'VERIFIED') return total;
    if (kycFilter === 'PENDING') return 0;
    return customers.filter((c) => c.isKycVerified).length;
  }, [customers, total, kycFilter]);

  const pendingCount = React.useMemo(() => {
    if (kycFilter === 'PENDING') return total;
    if (kycFilter === 'VERIFIED') return 0;
    return customers.filter((c) => !c.isKycVerified).length;
  }, [customers, total, kycFilter]);

  const activeTicketsCount = React.useMemo(() => {
    return customers.reduce((acc, c) => acc + (c._count?.tickets || 0), 0);
  }, [customers]);

  // Handlers
  const handleResetFilters = () => {
    setSearch('');
    setKycFilter('ALL');
    setPage(1);
  };

  const handleKycFilterChange = (val: KycFilterOption) => {
    setKycFilter(val);
    setPage(1);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  // RBAC permissions check: Super Admin, Branch Manager, Collection Agent can register customers
  const canRegisterCustomer =
    user?.roles?.some((r) =>
      ['SUPER_ADMIN', 'BRANCH_MANAGER', 'COLLECTION_AGENT'].includes(r)
    ) ?? true;

  return (
    <div className="space-y-6">
      {/* Top Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Users className="h-6 w-6 text-emerald-400" />
            <span>{t('title')}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t('subtitle')}
          </p>
        </div>

        {canRegisterCustomer && (
          <Button
            size="sm"
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm text-xs h-9"
            asChild
          >
            <Link href="/customers/new">
              <Plus className="mr-1.5 h-4 w-4 shrink-0" />
              <span>{t('newCustomer')}</span>
            </Link>
          </Button>
        )}
      </div>

      {/* Invariant Guardrail Banner: ADR-13 Unique Customer Limit & ADR-16 Optional KYC */}
      <BusinessRuleBanner
        ruleNumber={7}
        title="ADR-13 Unique Customer Limit & ADR-16 Paper Intake Rules"
        description="A customer can join multiple chit groups across the branch, but cannot hold 2 or more tickets in the same chit group. Physical notebook onboarding requires only basic subscriber details; Aadhaar/PAN scans are optional (ADR-16)."
        referencePath="/instructions?rule=7"
        defaultExpanded={false}
      />

      {/* Summary KPI Cards */}
      <CustomerSummaryCards
        total={total}
        verifiedCount={verifiedCount}
        pendingCount={pendingCount}
        activeTicketsCount={activeTicketsCount}
        isLoading={isLoading}
      />

      {/* Filter and Search Bar */}
      <CustomerFilterBar
        search={search}
        onSearchChange={setSearch}
        kycFilter={kycFilter}
        onKycFilterChange={handleKycFilterChange}
        limit={limit}
        onLimitChange={handleLimitChange}
        onReset={handleResetFilters}
        isSearching={isFetching}
      />

      {/* Customer Directory Table & Pagination */}
      <div className="space-y-2">
        <CustomerTable
          customers={customers}
          isLoading={isLoading}
          onClearFilters={handleResetFilters}
        />

        <CustomerPagination
          page={page}
          totalPages={totalPages}
          limit={limit}
          total={total}
          onPageChange={setPage}
          isLoading={isFetching}
        />
      </div>
    </div>
  );
}
