// ==============================================================================
// Kumaran Chits — Standardized API Error Class
// ==============================================================================

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: any[];
}

export class KumaranApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: any[];

  constructor(statusCode: number, payload?: ApiErrorPayload | string) {
    if (typeof payload === 'string') {
      super(payload);
      this.statusCode = statusCode;
      this.code = 'API_ERROR';
      this.details = [];
    } else {
      super(payload?.message || `Request failed with status ${statusCode}`);
      this.statusCode = statusCode;
      this.code = payload?.code || 'UNKNOWN_ERROR';
      this.details = payload?.details || [];
    }

    this.name = 'KumaranApiError';
    Object.setPrototypeOf(this, KumaranApiError.prototype);
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isValidationError(): boolean {
    return this.statusCode === 400 && this.code === 'BAD_REQUEST';
  }

  get isConflict(): boolean {
    return this.statusCode === 409;
  }

  get isInternalServerError(): boolean {
    return this.statusCode >= 500;
  }
}
