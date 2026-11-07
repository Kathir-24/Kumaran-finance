import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { StorageKeyHelper } from '../helpers/storage-key.helper';
import {
  FileDownloadResult,
  StorageDriver,
  UploadResult,
} from '../interfaces/storage.interface';

@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly resolvedBasePath: string;

  constructor(basePath: string = './storage/uploads') {
    this.resolvedBasePath = path.resolve(process.cwd(), basePath);
    // Ensure base uploads directory exists
    if (!fs.existsSync(this.resolvedBasePath)) {
      fs.mkdirSync(this.resolvedBasePath, { recursive: true });
    }
  }

  /**
   * Resolves absolute file path safely, rejecting any path traversal escape attempts.
   */
  private resolveFilePath(key: string): string {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(key);
    const fullPath = path.resolve(this.resolvedBasePath, sanitizedKey);

    if (!fullPath.startsWith(this.resolvedBasePath)) {
      throw new NotFoundException('Access denied: Invalid file path');
    }

    return fullPath;
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<UploadResult> {
    const fullPath = this.resolveFilePath(key);
    const parentDir = path.dirname(fullPath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    await fs.promises.writeFile(fullPath, buffer);

    return {
      key: StorageKeyHelper.sanitizeKey(key),
      url: `/api/v1/storage/file/${StorageKeyHelper.sanitizeKey(key)}`,
      sizeBytes: buffer.length,
      mimeType,
    };
  }

  async get(key: string): Promise<FileDownloadResult> {
    const fullPath = this.resolveFilePath(key);

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`File not found: ${key}`);
    }

    const buffer = await fs.promises.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mimeType = this.getMimeType(ext);

    return {
      buffer,
      mimeType,
      sizeBytes: buffer.length,
    };
  }

  async getPresignedUrl(key: string, _expiresInSeconds?: number): Promise<string> {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(key);
    const fullPath = this.resolveFilePath(sanitizedKey);

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`File not found: ${sanitizedKey}`);
    }

    // In local development, returns the local streaming route URL
    return `/api/v1/storage/file/${sanitizedKey}`;
  }

  async getPresignedUploadUrl(
    key: string,
    _mimeType: string,
    _expiresInSeconds: number = 300,
  ): Promise<string> {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(key);
    return `/api/v1/storage/upload/${sanitizedKey}`;
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolveFilePath(key);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const fullPath = this.resolveFilePath(key);
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  private getMimeType(ext: string): string {
    switch (ext) {
      case '.pdf':
        return 'application/pdf';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }
}
