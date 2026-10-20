import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PRESIGNED_URL_EXPIRES_IN_SECONDS } from '../common/constants';
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

  constructor(private readonly configService: ConfigService) {
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
   */
  async getPresignedUrl(
    key: string,
    expiresInSeconds: number = PRESIGNED_URL_EXPIRES_IN_SECONDS,
  ): Promise<string> {
    return this.driver.getPresignedUrl(key, expiresInSeconds);
  }

  async deleteFile(key: string): Promise<void> {
    return this.driver.delete(key);
  }

  async fileExists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }
}
