'use client';

// ==============================================================================
// Kumaran Chits — Client-Side Debounce Hook
// Throttles rapid state changes (e.g. search inputs) to prevent backend flooding.
// ==============================================================================

import { useState, useEffect } from 'react';

/**
 * Debounces a fast-changing value by delayMs (defaults to 300ms).
 */
export function useDebounce<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
