import { SetMetadata } from '@nestjs/common';

export const TIMEOUT_KEY = 'CUSTOM_REQUEST_TIMEOUT_MS';

/**
 * Decorator to override the default 15s request timeout for long-running operations
 * (e.g., SSE streams, bulk reports, PDF generation) or set to 0 to disable timeout completely.
 */
export const SetTimeout = (ms: number) => SetMetadata(TIMEOUT_KEY, ms);
