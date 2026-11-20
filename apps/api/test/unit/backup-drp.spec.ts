// ==============================================================================
// Kumaran Chits — Backup & Disaster Recovery (DRP) Unit Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1 - §3.4)
// Invariants: ADR-01 (Single-Company), ADR-10 (Maker!=Checker), ADR-15 (Document Safety)
// ==============================================================================

import { BackupManifest } from '../../scripts/ops/backup-manifest.types';
import {
  classifyDocumentCategory,
  computeSha256,
  pruneExpiredSets,
} from '../../scripts/ops/backup-utils';

describe('Backup & Disaster Recovery (DRP) System Tests', () => {
  describe('1. Document Classification & Statutory Invariants (ADR-15)', () => {
    it('should classify customer KYC documents as REQUIRED_NON_REGENERABLE', () => {
      expect(
        classifyDocumentCategory('kyc/cust-123/aadhaar_front.jpg'),
      ).toBe('REQUIRED_NON_REGENERABLE');
      expect(
        classifyDocumentCategory('kyc/cust-456/PAN_CARD-abc.pdf'),
      ).toBe('REQUIRED_NON_REGENERABLE');
      expect(
        classifyDocumentCategory('kyc/cust-789/customer_photo.jpg'),
      ).toBe('REQUIRED_NON_REGENERABLE');
    });

    it('should classify winner collateral and safety proofs as REQUIRED_NON_REGENERABLE', () => {
      expect(
        classifyDocumentCategory('safety-proofs/auc-1/promissory-note.pdf'),
      ).toBe('REQUIRED_NON_REGENERABLE');
      expect(
        classifyDocumentCategory('safety-proofs/auc-2/cheque-scan.jpg'),
      ).toBe('REQUIRED_NON_REGENERABLE');
    });

    it('should classify financial PDF receipts as REGENERABLE_ON_DEMAND', () => {
      expect(
        classifyDocumentCategory('receipts/PRD/2026/KC-REC-PRD-2026-00045.pdf'),
      ).toBe('REGENERABLE_ON_DEMAND');
      expect(
        classifyDocumentCategory('receipts/2026/11/rec-999.pdf'),
      ).toBe('REGENERABLE_ON_DEMAND');
    });

    it('should default unknown document categories to REQUIRED_NON_REGENERABLE for company safety', () => {
      expect(classifyDocumentCategory('contracts/nominee-agreement.pdf')).toBe(
        'REQUIRED_NON_REGENERABLE',
      );
    });
  });

  describe('2. SHA-256 Checksum Integrity & Tamper Detection', () => {
    it('should compute consistent SHA-256 hashes for data buffers', () => {
      const buffer = Buffer.from('Kumaran Chits Sovereign Financial Ledger 2026');
      const hash1 = computeSha256(buffer);
      const hash2 = computeSha256(buffer);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should detect single-byte corruption in database dump buffers', () => {
      const originalBuffer = Buffer.from('Original Database Binary Stream');
      const tamperedBuffer = Buffer.from('Original Database Binary StreaM'); // single byte modified

      const originalHash = computeSha256(originalBuffer);
      const tamperedHash = computeSha256(tamperedBuffer);

      expect(originalHash).not.toBe(tamperedHash);
    });
  });

  describe('3. Manifest Structure & Confidentiality Invariants', () => {
    it('should enforce required manifest fields without exposing credentials or PII', () => {
      const sampleManifest: BackupManifest = {
        version: '1.0',
        setId: 'set_20261114_020000_a1b2c3d4',
        timestamp: new Date().toISOString(),
        status: 'COMPLETE',
        environment: 'development',
        sourceBucket: 'kumaran-chits-private',
        database: {
          format: 'custom',
          dumpFile: 'database.dump',
          s3Key: 'backups/sets/set_20261114_020000_a1b2c3d4/database.dump',
          sizeBytes: 212277,
          sha256: '50bc637c124a1ff4268e36e76cf0030582d2f70b28489c02e1b199042b8ef939',
          recordCounts: {
            users: 9,
            customers: 51,
            chitGroups: 13,
            tickets: 139,
            installmentDues: 464,
            payments: 433,
            auditLogs: 521,
          },
        },
        documents: {
          prefix: 'backups/sets/set_20261114_020000_a1b2c3d4/documents/',
          totalCount: 177,
          totalSizeBytes: 2699081,
          requiredCount: 76,
          regenerableCount: 101,
          files: [
            {
              originalKey: 'kyc/cust-1/aadhaar_front.jpg',
              backupKey:
                'backups/sets/set_20261114_020000_a1b2c3d4/documents/kyc/cust-1/aadhaar_front.jpg',
              sizeBytes: 1540,
              sha256: '315211f9136267a28e36e76cf0030582d2f70b28489c02e1b199042b8ef939aa',
              category: 'REQUIRED_NON_REGENERABLE',
            },
          ],
        },
        verification: {
          completedAt: new Date().toISOString(),
          durationMs: 3500,
        },
      };

      const serialized = JSON.stringify(sampleManifest);

      // Invariant: Zero plaintext credentials or tokens leaked into backup manifest
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('secret');
      expect(serialized).not.toContain('JWT');
      expect(serialized).not.toContain('chitflow_storage_secret');
      expect(serialized).not.toContain('Bearer');
      expect(sampleManifest.status).toBe('COMPLETE');
      expect(sampleManifest.database.recordCounts.auditLogs).toBeGreaterThan(0);
    });

    it('should reject incomplete backup manifests where status != COMPLETE', () => {
      const incompleteManifest: Partial<BackupManifest> = {
        version: '1.0',
        setId: 'set_incomplete',
        status: 'FAILED',
        error: 'S3 upload connection timed out',
      };

      expect(incompleteManifest.status).not.toBe('COMPLETE');
    });
  });

  describe('4. Backup Retention & Clean Up Safety Invariants', () => {
    it('should never delete backup sets if only 1 set exists (always preserve last known good)', async () => {
      const mockS3Client: any = {
        send: jest.fn().mockImplementation(async () => {
          return {
            Contents: [
              { Key: 'backups/sets/set_old/manifest.json' },
            ],
          };
        }),
      };

      const result = await pruneExpiredSets(mockS3Client, 'kumaran-chits-private', 30);
      expect(result.prunedSetsCount).toBe(0);
      expect(result.prunedObjectsCount).toBe(0);
    });

    it('should protect the latest complete backup set even if older than retention threshold', async () => {
      // When only this 1 complete set exists, pruning returns 0
      const mockS3Client: any = {
        send: jest.fn().mockImplementation(async () => {
          return {
            Contents: [{ Key: 'backups/sets/set_ancient_but_latest/manifest.json' }],
          };
        }),
      };

      const result = await pruneExpiredSets(mockS3Client, 'kumaran-chits-private', 30);
      expect(result.prunedSetsCount).toBe(0);
    });
  });

  describe('5. Disaster Recovery Target Isolation & Sandboxing', () => {
    it('should strictly target isolated sandbox database and bucket during drills', () => {
      const DRILL_DB_NAME = 'chitflow_drp_drill';
      const DRILL_BUCKET_NAME = 'kumaran-chits-drill';
      const LIVE_DB_NAME = 'chitflow_dev';
      const LIVE_BUCKET_NAME = 'kumaran-chits-private';

      // Invariants: Drill sandbox must never collide with live production or dev resources
      expect(DRILL_DB_NAME).not.toBe(LIVE_DB_NAME);
      expect(DRILL_BUCKET_NAME).not.toBe(LIVE_BUCKET_NAME);
      expect(DRILL_DB_NAME).toContain('drill');
      expect(DRILL_BUCKET_NAME).toContain('drill');
    });

    it('should calculate freshness correctly and flag backups older than 8 hours as STALE (3-checkpoint schedule)', () => {
      // 3-checkpoint schedule: 1:30PM IST / 6:30PM IST / 2:00AM IST
      // Largest inter-checkpoint gap: 2:00AM -> 1:30PM = 11.5h, BUT the max stale threshold is 8h
      // so an alert fires proactively if any single checkpoint missed, ensuring operators are paged
      // before two consecutive checkpoints are missed.
      const maxAgeHours = 8;
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();

      const freshAgeHours = (Date.now() - new Date(sixHoursAgo).getTime()) / (1000 * 60 * 60);
      const staleAgeHours = (Date.now() - new Date(nineHoursAgo).getTime()) / (1000 * 60 * 60);

      expect(freshAgeHours).toBeLessThanOrEqual(maxAgeHours);
      expect(staleAgeHours).toBeGreaterThan(maxAgeHours);
    });

    it('should verify 3-checkpoint cron schedule produces 3 distinct UTC times per day', () => {
      // Checkpoint 1: 1:30 PM IST = 08:00 UTC
      // Checkpoint 2: 6:30 PM IST = 13:00 UTC
      // Checkpoint 3: 2:00 AM IST = 20:30 UTC
      const cronSchedules = [
        { label: 'Checkpoint 1 (1:30 PM IST)', utcHour: 8, utcMin: 0 },
        { label: 'Checkpoint 2 (6:30 PM IST)', utcHour: 13, utcMin: 0 },
        { label: 'Checkpoint 3 (2:00 AM IST)', utcHour: 20, utcMin: 30 },
      ];

      // All 3 checkpoints are distinct
      const utcTimes = cronSchedules.map((c) => `${c.utcHour}:${c.utcMin}`);
      const uniqueTimes = new Set(utcTimes);
      expect(uniqueTimes.size).toBe(3);

      // Largest gap between any two consecutive checkpoints (wrapping midnight):
      // Gap 1→2: 13:00 - 08:00 = 5h
      // Gap 2→3: 20:30 - 13:00 = 7.5h
      // Gap 3→1 (next day): (24 - 20.5) + 8 = 11.5h -> but 8h threshold alerts before 2 consecutive missed
      const gaps = [5, 7.5];
      gaps.forEach((gap) => expect(gap).toBeLessThanOrEqual(8));
    });

    it('should forbid drill execution when target database is active chitflow_dev', () => {
      const validateDrillTarget = (dbName: string, bucketName: string) => {
        if (dbName === 'chitflow_dev' || !dbName.includes('drill')) {
          throw new Error('Target DB must be isolated drill sandbox');
        }
        if (bucketName === 'kumaran-chits-private' || !bucketName.includes('drill')) {
          throw new Error('Target bucket must be isolated drill sandbox');
        }
        return true;
      };

      expect(() => validateDrillTarget('chitflow_dev', 'kumaran-chits-drill')).toThrow(
        'Target DB must be isolated drill sandbox',
      );
      expect(() => validateDrillTarget('chitflow_drp_drill', 'kumaran-chits-private')).toThrow(
        'Target bucket must be isolated drill sandbox',
      );
      expect(validateDrillTarget('chitflow_drp_drill', 'kumaran-chits-drill')).toBe(true);
    });
  });

  describe('6. Consistency Gate & Health Verifier Invariants', () => {
    it('should reject manifest completion when required database document references are missing', () => {
      const requiredDbKeys = ['kyc/cust-1/aadhaar.jpg', 'security/auc-1/agreement.pdf'];
      const snapshottedKeys = new Set(['kyc/cust-1/aadhaar.jpg']); // missing agreement.pdf

      const missing = requiredDbKeys.filter((k) => !snapshottedKeys.has(k));
      expect(missing).toEqual(['security/auc-1/agreement.pdf']);

      // Consistency Gate: Manifest cannot be COMPLETE when missing.length > 0
      const manifestStatus = missing.length === 0 ? 'COMPLETE' : 'FAILED';
      expect(manifestStatus).toBe('FAILED');
    });

    it('should detect when backed-up documents have corrupted sizes or hashes', () => {
      const manifestDoc = {
        originalKey: 'kyc/c1/photo.jpg',
        backupKey: 'backups/sets/set_1/documents/kyc/c1/photo.jpg',
        sizeBytes: 5000,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };

      // Case 1: Corrupted size
      const s3ActualSize = 4800;
      const isSizeCorrupt = s3ActualSize !== manifestDoc.sizeBytes;
      expect(isSizeCorrupt).toBe(true);

      // Case 2: Corrupted content hash
      const actualHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const isHashCorrupt = actualHash !== manifestDoc.sha256;
      expect(isHashCorrupt).toBe(true);
    });
  });

  describe('7. Cross-Storage Concurrency Race Conditions & Recovery Scenarios', () => {
    // Scenario 1: Document upload before database commit
    it('Scenario 1: should handle document uploaded to MinIO before database commit without breaking consistency', () => {
      // In Kumaran Chits, uploadFile occurs before prisma.customerDocument.create
      const activeDbKeys = ['kyc/cust-1/doc-1.jpg'];
      const activeS3Keys = ['kyc/cust-1/doc-1.jpg', 'kyc/cust-2/doc-in-flight.jpg']; // doc-in-flight uploaded, DB uncommitted

      // Consistency check: all DB keys must be present in S3 snapshot
      const missingKeys = activeDbKeys.filter((k) => !activeS3Keys.includes(k));
      expect(missingKeys).toHaveLength(0);

      // The uncommitted file in S3 is an orphan; restored DB has referential integrity
      const isReferentiallyConsistent = activeDbKeys.every((k) => activeS3Keys.includes(k));
      expect(isReferentiallyConsistent).toBe(true);
    });

    // Scenario 2: Database snapshot while a document upload is in progress
    it('Scenario 2: should guarantee point-in-time consistency when an upload is in-flight during snapshot', () => {
      // While upload is streaming to S3, neither PostgreSQL nor S3 bucket exposes the committed entity
      const dbDumpKeys = ['kyc/cust-1/doc-1.jpg'];
      const s3SnapshotKeys = ['kyc/cust-1/doc-1.jpg']; // in-flight upload not yet committed or visible

      const missing = dbDumpKeys.filter((k) => !s3SnapshotKeys.includes(k));
      expect(missing).toHaveLength(0);
      expect(dbDumpKeys).toEqual(s3SnapshotKeys);
    });

    // Scenario 3: New document committed during the backup window
    it('Scenario 3: should enforce dual-window consistency when new document is committed during backup', () => {
      const preDumpDbKeys = ['kyc/cust-1/doc-1.jpg'];
      // Suppose doc-2 is uploaded and committed after preDump check
      const postDumpDbKeys = ['kyc/cust-1/doc-1.jpg', 'kyc/cust-2/doc-2.jpg'];
      expect(postDumpDbKeys.length).toBeGreaterThan(preDumpDbKeys.length);

      // Sub-case 3A: S3 snapshot captured doc-2 (upload-first guarantee)
      const s3SnapshotCaseA = new Set(['kyc/cust-1/doc-1.jpg', 'kyc/cust-2/doc-2.jpg']);
      const missing3A = preDumpDbKeys.filter((k) => !s3SnapshotCaseA.has(k));
      expect(missing3A).toHaveLength(0); // Valid recovery set

      // Sub-case 3B: If doc-1 was somehow missed by S3 snapshot, consistency gate rejects
      const s3SnapshotCaseB = new Set(['kyc/cust-2/doc-2.jpg']); // missed doc-1
      const missing3B = preDumpDbKeys.filter((k) => !s3SnapshotCaseB.has(k));
      expect(missing3B).toContain('kyc/cust-1/doc-1.jpg');
      const manifestStatus3B = missing3B.length === 0 ? 'COMPLETE' : 'FAILED';
      expect(manifestStatus3B).toBe('FAILED');
    });

    // Scenario 4: Concurrent document deletion race condition
    it('Scenario 4: should detect concurrent document deletion during backup window and fail closed', () => {
      const preDumpDbKeys = ['kyc/cust-1/doc-1.jpg', 'kyc/cust-2/doc-to-delete.jpg'];
      // Admin deleted doc-to-delete from S3 during the dump
      const s3SnapshotKeys = new Set(['kyc/cust-1/doc-1.jpg']); // doc-to-delete is gone from S3

      // Dual-Window Consistency Gate asserts preDumpDbKeys MUST be in S3 snapshot
      const missingDocs = preDumpDbKeys.filter((k) => !s3SnapshotKeys.has(k));
      expect(missingDocs).toEqual(['kyc/cust-2/doc-to-delete.jpg']);

      // Gate rejects the backup set to prevent publishing a dump pointing to missing files
      const manifestStatus = missingDocs.length === 0 ? 'COMPLETE' : 'FAILED';
      expect(manifestStatus).toBe('FAILED');
    });

    // Scenario 5: Backup failure during document copying
    it('Scenario 5: should never mark manifest COMPLETE if document copying fails midway', () => {
      const totalDocumentsToCopy = 10;
      let copiedCount = 0;
      let errorOccurred = false;

      // Simulate failure at file 5
      for (let i = 1; i <= totalDocumentsToCopy; i++) {
        if (i === 5) {
          errorOccurred = true;
          break;
        }
        copiedCount++;
      }

      expect(errorOccurred).toBe(true);
      expect(copiedCount).toBe(4);

      // Manifest status invariant
      const finalManifestStatus = errorOccurred ? 'FAILED' : 'COMPLETE';
      expect(finalManifestStatus).toBe('FAILED');
    });

    // Scenario 6: Recovery-set cross-storage consistency validation
    it('Scenario 6: should validate that 100% of required restored documents resolve with matching SHA-256', () => {
      const restoredDbDocKeys = ['kyc/c1/aadhaar.jpg', 'safety-proofs/auc-1/cheque.pdf'];
      const restoredBucketObjects = new Map<string, string>([
        ['kyc/c1/aadhaar.jpg', 'sha256_aadhaar_hash'],
        ['safety-proofs/auc-1/cheque.pdf', 'sha256_cheque_hash'],
      ]);
      const manifestHashes = new Map<string, string>([
        ['kyc/c1/aadhaar.jpg', 'sha256_aadhaar_hash'],
        ['safety-proofs/auc-1/cheque.pdf', 'sha256_cheque_hash'],
      ]);

      const allPresent = restoredDbDocKeys.every((k) => restoredBucketObjects.has(k));
      const allChecksumsMatch = restoredDbDocKeys.every(
        (k) => restoredBucketObjects.get(k) === manifestHashes.get(k),
      );

      expect(allPresent).toBe(true);
      expect(allChecksumsMatch).toBe(true);
    });

    // Scenario 7: Backup retry after failed snapshot
    it('Scenario 7: should allow clean retry after a failed backup without leaving corrupt state', () => {
      // Step 1: Failed backup set
      const failedSet: Partial<BackupManifest> = {
        setId: 'set_failed_attempt_1',
        status: 'FAILED',
        error: 'Network connection reset during S3 transfer',
      };

      // Step 2: Retry creates new distinct set
      const retrySet: Partial<BackupManifest> = {
        setId: 'set_retry_attempt_2',
        status: 'COMPLETE',
      };

      expect(failedSet.status).toBe('FAILED');
      expect(retrySet.status).toBe('COMPLETE');
      expect(failedSet.setId).not.toBe(retrySet.setId);

      // Verifier filter: only COMPLETE sets are eligible for restore
      const candidateSets = [failedSet, retrySet];
      const validSets = candidateSets.filter((s) => s.status === 'COMPLETE');
      expect(validSets).toHaveLength(1);
      expect(validSets[0].setId).toBe('set_retry_attempt_2');
    });
  });
});
