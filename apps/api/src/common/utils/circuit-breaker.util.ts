import { Logger } from '@nestjs/common';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;       // Consecutive failures to trip breaker (default: 5)
  resetTimeoutMs?: number;         // Time to wait before testing downstream in HALF_OPEN (default: 30,000ms)
  halfOpenSuccessThreshold?: number; // Consecutive successes in HALF_OPEN to close breaker (default: 2)
}

export class CircuitBreakerOpenException extends Error {
  constructor(name: string, retryAfterMs: number) {
    super(`Circuit breaker [${name}] is OPEN. Fast failing request to protect downstream service. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = 'CircuitBreakerOpenException';
  }
}

export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenSuccessThreshold: number;

  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCountInHalfOpen = 0;
  private nextAttemptTimestamp = 0;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 2;
  }

  public getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state;
  }

  public async execute<T>(
    action: () => Promise<T>,
    fallback?: (error: Error) => Promise<T> | T,
  ): Promise<T> {
    this.checkStateTransition();

    if (this.state === 'OPEN') {
      const remainingMs = Math.max(0, this.nextAttemptTimestamp - Date.now());
      const err = new CircuitBreakerOpenException(this.name, remainingMs);
      if (fallback) {
        return fallback(err);
      }
      throw err;
    }

    try {
      const result = await action();
      this.recordSuccess();
      return result;
    } catch (error: any) {
      this.recordFailure(error);
      if (fallback) {
        return fallback(error);
      }
      throw error;
    }
  }

  public recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCountInHalfOpen++;
      if (this.successCountInHalfOpen >= this.halfOpenSuccessThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCountInHalfOpen = 0;
        this.logger.log(`Circuit breaker [${this.name}] recovered and transitioned to CLOSED`);
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = 0;
    }
  }

  public recordFailure(error: any): void {
    this.failureCount++;
    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTimestamp = Date.now() + this.resetTimeoutMs;
      this.logger.warn(
        `Circuit breaker [${this.name}] TRIPPED to OPEN after ${this.failureCount} failures (Last error: ${error?.message || error}). Will retry in ${this.resetTimeoutMs / 1000}s`,
      );
    }
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCountInHalfOpen = 0;
    this.nextAttemptTimestamp = 0;
  }

  private checkStateTransition(): void {
    if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTimestamp) {
      this.state = 'HALF_OPEN';
      this.successCountInHalfOpen = 0;
      this.logger.log(`Circuit breaker [${this.name}] transitioned to HALF_OPEN (testing downstream health)`);
    }
  }
}
