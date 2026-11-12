// ==============================================================================
// Kumaran Chits — AsyncLocalStorage Per-Request Execution Context (DEF-FE-06)
// Propagates verified client IP, X-Request-ID, and User-Agent across Guards,
// Services, and Prisma transactions without polluting service signatures.
// ==============================================================================

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export class RequestContext {
  static run<T>(store: RequestContextStore, fn: () => T): T {
    return requestContextStorage.run(store, fn);
  }

  static getStore(): RequestContextStore | undefined {
    return requestContextStorage.getStore();
  }

  static getRequestId(): string | undefined {
    return requestContextStorage.getStore()?.requestId;
  }

  static getIpAddress(): string | undefined {
    return requestContextStorage.getStore()?.ipAddress;
  }

  static getUserAgent(): string | undefined {
    return requestContextStorage.getStore()?.userAgent;
  }
}
