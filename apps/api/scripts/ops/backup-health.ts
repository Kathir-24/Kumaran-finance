// ==============================================================================
// Kumaran Chits — Backup Health & Freshness Verifier
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.4)
// ==============================================================================

import {
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { BackupHealthResult, BackupManifest } from './backup-manifest.types';
import {
  computeSha256,
  createS3Client,
  listBackupSets,
  readManifest,
  resolveS3Config,
  streamToBuffer,
} from './backup-utils';

export interface HealthCheckOptions {
  maxAgeHours?: number;
  verifyChecksums?: boolean;
}

export async function checkBackupHealth(
  options?: HealthCheckOptions,
): Promise<BackupHealthResult> {
  const config = resolveS3Config();
  const s3Client = createS3Client(config);
  const maxAgeHours = options?.maxAgeHours ?? 8; // 8 hours: 3-checkpoint schedule (1:30PM/6:30PM/2AM IST) guarantees max 7h gap

  // 1. Discover latest backup set from S3/MinIO
  const sets = await listBackupSets(s3Client, config.bucket);
  if (sets.length === 0) {
    return {
      healthy: false,
      status: 'MISSING',
      maxAgeHours,
      reason: `No backup sets found in bucket '${config.bucket}' under prefix 'backups/sets/'`,
    };
  }

  const latestSet = sets[0];
  let manifest = latestSet.manifest;

  if (!manifest) {
    manifest = await readManifest(s3Client, config.bucket, latestSet.manifestKey);
  }

  if (!manifest) {
    return {
      healthy: false,
      status: 'CORRUPT',
      setId: latestSet.setId,
      maxAgeHours,
      reason: `Manifest file is unreadable or malformed: ${latestSet.manifestKey}`,
    };
  }

  // 2. Validate Manifest Status
  if (manifest.status !== 'COMPLETE') {
    return {
      healthy: false,
      status: 'INCOMPLETE',
      setId: manifest.setId,
      timestamp: manifest.timestamp,
      maxAgeHours,
      reason: `Latest backup set has status '${manifest.status}', not 'COMPLETE'`,
      details: { error: manifest.error },
    };
  }

  // 3. Validate Freshness (RPO compliance: <= 8 hours; 3-checkpoint schedule: 1:30PM/6:30PM/2AM IST)
  const backupTime = new Date(manifest.timestamp).getTime();
  const now = Date.now();
  const ageMs = Math.max(0, now - backupTime);
  const ageHours = Number((ageMs / (1000 * 60 * 60)).toFixed(2));

  if (ageHours > maxAgeHours) {
    return {
      healthy: false,
      status: 'STALE',
      setId: manifest.setId,
      timestamp: manifest.timestamp,
      ageHours,
      maxAgeHours,
      dbSizeBytes: manifest.database.sizeBytes,
      documentsCount: manifest.documents.totalCount,
      reason: `Latest backup is stale: ${ageHours} hours old (threshold is ${maxAgeHours} hours)`,
    };
  }

  // 4. Verify Database Dump Existence and Size in S3
  try {
    const headRes = await s3Client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: manifest.database.s3Key,
      }),
    );

    if (headRes.ContentLength !== manifest.database.sizeBytes) {
      return {
        healthy: false,
        status: 'CORRUPT',
        setId: manifest.setId,
        timestamp: manifest.timestamp,
        ageHours,
        maxAgeHours,
        reason: `Database dump size mismatch: S3 reports ${headRes.ContentLength} bytes, manifest specifies ${manifest.database.sizeBytes} bytes`,
      };
    }
  } catch (err: any) {
    return {
      healthy: false,
      status: 'CORRUPT',
      setId: manifest.setId,
      timestamp: manifest.timestamp,
      ageHours,
      maxAgeHours,
      reason: `Database dump object missing in S3: ${manifest.database.s3Key} (${err.message})`,
    };
  }

  // 5. Verify Backed-Up Documents in S3 (Existence & Size)
  const missingDocs: string[] = [];
  const corruptSizeDocs: string[] = [];

  for (const doc of manifest.documents.files) {
    try {
      const headDoc = await s3Client.send(
        new HeadObjectCommand({
          Bucket: config.bucket,
          Key: doc.backupKey,
        }),
      );
      if (headDoc.ContentLength !== doc.sizeBytes) {
        corruptSizeDocs.push(`${doc.backupKey} (S3: ${headDoc.ContentLength}b vs manifest: ${doc.sizeBytes}b)`);
      }
    } catch {
      missingDocs.push(doc.backupKey);
    }
  }

  if (missingDocs.length > 0 || corruptSizeDocs.length > 0) {
    return {
      healthy: false,
      status: 'CORRUPT',
      setId: manifest.setId,
      timestamp: manifest.timestamp,
      ageHours,
      maxAgeHours,
      reason: `Backup set has corrupted document storage: ${missingDocs.length} missing files, ${corruptSizeDocs.length} size mismatches`,
      details: {
        missingDocuments: missingDocs.slice(0, 5),
        corruptSizeDocuments: corruptSizeDocs.slice(0, 5),
      },
    };
  }

  // 6. Deep Checksum Verification (Optional / on-demand via --verify-checksums)
  let dbSha256Valid = true;
  let docsSha256Valid = true;

  if (options?.verifyChecksums) {
    // 6a. Verify database dump checksum
    const getRes = await s3Client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: manifest.database.s3Key,
      }),
    );
    if (!getRes.Body) {
      return {
        healthy: false,
        status: 'CORRUPT',
        setId: manifest.setId,
        maxAgeHours,
        reason: `Database dump body empty on S3: ${manifest.database.s3Key}`,
      };
    }
    const dbBuffer = await streamToBuffer(getRes.Body as Readable);
    const calculatedSha = computeSha256(dbBuffer);
    if (calculatedSha !== manifest.database.sha256) {
      dbSha256Valid = false;
      return {
        healthy: false,
        status: 'CORRUPT',
        setId: manifest.setId,
        timestamp: manifest.timestamp,
        ageHours,
        maxAgeHours,
        dbSha256Valid: false,
        reason: `Database dump SHA-256 checksum mismatch! Expected ${manifest.database.sha256}, got ${calculatedSha}`,
      };
    }

    // 6b. Verify SHA-256 checksums across backed-up document objects
    const checksumMismatches: string[] = [];
    for (const doc of manifest.documents.files) {
      const docRes = await s3Client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: doc.backupKey,
        }),
      );
      if (!docRes.Body) {
        checksumMismatches.push(`${doc.backupKey}: empty object body`);
        continue;
      }
      const docBuf = await streamToBuffer(docRes.Body as Readable);
      const docSha = computeSha256(docBuf);
      if (docSha !== doc.sha256) {
        checksumMismatches.push(`${doc.backupKey}: expected ${doc.sha256.substring(0, 16)}..., got ${docSha.substring(0, 16)}...`);
      }
    }

    if (checksumMismatches.length > 0) {
      docsSha256Valid = false;
      return {
        healthy: false,
        status: 'CORRUPT',
        setId: manifest.setId,
        timestamp: manifest.timestamp,
        ageHours,
        maxAgeHours,
        dbSha256Valid: true,
        reason: `Document SHA-256 checksum verification failed for ${checksumMismatches.length} files: ${checksumMismatches.slice(0, 3).join(', ')}`,
        details: { checksumMismatches: checksumMismatches.slice(0, 10) },
      };
    }
  }

  return {
    healthy: true,
    status: 'HEALTHY',
    setId: manifest.setId,
    timestamp: manifest.timestamp,
    ageHours,
    maxAgeHours,
    dbSizeBytes: manifest.database.sizeBytes,
    dbSha256Valid,
    documentsCount: manifest.documents.totalCount,
    details: {
      requiredDocs: manifest.documents.requiredCount,
      regenerableDocs: manifest.documents.regenerableCount,
      recordCounts: manifest.database.recordCounts,
    },
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const verifyChecksums = args.includes('--verify-checksums');
  const maxAgeArg = args.find((a) => a.startsWith('--max-age='));
  const maxAgeHours = maxAgeArg
    ? parseFloat(maxAgeArg.split('=')[1])
    : undefined;

  checkBackupHealth({ maxAgeHours, verifyChecksums })
    .then((result) => {
      console.log(`\n======================================================`);
      console.log(`🏥 KUMARAN CHITS — BACKUP HEALTH CHECK`);
      console.log(`======================================================`);
      console.log(`   Status:       ${result.healthy ? '✅ HEALTHY' : '❌ ' + result.status}`);
      if (result.setId) console.log(`   Set ID:       ${result.setId}`);
      if (result.timestamp) console.log(`   Timestamp:    ${result.timestamp}`);
      if (result.ageHours !== undefined)
        console.log(`   Backup Age:   ${result.ageHours} hours (Max allowed: ${result.maxAgeHours}h)`);
      if (result.dbSizeBytes !== undefined)
        console.log(`   DB Size:      ${result.dbSizeBytes} bytes`);
      if (result.documentsCount !== undefined)
        console.log(`   Documents:    ${result.documentsCount} files`);
      if (result.reason) console.log(`   Alert/Reason: ${result.reason}`);
      console.log(`======================================================\n`);

      process.exit(result.healthy ? 0 : 1);
    })
    .catch((err) => {
      console.error(`\n❌ HEALTH CHECK ERROR:\n`, err);
      process.exit(1);
    });
}
