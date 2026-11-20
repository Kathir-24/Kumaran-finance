import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisConnectionProvider implements OnModuleDestroy {
  private readonly logger = new Logger(RedisConnectionProvider.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    this.initClient();
  }

  private initClient(): void {
    const host = this.configService.get<string>('REDIS_HOST', '127.0.0.1');
    const port = Number(this.configService.get<number>('REDIS_PORT', 6379));
    const db = Number(this.configService.get<number>('REDIS_DB', 0)) || 0;
    const password = this.configService.get<string>('REDIS_PASSWORD');
    const rawTls = this.configService.get<string | boolean | object>('REDIS_TLS');

    const tls =
      typeof rawTls === 'object' && rawTls !== null
        ? rawTls
        : rawTls === true || rawTls === 'true' || rawTls === '1'
          ? {}
          : undefined;

    try {
      this.client = new Redis({
        host,
        port,
        db,
        ...(password && password.trim() ? { password: password.trim() } : {}),
        ...(tls ? { tls } : {}),
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,
        retryStrategy: (times) => {
          const delay = Math.min(times * 250, 3000) + Math.floor(Math.random() * 250);
          if (times <= 3 || times % 10 === 0) {
            this.logger.warn(
              `Redis connection attempt #${times} failed. Retrying in ${delay}ms...`,
            );
          }
          return delay;
        },
        lazyConnect: true,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`Connected to Redis at ${host}:${port} (db ${db})`);
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        this.logger.log(`Redis connection ready at ${host}:${port} (db ${db})`);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.logger.warn('Redis connection closed');
      });

      this.client.on('reconnecting', (delay?: number) => {
        this.isConnected = false;
        this.logger.debug(
          `Reconnecting to Redis at ${host}:${port}...${delay !== undefined ? ` (next retry in ${delay}ms)` : ''}`,
        );
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection error: ${err.message}`);
      });

      this.client.on('end', () => {
        this.isConnected = false;
        this.logger.warn('Redis connection ended');
      });

      // Attempt initial connection without blocking boot
      this.client.connect().catch((err) => {
        this.logger.warn(`Could not connect to Redis initially (${err.message}). Using fallback.`);
      });
    } catch (err: any) {
      this.logger.warn(`Failed to initialize Redis client: ${err.message}`);
      this.client = null;
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
  }
}
