'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useApprovalsStore, type ApprovalsSummary } from '@/stores/approvals-store';
import { apiClient, getApiBaseUrl, unwrapApiResponse } from '@/lib/api-client';

interface SseApprovalsMessage {
  type: string;
  summary?: Partial<ApprovalsSummary>;
  timestamp?: string;
}

const WATCHDOG_TIMEOUT_MS = 35_000;
const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

export function useApprovalsStream() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const isConnected = useApprovalsStore((s) => s.isConnected);
  const setSummary = useApprovalsStore((s) => s.setSummary);
  const setConnected = useApprovalsStore((s) => s.setConnected);

  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // Fallback / Initial TanStack Query fetch: Polls every 30s strictly when SSE is not active
  const { data: initialData } = useQuery({
    queryKey: ['approvals', 'pending', { branchId: activeBranchId }],
    queryFn: async ({ signal }) => {
      const response = await unwrapApiResponse<{ summary?: Partial<ApprovalsSummary> }>(
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

    const clearWatchdog = () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };

    const resetWatchdog = () => {
      clearWatchdog();
      watchdogTimerRef.current = setTimeout(() => {
        // Watchdog timeout reached: Silent TCP drop detected
        if (!isCancelled) {
          abortControllerRef.current?.abort();
          setConnected(false);
          scheduleReconnect(false);
        }
      }, WATCHDOG_TIMEOUT_MS);
    };

    function scheduleReconnect(immediate = false) {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (immediate) {
        reconnectAttemptsRef.current = 0;
        connectStream();
        return;
      }

      reconnectAttemptsRef.current += 1;
      const backoff = Math.min(
        MAX_BACKOFF_MS,
        BASE_BACKOFF_MS * Math.pow(2, reconnectAttemptsRef.current)
      );
      const jitter = Math.floor(Math.random() * 1500);
      const delay = backoff + jitter;

      reconnectTimeoutRef.current = setTimeout(() => {
        if (!isCancelled) {
          connectStream();
        }
      }, delay);
    }

    async function connectStream() {
      if (isCancelled) return;

      // Clean up previous controller & watchdog
      abortControllerRef.current?.abort();
      clearWatchdog();

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const baseUrl = getApiBaseUrl();
        const branchParam = activeBranchId ? `?branchId=${encodeURIComponent(activeBranchId)}` : '';
        const url = `${baseUrl}/api/v1/reports/approvals-stream${branchParam}`;

        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
        };

        const response = await fetch(url, {
          method: 'GET',
          headers,
          credentials: 'same-origin',
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          setConnected(false);
          clearWatchdog();

          // If 403 Forbidden, user role is not authorized for approvals (e.g. Customer)
          if (response.status === 403) {
            return;
          }

          // If 401 Unauthorized, re-hydrate auth state and halt reconnects if logged out
          if (response.status === 401) {
            await useAuthStore.getState().hydrate().catch(() => {});
            if (!useAuthStore.getState().isAuthenticated) {
              return;
            }
          }

          scheduleReconnect(false);
          return;
        }

        // Connection successfully established
        setConnected(true);
        reconnectAttemptsRef.current = 0;
        resetWatchdog();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!isCancelled) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // Normalize CRLF to LF
          buffer = buffer.replace(/\r\n/g, '\n');
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            if (!part.trim()) continue;
            // Any valid packet or keep-alive comment resets the watchdog
            resetWatchdog();

            const lines = part.split('\n');
            const dataLines: string[] = [];

            for (const line of lines) {
              if (line.startsWith(':')) {
                // Comment line (: ping or : keepalive)
                continue;
              }
              if (line.startsWith('data:')) {
                dataLines.push(line.replace(/^data:\s*/, ''));
              }
            }

            if (dataLines.length > 0) {
              const rawJson = dataLines.join('\n').trim();
              if (!rawJson) continue;
              try {
                const message: SseApprovalsMessage = JSON.parse(rawJson);
                if (message?.type === 'APPROVALS_UPDATE' && message.summary) {
                  setSummary(message.summary);
                }
              } catch {
                // Silently ignore malformed non-JSON frames
              }
            }
          }
        }
      } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if (!isAbort && !isCancelled) {
          setConnected(false);
          clearWatchdog();
          scheduleReconnect(false);
        }
      }
    }

    // Tab visibility & Network reconnection listeners
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({
          queryKey: ['approvals', 'pending', { branchId: activeBranchId }],
        });
        if (!isConnectedRef.current) {
          scheduleReconnect(true);
        }
      }
    };

    const handleOnline = () => {
      queryClient.invalidateQueries({
        queryKey: ['approvals', 'pending', { branchId: activeBranchId }],
      });
      scheduleReconnect(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    connectStream();

    return () => {
      isCancelled = true;
      setConnected(false);
      clearWatchdog();
      abortControllerRef.current?.abort();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [isAuthenticated, activeBranchId, setSummary, setConnected, queryClient]);
}
