'use client';

// ==============================================================================
// Kumaran Chits — Client-Side Idempotency & Multi-Click Action Guard
// Pins an idempotency UUID to a modal/form session across retries,
// and enforces client-side synchronous submission locking.
// ==============================================================================

import { useState, useCallback, useRef } from 'react';

export interface UseIdempotentActionResult {
  /**
   * The pinned idempotency key for the current action session.
   * Stays stable across retries and resets only when explicitly commanded.
   */
  idempotencyKey: string;
  /**
   * Generates a fresh idempotency key for the next action.
   */
  resetKey: () => string;
  /**
   * Whether an action execution is currently in progress.
   */
  isExecuting: boolean;
  /**
   * Executes an async action with synchronous locking and session-pinned idempotency key.
   */
  executeIdempotentAction: <T>(action: (key: string) => Promise<T>) => Promise<T>;
}

export function useIdempotentAction(): UseIdempotentActionResult {
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [isExecuting, setIsExecuting] = useState(false);
  const isExecutingRef = useRef(false);

  const resetKey = useCallback((): string => {
    const newKey = crypto.randomUUID();
    setIdempotencyKey(newKey);
    return newKey;
  }, []);

  const executeIdempotentAction = useCallback(
    async <T>(action: (key: string) => Promise<T>): Promise<T> => {
      // Synchronous locking: Reject duplicate clicks while request is in flight
      if (isExecutingRef.current) {
        throw new Error('Action already in progress. Please wait.');
      }

      isExecutingRef.current = true;
      setIsExecuting(true);

      try {
        const result = await action(idempotencyKey);
        // On clean success, generate fresh key for subsequent action
        resetKey();
        return result;
      } finally {
        isExecutingRef.current = false;
        setIsExecuting(false);
      }
    },
    [idempotencyKey, resetKey]
  );

  return {
    idempotencyKey,
    resetKey,
    isExecuting,
    executeIdempotentAction,
  };
}
