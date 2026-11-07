// ==============================================================================
// Kumaran Chits — Restore Database from S3 Backup Archive
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.3)
// ==============================================================================

import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import type { Readable } from 'stream';

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

function resolveConfig() {
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

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export async function listS3Backups(): Promise<{ key: string; size: number; lastModified?: Date }[]> {
  const config = resolveConfig();
  const s3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const listResponse = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: 'backups/db/',
    }),
  );

  if (!listResponse.Contents || listResponse.Contents.length === 0) {
    return [];
  }

  return listResponse.Contents.filter((obj) => obj.Key && obj.Key.endsWith('.dump'))
    .map((obj) => ({
      key: obj.Key!,
      size: obj.Size || 0,
      lastModified: obj.LastModified,
    }))
    .sort((a, b) => {
      const timeA = a.lastModified ? a.lastModified.getTime() : 0;
      const timeB = b.lastModified ? b.lastModified.getTime() : 0;
      return timeB - timeA; // Newest first
    });
}

export async function restoreFromS3(targetKey?: string): Promise<string> {
  const config = resolveConfig();
  const s3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  let keyToRestore = targetKey;
  if (!keyToRestore) {
    console.log(`[RESTORE] No S3 key specified. Fetching latest available backup...`);
    const backups = await listS3Backups();
    if (backups.length === 0) {
      throw new Error(`[ERROR] No database backups found in bucket '${config.bucket}' under prefix 'backups/db/'`);
    }
    keyToRestore = backups[0].key;
    console.log(`[RESTORE] Selected latest backup: ${keyToRestore} (${backups[0].size} bytes)`);
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

  // Write temporary local file
  const tempDir = path.resolve(__dirname, '../../infra/backups');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileName = path.basename(keyToRestore);
  const localFilePath = path.join(tempDir, fileName);
  fs.writeFileSync(localFilePath, dumpBuffer);
  console.log(`[RESTORE] Downloaded ${dumpBuffer.length} bytes to ${localFilePath}`);

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

  console.log(`[RESTORE] Executing pg_restore --clean...`);
  if (isDockerRunning) {
    execSync(`docker cp "${localFilePath}" "chitflow-db:/tmp/${fileName}"`, { stdio: 'inherit' });
    execSync(
      `docker exec chitflow-db pg_restore -U chitflow -d chitflow_dev --clean --if-exists "/tmp/${fileName}"`,
      { stdio: 'inherit' },
    );
    execSync(`docker exec chitflow-db rm "/tmp/${fileName}"`, { stdio: 'ignore' });
  } else {
    const dbUrl =
      process.env.DATABASE_URL ||
      'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public';
    execSync(`pg_restore -d "${dbUrl}" --clean --if-exists "${localFilePath}"`, { stdio: 'inherit' });
  }

  console.log(`[SUCCESS] Database successfully restored from ${keyToRestore}!`);
  return keyToRestore;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const keyArg = args.find((a) => !a.startsWith('--'));

  if (args.includes('--list')) {
    listS3Backups()
      .then((backups) => {
        console.log(`\n=== Kumaran Chits S3 Database Backups ===`);
        if (backups.length === 0) {
          console.log(`No backups found.`);
        } else {
          backups.forEach((b, idx) => {
            console.log(
              `[${idx + 1}] ${b.key} | ${b.size} bytes | ${
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
