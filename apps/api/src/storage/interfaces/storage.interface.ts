export type StorageDriverType = 'local' | 's3';

export interface UploadResult {
  key: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}

export interface FileDownloadResult {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

export interface StorageDriver {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<UploadResult>;
  get(key: string): Promise<FileDownloadResult>;
  getPresignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
