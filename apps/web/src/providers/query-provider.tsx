'use client';

// ==============================================================================
// Kumaran Chits — TanStack Query v5 Provider
// Bank-grade server state caching, retry boundaries, and SSR hydration safety.
// ==============================================================================

import { isServer, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { KumaranApiError } from '@/lib/api-client';

/**
 * Creates a configured QueryClient with financial workstation policies.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data stays fresh for 1 minute before refetching on background navigation
        staleTime: 60 * 1000,
        // Inactive queries are garbage-collected after 5 minutes
        gcTime: 5 * 60 * 1000,
        // Smart retry: Retry transient network errors once; never retry client/auth/validation errors
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          if (error instanceof KumaranApiError) {
            // Never retry 4xx errors (Bad Request, Unauthorized, Forbidden, Not Found, Conflict)
            if (error.statusCode >= 400 && error.statusCode < 500) {
              return false;
            }
          }
          return true;
        },
        // Prevent jarring refetches on window focus while cashier is entering transactions
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Financial mutations (payments, auctions, payouts) MUST NEVER auto-retry on failure
        // to prevent duplicate ledger state or unintended double-processing.
        retry: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

/**
 * Returns a singleton QueryClient in the browser, or a fresh instance per request on SSR.
 */
export function getQueryClient(): QueryClient {
  if (isServer) {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export interface QueryProviderProps {
  children: ReactNode;
}

/**
 * Root QueryProvider wrapping application in TanStack Query v5 context.
 */
export function QueryProvider({ children }: QueryProviderProps) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
