// ==============================================================================
// Kumaran Chits — Restore Database & Documents from S3 Archive
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.3)
// ==============================================================================

import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { Readable } from 'stream';
import { BackupManifest } from './backup-manifest.types';
import {
  computeSha256,
  createS3Client,
  ensureBucketExists,
  listBackupSets,
  readManifest,
  resolveS3Config,
  streamToBuffer,
} from './backup-utils';

export async function listS3Backups(): Promise<
  { key: string; size: number; lastModified?: Date; setId?: string; isSet?: boolean; manifest?: BackupManifest | null }[]
> {
  const config = resolveS3Config();
  const s3Client = createS3Client(config);

  const sets = await listBackupSets(s3Client, config.bucket);
  const results: {
    key: string;
    size: number;
    lastModified?: Date;
    setId?: string;
    isSet?: boolean;
    manifest?: BackupManifest | null;
  }[] = [];

  for (const set of sets) {
    if (set.manifest) {
      results.push({
        key: set.manifest.database.s3Key,
        size: set.manifest.database.sizeBytes,
        lastModified: set.timestamp,
        setId: set.setId,
        isSet: true,
        manifest: set.manifest,
      });
    }
  }

  // Also query legacy dumps under backups/db/
  const listResponse = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: 'backups/db/',
    }),
  );

  if (listResponse.Contents) {
    for (const obj of listResponse.Contents) {
      if (obj.Key && obj.Key.endsWith('.dump')) {
        results.push({
          key: obj.Key,
          size: obj.Size || 0,
          lastModified: obj.LastModified,
          isSet: false,
        });
      }
    }
  }

  return results.sort((a, b) => {
    const timeA = a.lastModified ? a.lastModified.getTime() : 0;
    const timeB = b.lastModified ? b.lastModified.getTime() : 0;
    return timeB - timeA;
  });
}

export async function restoreDatabaseFromS3(options?: {
  targetKey?: string;
  setId?: string;
  targetDbName?: string;
  skipChecksumCheck?: boolean;
}): Promise<{ restoredKey: string; targetDb: string; dumpSizeBytes: number }> {
  const config = resolveS3Config();
  const s3Client = createS3Client(config);
  const targetDb = options?.targetDbName || process.env.POSTGRES_DB || 'chitflow_dev';

  let keyToRestore = options?.targetKey;
  let expectedSha256: string | undefined;

  if (options?.setId) {
    const manifestKey = `backups/sets/${options.setId}/manifest.json`;
    const manifest = await readManifest(s3Client, config.bucket, manifestKey);
    if (!manifest) {
      throw new Error(`[ERROR] Manifest not found for set ID: ${options.setId}`);
    }
    keyToRestore = manifest.database.s3Key;
    expectedSha256 = manifest.database.sha256;
  } else if (!keyToRestore) {
    console.log(`[RESTORE] No backup key specified. Finding latest verified backup set...`);
    const backups = await listS3Backups();
    if (backups.length === 0) {
      throw new Error(`[ERROR] No backups found in bucket '${config.bucket}'`);
    }
    const latest = backups[0];
    keyToRestore = latest.key;
    if (latest.manifest) {
      expectedSha256 = latest.manifest.database.sha256;
    }
    console.log(`[RESTORE] Selected latest backup: ${keyToRestore} (${latest.size} bytes)`);
  }

  console.log(`[RESTORE] Downloading backup from S3: s3://${config.bucket}/${keyToRestore}`);
  const getResponse = await s3Client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: keyToRestore,
    }),
  );

  if (!getResponse.Body) {
    throw new Error(`[ERROR] S3 GetObject returned empty body for key: ${keyToRestore}`);
  }

  const dumpBuffer = await streamToBuffer(getResponse.Body as Readable);

  // Validate Checksum if manifest metadata is available
  if (expectedSha256 && !options?.skipChecksumCheck) {
    const actualSha256 = computeSha256(dumpBuffer);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `[SECURITY ERROR] Checksum mismatch! Backup file may be corrupted or tampered.\nExpected: ${expectedSha256}\nActual:   ${actualSha256}`,
      );
    }
    console.log(`[RESTORE] Checksum verified: SHA-256 matches manifest.`);
  }

  // Write temporary local file
  const tempDir = path.resolve(__dirname, '../../../../infra/backups');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileName = path.basename(keyToRestore);
  const localFilePath = path.join(tempDir, fileName);

  try {
    fs.writeFileSync(localFilePath, dumpBuffer);
    console.log(`[RESTORE] Staged ${dumpBuffer.length} bytes at ${localFilePath}`);

    // Restore into Postgres
    const isDockerRunning = (() => {
      try {
        const output = execSync('docker ps --filter "name=chitflow-db" --format "{{.Names}}"', {
          encoding: 'utf-8',
        });
        return output.includes('chitflow-db');
      } catch {
        return false;
      }
    })();

    console.log(`[RESTORE] Executing pg_restore --clean into database '${targetDb}'...`);
    if (isDockerRunning) {
      execSync(`docker cp "${localFilePath}" "chitflow-db:/tmp/${fileName}"`, { stdio: 'inherit' });
      execSync(
        `docker exec chitflow-db pg_restore -U chitflow -d "${targetDb}" --clean --if-exists "/tmp/${fileName}"`,
        { stdio: 'inherit' },
      );
      execSync(`docker exec chitflow-db rm -f "/tmp/${fileName}"`, { stdio: 'ignore' });
    } else {
      const dbUrl = (
        process.env.DATABASE_URL ||
        'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public'
      ).replace(/\/chitflow_dev\?/, `/${targetDb}?`);
      execSync(`pg_restore -d "${dbUrl}" --clean --if-exists "${localFilePath}"`, { stdio: 'inherit' });
    }
  } finally {
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
  }

  console.log(`[SUCCESS] Database successfully restored into '${targetDb}' from ${keyToRestore}!`);
  return {
    restoredKey: keyToRestore,
    targetDb,
    dumpSizeBytes: dumpBuffer.length,
  };
}

