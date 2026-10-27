import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PRESIGNED_URL_EXPIRES_IN_SECONDS } from '../common/constants';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import { AwsS3StorageDriver } from './drivers/aws-s3-storage.driver';
import { LocalStorageDriver } from './drivers/local-storage.driver';
import {
  FileDownloadResult,
  StorageDriver,
  StorageDriverType,
  UploadResult,
} from './interfaces/storage.interface';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;
  private readonly driverType: StorageDriverType;

  // 10-minute cache TTL preserves a guaranteed 5-minute safety margin on 15-minute URLs
  private readonly CACHE_TTL_SECONDS = 600;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {
    const configuredDriver =
      this.configService.get<string>('STORAGE_DRIVER') || 'local';

    const s3Bucket =
      this.configService.get<string>('S3_BUCKET') ||
      this.configService.get<string>('AWS_S3_BUCKET') ||
      this.configService.get<string>('AWS_S3_BUCKET_NAME');
    const accessKeyId =
      this.configService.get<string>('S3_ACCESS_KEY_ID') ||
      this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey =
      this.configService.get<string>('S3_SECRET_ACCESS_KEY') ||
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const region =
      this.configService.get<string>('S3_REGION') ||
      this.configService.get<string>('AWS_REGION') ||
      'ap-south-1';
    const endpoint =
      this.configService.get<string>('S3_ENDPOINT') ||
      this.configService.get<string>('AWS_ENDPOINT');
    const forcePathStyle =
      this.configService.get<boolean>('S3_FORCE_PATH_STYLE') ??
      this.configService.get<boolean>('AWS_S3_FORCE_PATH_STYLE');

    if (
      configuredDriver === 's3' &&
      s3Bucket &&
      accessKeyId &&
      secretAccessKey
    ) {
      this.driverType = 's3';
      this.driver = new AwsS3StorageDriver({
        bucket: s3Bucket,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint: endpoint || undefined,
        forcePathStyle: forcePathStyle !== undefined ? forcePathStyle : undefined,
      });
      this.logger.log(
        `Initialized StorageService with S3 driver (Bucket: ${s3Bucket}${
          endpoint ? `, Endpoint: ${endpoint}` : ''
        })`,
      );
    } else {
      const localBasePath =
        this.configService.get<string>('LOCAL_STORAGE_PATH') || './storage/uploads';
      this.driverType = 'local';
      this.driver = new LocalStorageDriver(localBasePath);
      this.logger.log(`Initialized StorageService with LocalStorageDriver (Path: ${localBasePath})`);
    }
  }

  getActiveDriverName(): StorageDriverType {
    return this.driverType;
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<UploadResult> {
    return this.driver.upload(key, buffer, mimeType);
  }

  async getFile(key: string): Promise<FileDownloadResult> {
    return this.driver.get(key);
  }

  /**
   * Generates a time-limited presigned URL (defaults to 15 minutes / 900 seconds).
   * Cached in Redis with a 10-minute TTL to provide sub-millisecond retrieval on repeat views.
   */
  async getPresignedUrl(
    key: string,
    expiresInSeconds: number = PRESIGNED_URL_EXPIRES_IN_SECONDS,
  ): Promise<string> {
    const redis = this.redisProvider?.getClient();
    const cacheKey = `url:presigned:${key}`;

    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return cached;
        }
      } catch (err: any) {
        this.logger.warn(`Redis presigned URL cache read error: ${err.message}`);
      }
    }

    const url = await this.driver.getPresignedUrl(key, expiresInSeconds);

    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const cacheTtl = Math.min(this.CACHE_TTL_SECONDS, Math.max(60, expiresInSeconds - 300));
        await redis.set(cacheKey, url, 'EX', cacheTtl);
      } catch (err: any) {
        this.logger.warn(`Redis presigned URL cache write error: ${err.message}`);
      }
    }

    return url;
  }

  /**
   * Batch resolves multiple storage keys in a single roundtrip via Redis MGET pipeline.
   */
  async getBatchPresignedUrls(
    keys: string[],
    expiresInSeconds: number = PRESIGNED_URL_EXPIRES_IN_SECONDS,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (keys.length === 0) return map;

    const redis = this.redisProvider?.getClient();
    const missingKeys: string[] = [];

    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const redisKeys = keys.map((k) => `url:presigned:${k}`);
        const cachedResults = await redis.mget(...redisKeys);
        keys.forEach((key, idx) => {
          const cached = cachedResults[idx];
          if (cached) {
            map.set(key, cached);
          } else {
            missingKeys.push(key);
          }
        });
      } catch (err: any) {
        this.logger.warn(`Redis batch presigned URL cache read error: ${err.message}`);
        missingKeys.push(...keys);
      }
    } else {
      missingKeys.push(...keys);
    }

    if (missingKeys.length > 0) {
      await Promise.all(
        missingKeys.map(async (key) => {
          const url = await this.getPresignedUrl(key, expiresInSeconds);
          map.set(key, url);
        }),
      );
    }

    return map;
  }

  async deleteFile(key: string): Promise<void> {
    const redis = this.redisProvider?.getClient();
    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        await redis.del(`url:presigned:${key}`);
      } catch (err: any) {
        this.logger.warn(`Failed to invalidate presigned URL cache for [${key}]: ${err.message}`);
      }
    }
    return this.driver.delete(key);
  }

  async fileExists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }
}
