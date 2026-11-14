// ==============================================================================
// Kumaran Chits — Backup & Disaster Recovery Shared Utilities
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1 - §3.4)
// ==============================================================================

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import type { Readable } from 'stream';
import {
  BackupManifest,
  DocumentCategory,
} from './backup-manifest.types';

// Load environment variables from apps/api/.env or repo root
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

export function resolveS3Config(): S3StorageConfig {
  const bucket = process.env.S3_BUCKET || 'kumaran-chits-private';
  const region = process.env.S3_REGION || 'ap-south-1';
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || 'chitflow_admin';
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY || 'chitflow_storage_secret';
  const endpoint = process.env.S3_ENDPOINT;

  const rawForcePath = process.env.S3_FORCE_PATH_STYLE;
  const forcePathStyle =
    rawForcePath !== undefined
      ? rawForcePath === 'true' || rawForcePath === '1'
      : !!endpoint;

  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint: endpoint || undefined,
    forcePathStyle,
  };
}

export function createS3Client(config?: S3StorageConfig): S3Client {
  const cfg = config || resolveS3Config();
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export function computeSha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Classifies document keys according to non-regenerable statutory/security vs regenerable application documents.
 * ADR-15 and Tamil Nadu Chit Funds Rules: KYC & signed security proofs are strictly non-regenerable.
 */
export function classifyDocumentCategory(key: string): DocumentCategory {
  const normalized = key.toLowerCase();
  if (normalized.startsWith('kyc/') || normalized.startsWith('safety-proofs/')) {
    return 'REQUIRED_NON_REGENERABLE';
  }
  if (normalized.startsWith('receipts/')) {
    return 'REGENERABLE_ON_DEMAND';
  }
  // Default non-receipt documents to non-regenerable for company safety
  return 'REQUIRED_NON_REGENERABLE';
}

/**
 * Lists all application-managed objects in a bucket excluding backups/ prefix.
 * Non-destructive discovery using ListObjectsV2 pagination.
 */
export async function listApplicationDocuments(
  s3Client: S3Client,
  bucket: string,
): Promise<{ key: string; size: number; lastModified?: Date }[]> {
  const documents: { key: string; size: number; lastModified?: Date }[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (!obj.Key) continue;
        // Exclude internal backup storage prefix
        if (obj.Key.startsWith('backups/')) continue;
        documents.push({
          key: obj.Key,
          size: obj.Size || 0,
          lastModified: obj.LastModified,
        });
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return documents;
}

/**
 * Reads and parses a backup manifest from S3.
 */
export async function readManifest(
  s3Client: S3Client,
  bucket: string,
  manifestKey: string,
): Promise<BackupManifest | null> {
  try {
    const res = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: manifestKey,
      }),
    );
    if (!res.Body) return null;
    const buffer = await streamToBuffer(res.Body as Readable);
    return JSON.parse(buffer.toString('utf-8')) as BackupManifest;
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Atomically uploads the backup manifest.
 */
export async function writeManifest(
  s3Client: S3Client,
  bucket: string,
  manifestKey: string,
  manifest: BackupManifest,
): Promise<void> {
  const body = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: manifestKey,
      Body: body,
      ContentType: 'application/json',
    }),
  );
}

/**
 * Ensures bucket exists in S3/MinIO.
 */
export async function ensureBucketExists(s3Client: S3Client, bucket: string): Promise<void> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch {
      // Ignore if created concurrently
    }
  }
}

/**
 * Lists all backup sets under backups/sets/ prefix, reading their manifests.
 * Returns sorted newest first.
 */
export async function listBackupSets(
  s3Client: S3Client,
  bucket: string,
): Promise<{ setId: string; manifestKey: string; manifest: BackupManifest | null; timestamp?: Date }[]> {
  const prefix = 'backups/sets/';
  const response = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    }),
  );

  if (!response.Contents) return [];

  const manifestKeys = response.Contents.filter(
    (o) => o.Key && o.Key.endsWith('/manifest.json'),
  ).map((o) => o.Key!);

  const sets: { setId: string; manifestKey: string; manifest: BackupManifest | null; timestamp?: Date }[] = [];

  for (const mKey of manifestKeys) {
    const parts = mKey.split('/');
    const setId = parts[2]; // backups/sets/<setId>/manifest.json
    try {
      const manifest = await readManifest(s3Client, bucket, mKey);
      const timestamp = manifest?.timestamp ? new Date(manifest.timestamp) : undefined;
      sets.push({ setId, manifestKey: mKey, manifest, timestamp });
    } catch {
      sets.push({ setId, manifestKey: mKey, manifest: null });
    }
  }

  return sets.sort((a, b) => {
    const timeA = a.timestamp ? a.timestamp.getTime() : 0;
    const timeB = b.timestamp ? b.timestamp.getTime() : 0;
    return timeB - timeA;
  });
}

/**
 * Prunes expired backup sets (older than retentionDays), ensuring the latest complete set is never deleted.
 * Never touches objects outside backups/sets/ or backups/db/.
 */
export async function pruneExpiredSets(
  s3Client: S3Client,
  bucket: string,
  retentionDays: number = 30,
): Promise<{ prunedSetsCount: number; prunedObjectsCount: number }> {
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const sets = await listBackupSets(s3Client, bucket);

  if (sets.length <= 1) {
    // Always preserve at least 1 backup set regardless of age
    return { prunedSetsCount: 0, prunedObjectsCount: 0 };
  }

  // Find the latest complete set to guarantee protection
  const latestCompleteSet = sets.find((s) => s.manifest?.status === 'COMPLETE');

  let prunedSetsCount = 0;
  let prunedObjectsCount = 0;

  for (const set of sets) {
    // Never prune the latest complete set
    if (latestCompleteSet && set.setId === latestCompleteSet.setId) {
      continue;
    }

    const setTime = set.timestamp ? set.timestamp.getTime() : 0;
    const isExpired = setTime > 0 && setTime < cutoffTime;
    const isIncomplete = set.manifest && set.manifest.status !== 'COMPLETE';

    if (isExpired || isIncomplete) {
      console.log(`[PRUNE] Purging ${isIncomplete ? 'incomplete' : 'expired'} backup set: ${set.setId}`);
      const setPrefix = `backups/sets/${set.setId}/`;
      const objectsRes = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: setPrefix,
        }),
      );

      if (objectsRes.Contents) {
        for (const obj of objectsRes.Contents) {
          if (obj.Key && obj.Key.startsWith('backups/sets/')) {
            await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
            prunedObjectsCount++;
          }
        }
      }
      prunedSetsCount++;
    }
  }

  return { prunedSetsCount, prunedObjectsCount };
}
