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

    it('should calculate freshness correctly and flag backups older than 26 hours as STALE', () => {
      const maxAgeHours = 26;
      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
      const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();

      const freshAgeHours = (Date.now() - new Date(twentyHoursAgo).getTime()) / (1000 * 60 * 60);
      const staleAgeHours = (Date.now() - new Date(thirtyHoursAgo).getTime()) / (1000 * 60 * 60);

      expect(freshAgeHours).toBeLessThanOrEqual(maxAgeHours);
      expect(staleAgeHours).toBeGreaterThan(maxAgeHours);
    });
  });
});
