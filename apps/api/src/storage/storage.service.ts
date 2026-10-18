import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

    const s3Bucket = this.configService.get<string>('AWS_S3_BUCKET');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const region = this.configService.get<string>('AWS_REGION') || 'ap-south-1';

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
      });
      this.logger.log(`Initialized StorageService with AWS S3 driver (Bucket: ${s3Bucket})`);
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
   * Generates a 15-minute (900 seconds) time-limited presigned URL.
   */
  async getPresignedUrl(
    key: string,
    expiresInSeconds: number = 900,
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
