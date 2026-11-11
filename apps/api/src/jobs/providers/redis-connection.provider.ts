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
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const db = Number(this.configService.get<number>('REDIS_DB', 0)) || 0;

    try {
      this.client = new Redis({
        host,
        port,
        db,
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn(
              `Redis connection failed after ${times} retries. Background jobs will operate in fallback mode.`,
            );
            return null; // Stop reconnecting after 3 tries in local/dev
          }
          return Math.min(times * 500, 2000);
        },
        lazyConnect: true,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`Connected to Redis at ${host}:${port} (db ${db})`);
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection error: ${err.message}`);
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
