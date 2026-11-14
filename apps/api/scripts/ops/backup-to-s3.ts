// ==============================================================================
// Kumaran Chits — Unified S3 Backup & Consistent Recovery Set Engine
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.2, §3.4)
// Invariants: Single-Company, BigInt Whole Rupees, AuditLog Immutability
// ==============================================================================

import {
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import {
  BackupDocumentEntry,
  BackupManifest,
} from './backup-manifest.types';
import {
  classifyDocumentCategory,
  computeSha256,
  createS3Client,
  ensureBucketExists,
  listApplicationDocuments,
  pruneExpiredSets,
  resolveS3Config,
  streamToBuffer,
  writeManifest,
} from './backup-utils';

export interface BackupResult {
  setId: string;
  s3Key: string;
  manifestKey: string;
  manifest: BackupManifest;
  sizeBytes: number;
  documentCount: number;
  prunedCount: number;
}

export async function runBackup(options?: {
  retentionDays?: number;
  skipPrune?: boolean;
}): Promise<BackupResult> {
  const startTime = Date.now();
  const config = resolveS3Config();
  const s3Client = createS3Client(config);

  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestampStr = `${year}${month}${day}_${hours}${minutes}${seconds}`;
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const setId = `set_${timestampStr}_${randomSuffix}`;

  const tempDir = path.resolve(__dirname, '../../../../infra/backups');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const dumpFileName = `kumaran_chits_backup_${timestampStr}.dump`;
  const localDumpPath = path.join(tempDir, dumpFileName);
  const dbSetKey = `backups/sets/${setId}/database.dump`;
  const legacyDbKey = `backups/db/${year}/${month}/${dumpFileName}`;
  const manifestKey = `backups/sets/${setId}/manifest.json`;

  console.log(`[BACKUP] Starting unified recovery set backup for Kumaran Chits...`);
  console.log(`[BACKUP] Backup Set ID: ${setId}`);
  console.log(`[BACKUP] Target S3 Bucket: ${config.bucket}`);

  await ensureBucketExists(s3Client, config.bucket);

  let dumpSizeBytes = 0;
  let dumpSha256 = '';

  // 1. Capture PostgreSQL Custom Binary Dump
  try {
    const isDirectPgDump =
      process.env.DIRECT_PG_DUMP === 'true' ||
      (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('@db:'));

    const isDockerRunning =
      !isDirectPgDump &&
      (() => {
        try {
          const output = execSync(
            'docker ps --filter "name=chitflow-db" --format "{{.Names}}"',
            { encoding: 'utf-8' },
          );
          return output.includes('chitflow-db');
        } catch {
          return false;
        }
      })();

    if (isDockerRunning) {
      console.log(`[BACKUP] Dumping PostgreSQL via container 'chitflow-db'...`);
      execSync(
        `docker exec chitflow-db pg_dump -U chitflow -d chitflow_dev -F c -f "/tmp/${dumpFileName}"`,
        { stdio: 'inherit' },
      );
      execSync(`docker cp "chitflow-db:/tmp/${dumpFileName}" "${localDumpPath}"`, {
        stdio: 'inherit',
      });
      execSync(`docker exec chitflow-db rm -f "/tmp/${dumpFileName}"`, {
        stdio: 'ignore',
      });
    } else {
      const dbUrl =
        process.env.DATABASE_URL ||
        'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public';
      console.log(`[BACKUP] Executing host pg_dump...`);
      execSync(`pg_dump "${dbUrl}" -F c -f "${localDumpPath}"`, { stdio: 'inherit' });
    }

    if (!fs.existsSync(localDumpPath)) {
      throw new Error(`[ERROR] pg_dump failed to produce output at ${localDumpPath}`);
    }

    const dumpBuffer = fs.readFileSync(localDumpPath);
    dumpSizeBytes = dumpBuffer.length;
    dumpSha256 = computeSha256(dumpBuffer);

    console.log(`[BACKUP] Database dump complete (${dumpSizeBytes} bytes, SHA-256: ${dumpSha256.substring(0, 16)}...)`);

    // Upload database dump to set prefix
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: dbSetKey,
        Body: dumpBuffer,
        ContentType: 'application/octet-stream',
      }),
    );

    // Also upload to legacy path for backward-compatible tooling
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: legacyDbKey,
        Body: dumpBuffer,
        ContentType: 'application/octet-stream',
      }),
    );
  } finally {
    if (fs.existsSync(localDumpPath)) {
      fs.unlinkSync(localDumpPath);
    }
  }

  // 2. Query Baseline Financial & Ledger Counts for Manifest Invariants
  const dbUrl =
    process.env.DATABASE_URL ||
    'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public';
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  let recordCounts = {
    users: 0,
    customers: 0,
    chitGroups: 0,
    tickets: 0,
    installmentDues: 0,
    payments: 0,
    auditLogs: 0,
  };

  try {
    const [users, customers, chitGroups, tickets, dues, payments, auditLogs] =
      await Promise.all([
        prisma.user.count(),
        prisma.customer.count(),
        prisma.chitGroup.count(),
        prisma.subscriberTicket.count(),
        prisma.installmentDue.count(),
        prisma.payment.count(),
        prisma.auditLog.count(),
      ]);
    recordCounts = { users, customers, chitGroups, tickets, installmentDues: dues, payments, auditLogs };
  } finally {
    await prisma.$disconnect();
  }

  // 3. Snapshot MinIO Application Documents (KYC, Safety Proofs, Receipts)
  console.log(`[BACKUP] Discovering and snapshotting MinIO document store...`);
  const applicationDocs = await listApplicationDocuments(s3Client, config.bucket);
  console.log(`[BACKUP] Found ${applicationDocs.length} active application documents.`);

  const documentEntries: BackupDocumentEntry[] = [];
  let totalDocSizeBytes = 0;
  let requiredCount = 0;
  let regenerableCount = 0;

  for (const doc of applicationDocs) {
    const backupKey = `backups/sets/${setId}/documents/${doc.key}`;
    const getObj = await s3Client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: doc.key,
      }),
    );

    if (!getObj.Body) {
      throw new Error(`[ERROR] Failed to read active MinIO document during backup: ${doc.key}`);
    }

    const docBuffer = await streamToBuffer(getObj.Body as Readable);
    const sha256 = computeSha256(docBuffer);
    const category = classifyDocumentCategory(doc.key);

    if (category === 'REQUIRED_NON_REGENERABLE') {
      requiredCount++;
    } else {
      regenerableCount++;
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: backupKey,
        Body: docBuffer,
        ContentType: getObj.ContentType || 'application/octet-stream',
      }),
    );

    documentEntries.push({
      originalKey: doc.key,
      backupKey,
      sizeBytes: docBuffer.length,
      sha256,
      category,
      mimeType: getObj.ContentType,
    });
    totalDocSizeBytes += docBuffer.length;
  }

  // 4. Construct and Atomically Write Backup Manifest
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;

  const manifest: BackupManifest = {
    version: '1.0',
    setId,
    timestamp: now.toISOString(),
    status: 'COMPLETE',
    environment: process.env.NODE_ENV || 'development',
    sourceBucket: config.bucket,
    database: {
      format: 'custom',
      dumpFile: 'database.dump',
      s3Key: dbSetKey,
      sizeBytes: dumpSizeBytes,
      sha256: dumpSha256,
      recordCounts,
    },
    documents: {
      prefix: `backups/sets/${setId}/documents/`,
      totalCount: documentEntries.length,
      totalSizeBytes: totalDocSizeBytes,
      requiredCount,
      regenerableCount,
      files: documentEntries,
    },
    verification: {
      completedAt,
      durationMs,
    },
  };

  await writeManifest(s3Client, config.bucket, manifestKey, manifest);
  // Also write latest-manifest pointer
  await writeManifest(s3Client, config.bucket, 'backups/latest-manifest.json', manifest);

  console.log(`[BACKUP] Recovery set manifest atomically written: ${manifestKey}`);

  // 5. Retention Pruner (Default 30 days)
  let prunedCount = 0;
  if (!options?.skipPrune) {
    const pruneRes = await pruneExpiredSets(
      s3Client,
      config.bucket,
      options?.retentionDays ?? 30,
    );
    prunedCount = pruneRes.prunedSetsCount;
  }

  return {
    setId,
    s3Key: dbSetKey,
    manifestKey,
    manifest,
    sizeBytes: dumpSizeBytes + totalDocSizeBytes,
    documentCount: documentEntries.length,
    prunedCount,
  };
}

if (require.main === module) {
  runBackup()
    .then((result) => {
      console.log(`\n======================================================`);
      console.log(`✅ UNIFIED BACKUP COMPLETE`);
      console.log(`   Set ID:         ${result.setId}`);
      console.log(`   Database Key:   ${result.s3Key}`);
      console.log(`   Total Size:     ${result.sizeBytes} bytes`);
      console.log(`   Documents:      ${result.documentCount} files`);
      console.log(`   Pruned Old:     ${result.prunedCount} sets`);
      console.log(`======================================================\n`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`\n❌ BACKUP FAILED:\n`, err);
      process.exit(1);
    });
}
