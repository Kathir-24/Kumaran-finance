// ==============================================================================
// Kumaran Chits — Automated S3 Database Backup & Retention Pruner
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.2, §3.4)
// ==============================================================================

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from apps/api/.env or root .env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

interface BackupConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  retentionDays: number;
}

function resolveConfig(): BackupConfig {
  const bucket =
    process.env.S3_BUCKET ||
    process.env.AWS_S3_BUCKET ||
    process.env.AWS_S3_BUCKET_NAME ||
    'kumaran-chits-private';

  const region =
    process.env.S3_REGION || process.env.AWS_REGION || 'ap-south-1';

  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || 'chitflow_admin';

  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    'chitflow_storage_secret';

  const endpoint = process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT;

  const rawForcePath =
    process.env.S3_FORCE_PATH_STYLE || process.env.AWS_S3_FORCE_PATH_STYLE;
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
    retentionDays: 30, // Mandated by docs/06-devops/infrastructure-and-drp.md §3.2
  };
}

function createS3Client(config: BackupConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function getFormattedTimestamp(): { timestamp: string; year: string; month: string } {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return {
    timestamp: `${year}${month}${day}_${hours}${minutes}${seconds}`,
    year,
    month,
  };
}

async function pruneOldBackups(s3Client: S3Client, config: BackupConfig): Promise<number> {
  const cutoffTime = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;
  let prunedCount = 0;

  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: 'backups/db/',
    });

    const response = await s3Client.send(listCommand);
    if (!response.Contents || response.Contents.length === 0) {
      return 0;
    }

    for (const object of response.Contents) {
      if (object.Key && object.LastModified && object.LastModified.getTime() < cutoffTime) {
        console.log(`[PRUNE] Deleting expired backup older than ${config.retentionDays} days: ${object.Key}`);
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: object.Key,
          }),
        );
        prunedCount++;
      }
    }
  } catch (error) {
    console.warn(`[WARN] Retention pruner encountered a non-fatal warning: ${(error as Error).message}`);
  }

  return prunedCount;
}

export async function runBackup(): Promise<{ s3Key: string; sizeBytes: number; prunedCount: number }> {
  const config = resolveConfig();
  const s3Client = createS3Client(config);
  const { timestamp, year, month } = getFormattedTimestamp();

  const backupFileName = `kumaran_chits_backup_${timestamp}.dump`;
  const s3Key = `backups/db/${year}/${month}/${backupFileName}`;

  // Local temporary directory
  const tempDir = path.resolve(__dirname, '../../infra/backups');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const localFilePath = path.join(tempDir, backupFileName);

  console.log(`[BACKUP] Starting automated database backup for Kumaran Chits...`);
  console.log(`[BACKUP] Target S3 Bucket: ${config.bucket}`);
  console.log(`[BACKUP] S3 Destination Key: ${s3Key}`);

  // 1. Generate pg_dump in custom binary format (-F c)
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

  if (isDockerRunning) {
    console.log(`[BACKUP] Detected running Docker container 'chitflow-db'. Dumping via container...`);
    execSync(
      `docker exec chitflow-db pg_dump -U chitflow -d chitflow_dev -F c -f "/tmp/${backupFileName}"`,
      { stdio: 'inherit' },
    );
    execSync(`docker cp "chitflow-db:/tmp/${backupFileName}" "${localFilePath}"`, {
      stdio: 'inherit',
    });
    execSync(`docker exec chitflow-db rm "/tmp/${backupFileName}"`, {
      stdio: 'ignore',
    });
  } else {
    // Attempt local pg_dump connection via DATABASE_URL
    const dbUrl =
      process.env.DATABASE_URL ||
      'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public';
    console.log(`[BACKUP] Executing host pg_dump with connection string...`);
    execSync(`pg_dump "${dbUrl}" -F c -f "${localFilePath}"`, { stdio: 'inherit' });
  }

  if (!fs.existsSync(localFilePath)) {
    throw new Error(`[ERROR] pg_dump failed to produce output at ${localFilePath}`);
  }

  const fileStats = fs.statSync(localFilePath);
  const fileBuffer = fs.readFileSync(localFilePath);

  console.log(`[BACKUP] Local dump created successfully (${fileStats.size} bytes).`);
  console.log(`[BACKUP] Ensuring S3 bucket '${config.bucket}' exists...`);

  // Ensure bucket exists on S3 / MinIO
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: config.bucket }));
  } catch {
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: config.bucket }));
      console.log(`[BACKUP] Created bucket '${config.bucket}' in S3 storage.`);
    } catch {
      // Ignore if exists
    }
  }

  console.log(
    config.endpoint
      ? `[BACKUP] Uploading to S3/MinIO storage...`
      : `[BACKUP] Uploading to AWS S3 storage with AES256 server-side encryption...`,
  );

  // 2. Upload to S3 storage (AES256 SSE on AWS S3; standard on local MinIO)
  const putParams: any = {
    Bucket: config.bucket,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: 'application/octet-stream',
  };
  if (!config.endpoint) {
    putParams.ServerSideEncryption = 'AES256';
  }

  await s3Client.send(new PutObjectCommand(putParams));

  console.log(`[SUCCESS] Database backup uploaded to S3: s3://${config.bucket}/${s3Key}`);

  // 3. Prune snapshots older than 30 days per docs/06-devops/infrastructure-and-drp.md §3.2
  const prunedCount = await pruneOldBackups(s3Client, config);
  console.log(`[PRUNE] Retention check completed. Expired backups removed: ${prunedCount}`);

  return {
    s3Key,
    sizeBytes: fileStats.size,
    prunedCount,
  };
}

// Execute directly if run as CLI script
if (require.main === module) {
  runBackup()
    .then((result) => {
      console.log(`\n======================================================`);
      console.log(`✅ DATABASE BACKUP TO S3 COMPLETE`);
      console.log(`   S3 Key:      ${result.s3Key}`);
      console.log(`   File Size:   ${result.sizeBytes} bytes`);
      console.log(`   Pruned Old:  ${result.prunedCount} files`);
      console.log(`======================================================\n`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`\n❌ BACKUP FAILED:\n`, err);
      process.exit(1);
    });
}
