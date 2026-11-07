import { Logger } from '@nestjs/common';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;       // Consecutive failures to trip breaker (default: 5)
  resetTimeoutMs?: number;         // Time to wait before testing downstream in HALF_OPEN (default: 30,000ms)
  halfOpenSuccessThreshold?: number; // Consecutive successes in HALF_OPEN to close breaker (default: 2)
  redisClient?: any;               // Optional Redis client for distributed state synchronization across horizontal instances
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
  private readonly redisClient?: any;
  private readonly redisKey: string;

  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCountInHalfOpen = 0;
  private nextAttemptTimestamp = 0;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 2;
    this.redisClient = options.redisClient;
    this.redisKey = `circuit:${this.name}:open_until`;
  }

  public getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state;
  }

  public async execute<T>(
    action: () => Promise<T>,
    fallback?: (error: Error) => Promise<T> | T,
  ): Promise<T> {
    await this.syncDistributedState();
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
        this.clearDistributedState();
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
      this.broadcastDistributedOpenState();
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
    this.clearDistributedState();
  }

  private checkStateTransition(): void {
    if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTimestamp) {
      this.state = 'HALF_OPEN';
      this.successCountInHalfOpen = 0;
      this.logger.log(`Circuit breaker [${this.name}] transitioned to HALF_OPEN (testing downstream health)`);
    }
  }

  private async syncDistributedState(): Promise<void> {
    if (this.redisClient && this.state !== 'OPEN') {
      try {
        const openUntilStr = await this.redisClient.get(this.redisKey);
        if (openUntilStr) {
          const openUntil = Number(openUntilStr);
          if (openUntil > Date.now()) {
            this.state = 'OPEN';
            this.nextAttemptTimestamp = openUntil;
            this.logger.warn(
              `Circuit breaker [${this.name}] synchronized OPEN state from shared Redis cluster (expires in ${Math.ceil((openUntil - Date.now()) / 1000)}s)`,
            );
          }
        }
      } catch (err: any) {
        this.logger.warn(`Redis circuit breaker state read warning: ${err.message}`);
      }
    }
  }

  private broadcastDistributedOpenState(): void {
    if (this.redisClient) {
      const ttlSeconds = Math.max(5, Math.ceil(this.resetTimeoutMs / 1000) + 5);
      this.redisClient
        .set(this.redisKey, String(this.nextAttemptTimestamp), 'EX', ttlSeconds)
        .catch((err: any) => {
          this.logger.warn(`Redis circuit breaker open state broadcast failed: ${err.message}`);
        });
    }
  }

  private clearDistributedState(): void {
    if (this.redisClient) {
      this.redisClient.del(this.redisKey).catch(() => {});
    }
  }
}
