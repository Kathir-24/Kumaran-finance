'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface AuctionItem {
  id: string;
  chitGroupId: string;
  installmentMonth: number;
}

export default function AuctionsLiveFallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get('group');
  const monthStr = searchParams.get('month');
  const monthNum = monthStr ? parseInt(monthStr, 10) : 2;

  const { data: auctions = [], isLoading } = useQuery<AuctionItem[]>({
    queryKey: queryKeys.auctions.list(groupId || undefined),
    queryFn: async () => {
      if (!groupId) return [];
      return unwrapApiResponse<AuctionItem[]>(
        apiClient.GET('/api/v1/auctions/group/{chitGroupId}' as any, {
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

  return (
    <div className="flex h-96 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        <span className="text-xs text-slate-400">Loading auction room...</span>
      </div>
    </div>
  );
}