/**
 * Restores documents from a backup set into a target MinIO bucket.
 * Non-destructive: preserves original keys and verifies checksums.
 */
export async function restoreDocumentsFromSet(
  setId: string,
  targetBucket: string,
): Promise<{ restoredCount: number; failedCount: number; errors: string[] }> {
  const config = resolveS3Config();
  const s3Client = createS3Client(config);

  await ensureBucketExists(s3Client, targetBucket);

  const manifestKey = `backups/sets/${setId}/manifest.json`;
  const manifest = await readManifest(s3Client, config.bucket, manifestKey);

  if (!manifest) {
    throw new Error(`[ERROR] Manifest not found for set ID: ${setId}`);
  }

  console.log(`[RESTORE-DOCS] Restoring ${manifest.documents.totalCount} documents from set '${setId}' to bucket '${targetBucket}'...`);

  let restoredCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const doc of manifest.documents.files) {
    try {
      const getRes = await s3Client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: doc.backupKey,
        }),
      );

      if (!getRes.Body) {
        throw new Error(`Empty body for backup key: ${doc.backupKey}`);
      }

      const buffer = await streamToBuffer(getRes.Body as Readable);
      const sha256 = computeSha256(buffer);

      if (sha256 !== doc.sha256) {
        throw new Error(`Checksum mismatch on ${doc.backupKey}: expected ${doc.sha256}, got ${sha256}`);
      }

      await s3Client.send(
        new PutObjectCommand({
          Bucket: targetBucket,
          Key: doc.originalKey,
          Body: buffer,
          ContentType: doc.mimeType || 'application/octet-stream',
        }),
      );

      restoredCount++;
    } catch (err: any) {
      failedCount++;
      errors.push(`${doc.originalKey}: ${err.message}`);
    }
  }

  console.log(`[RESTORE-DOCS] Completed: ${restoredCount} restored, ${failedCount} failed.`);
  return { restoredCount, failedCount, errors };
}

// Default export wrapper for backward compatibility
export async function restoreFromS3(targetKey?: string): Promise<string> {
  const res = await restoreDatabaseFromS3({ targetKey });
  return res.restoredKey;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const keyArg = args.find((a) => !a.startsWith('--'));

  if (args.includes('--list')) {
    listS3Backups()
      .then((backups) => {
        console.log(`\n=== Kumaran Chits S3 Backups & Recovery Sets ===`);
        if (backups.length === 0) {
          console.log(`No backups found.`);
        } else {
          backups.forEach((b, idx) => {
            const setTag = b.isSet ? `[RECOVERY SET: ${b.setId}]` : '[LEGACY DUMP]';
            const docsTag = b.manifest ? `| Docs: ${b.manifest.documents.totalCount}` : '';
            console.log(
              `[${idx + 1}] ${setTag} ${b.key} | ${b.size} bytes ${docsTag} | ${
                b.lastModified ? b.lastModified.toISOString() : 'Unknown date'
              }`,
            );
          });
        }
        process.exit(0);
      })
      .catch((err) => {
        console.error(`Failed to list backups:`, err);
        process.exit(1);
      });
  } else {
    restoreFromS3(keyArg)
      .then((restoredKey) => {
        console.log(`\n======================================================`);
        console.log(`✅ DATABASE RESTORE FROM S3 COMPLETE`);
        console.log(`   Restored Source: ${restoredKey}`);
        console.log(`======================================================\n`);
        process.exit(0);
      })
      .catch((err) => {
        console.error(`\n❌ RESTORE FAILED:\n`, err);
        process.exit(1);
      });
  }
}
