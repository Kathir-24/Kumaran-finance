import { SetMetadata } from '@nestjs/common';

export const BYPASS_ENVELOPE_KEY = 'BYPASS_ENVELOPE';

/**
 * Decorator to exempt specific endpoints (e.g. /health, binary streams, PDFs)
 * from being wrapped in the standard response envelope.
 */
export const BypassEnvelope = () => SetMetadata(BYPASS_ENVELOPE_KEY, true);
