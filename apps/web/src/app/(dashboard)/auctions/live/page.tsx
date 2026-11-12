'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Schema } from '@kumaran/api-client';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { RouteSuspenseFallback } from '@/components/ui/route-suspense-fallback';

type AuctionItem = Schema<'AuctionResponseDto'>;

function AuctionsLiveFallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get('group');
  const monthStr = searchParams.get('month');
  const parsedMonth = monthStr ? Number.parseInt(monthStr, 10) : Number.NaN;
  const monthNum = Number.isFinite(parsedMonth) && parsedMonth >= 1 ? parsedMonth : 2;

  const { data: auctions = [], isLoading } = useQuery<AuctionItem[]>({
    queryKey: queryKeys.auctions.list(groupId || undefined),
    queryFn: async () => {
      if (!groupId) return [];
      return unwrapApiResponse<AuctionItem[]>(
        apiClient.GET('/api/v1/auctions/group/{chitGroupId}', {
          params: { path: { chitGroupId: groupId } },
        }),
      );
    },
    enabled: Boolean(groupId),
  });

  React.useEffect(() => {
    if (!groupId) {
      router.replace('/auctions');
      return;
    }

    if (!isLoading) {
      const match = auctions.find((a) => a.installmentMonth === monthNum);
      if (match?.id) {
        router.replace(`/auctions/${match.id}/live`);
      } else {
        // Fallback using scheme ID and month query param
        router.replace(`/auctions/${groupId}/live?month=${monthNum}`);
      }
    }
  }, [groupId, monthNum, auctions, isLoading, router]);

  return <RouteSuspenseFallback label="Loading auction room..." />;
}

export default function AuctionsLiveFallbackPage() {
  return (
    <React.Suspense fallback={<RouteSuspenseFallback label="Loading auction room..." />}>
      <AuctionsLiveFallbackContent />
    </React.Suspense>
  );
}
