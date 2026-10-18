import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
}

@Injectable()
export class AwsS3StorageDriver implements StorageDriver {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(config: AwsS3Config) {
    this.bucket = config.bucket;
    this.s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<UploadResult> {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(key);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: sanitizedKey,
      Body: buffer,
      ContentType: mimeType,
      ServerSideEncryption: 'AES256', // Mandatory server-side encryption
    });

    await this.s3Client.send(command);

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
