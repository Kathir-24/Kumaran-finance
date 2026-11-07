import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Readable } from 'stream';
import { StorageKeyHelper } from '../helpers/storage-key.helper';
import {
  FileDownloadResult,
  StorageDriver,
  UploadResult,
} from '../interfaces/storage.interface';

export interface AwsS3Config {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

@Injectable()
export class AwsS3StorageDriver implements StorageDriver {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly isCustomEndpoint: boolean;

  constructor(config: AwsS3Config) {
    this.bucket = config.bucket;
    this.isCustomEndpoint = !!config.endpoint;
    this.s3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? (!!config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 5000, // 5s connection timeout
        requestTimeout: 10000,    // 10s socket/read timeout
      }),
    });
  }

  async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch {
        // Bucket may already exist or be owned
      }
    }
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<UploadResult> {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(key);

    const putParams: any = {
      Bucket: this.bucket,
      Key: sanitizedKey,
      Body: buffer,
      ContentType: mimeType,
      ...(this.isCustomEndpoint ? {} : { ServerSideEncryption: 'AES256' }),
    };

    try {
      await this.s3Client.send(new PutObjectCommand(putParams));
    } catch {
      // If bucket does not exist yet (e.g. fresh MinIO instance), create and retry once
      await this.ensureBucketExists();
      await this.s3Client.send(new PutObjectCommand(putParams));
    }

    const presignedUrl = await this.getPresignedUrl(sanitizedKey, 900);

    return {
      key: sanitizedKey,
      url: presignedUrl,
      sizeBytes: buffer.length,
      mimeType,
    };
  }

  async get(key: string): Promise<FileDownloadResult> {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(key);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: sanitizedKey,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new NotFoundException(`File body empty in S3: ${sanitizedKey}`);
      }

      // Convert ReadableStream / Node stream to Buffer
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const buffer = Buffer.concat(chunks);

      return {
        buffer,
        mimeType: response.ContentType || 'application/octet-stream',
        sizeBytes: buffer.length,
      };
    } catch (error: any) {
      if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException(`File not found in S3: ${sanitizedKey}`);
      }
      throw error;
    }
  }

  async getPresignedUrl(key: string, expiresInSeconds: number = 900): Promise<string> {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(key);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: sanitizedKey,
    });

    // 15-minute (900 seconds) standard expiration
    return getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async getPresignedUploadUrl(
    key: string,
    mimeType: string,
    expiresInSeconds: number = 300,
  ): Promise<string> {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(key);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: sanitizedKey,
      ContentType: mimeType,
      ...(this.isCustomEndpoint ? {} : { ServerSideEncryption: 'AES256' }),
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(key);

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: sanitizedKey,
    });

    await this.s3Client.send(command);
  }

  async exists(key: string): Promise<boolean> {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(key);

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: sanitizedKey,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      return false;
    }
  }
}
