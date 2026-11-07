'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useApprovalsStore } from '@/stores/approvals-store';
import { apiClient, getApiBaseUrl, getStoredAccessToken, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface SseApprovalsMessage {
  type: string;
  summary: {
    totalPendingCount?: number;
    cashHandoversCount?: number;
    disbursementAuthorizationsCount?: number;
    paymentReversalsCount?: number;
  };
  timestamp?: string;
}

export function useApprovalsStream() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const isConnected = useApprovalsStore((s) => s.isConnected);
  const setSummary = useApprovalsStore((s) => s.setSummary);
  const setConnected = useApprovalsStore((s) => s.setConnected);

  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fallback / Initial TanStack Query fetch: Polls every 30s strictly when SSE is not active
  const { data: initialData } = useQuery({
    queryKey: ['approvals', 'pending', { branchId: activeBranchId }],
    queryFn: async ({ signal }) => {
      const response = await unwrapApiResponse<any>(
        apiClient.GET('/api/v1/reports/pending-approvals', {
          params: {
            query: activeBranchId ? { branchId: activeBranchId } : undefined,
          },
          signal,
        })
      );
      return response;
    },
    enabled: isAuthenticated,
    staleTime: 15_000,
    // Cease background polling immediately when SSE stream is healthy
    refetchInterval: isConnected ? false : 30_000,
  });

  // Synchronize initial HTTP response into store
  useEffect(() => {
    if (initialData?.summary) {
      setSummary(initialData.summary);
    }
  }, [initialData, setSummary]);

  // Connect to SSE stream
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') {
      setConnected(false);
      return;
    }

    let isCancelled = false;

    async function connectStream() {
      if (isCancelled) return;

      const token = getStoredAccessToken();
      if (!token) return;

      // Clean up previous controller
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const baseUrl = getApiBaseUrl();
        const branchParam = activeBranchId ? `?branchId=${encodeURIComponent(activeBranchId)}` : '';
        const url = `${baseUrl}/api/v1/reports/approvals-stream${branchParam}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          setConnected(false);
          // Retry with exponential delay
          scheduleReconnect();
          return;
        }

        setConnected(true);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!isCancelled) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const lines = part.split('\n');
            for (const line of lines) {
              if (line.startsWith('data:')) {
                try {
                  const rawJson = line.replace(/^data:\s*/, '').trim();
                  if (!rawJson) continue;
                  const message: SseApprovalsMessage = JSON.parse(rawJson);
                  if (message?.type === 'APPROVALS_UPDATE' && message.summary) {
                    setSummary(message.summary);
                  }
                } catch {
                  // Silently ignore malformed SSE heartbeats or parse errors
                }
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError' && !isCancelled) {
          setConnected(false);
          scheduleReconnect();
        }
      }
    }

    function scheduleReconnect() {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!isCancelled) {
          connectStream();
        }
      }, 10_000);
    }

    connectStream();

    return () => {
      isCancelled = true;
      setConnected(false);
      abortControllerRef.current?.abort();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [isAuthenticated, activeBranchId, setSummary, setConnected]);
}
