// ==============================================================================
// Kumaran Chits — Backup & Disaster Recovery Manifest Types
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1 - §3.4)
// ==============================================================================

export type DocumentCategory = 'REQUIRED_NON_REGENERABLE' | 'REGENERABLE_ON_DEMAND';

export interface BackupDocumentEntry {
  originalKey: string;
  backupKey: string;
  sizeBytes: number;
  sha256: string;
  category: DocumentCategory;
  mimeType?: string;
}

export interface BackupDatabaseMetadata {
  format: 'custom';
  dumpFile: string;
  s3Key: string;
  sizeBytes: number;
  sha256: string;
  pgVersion?: string;
  recordCounts: {
    users: number;
    customers: number;
    chitGroups: number;
    tickets: number;
    installmentDues: number;
    payments: number;
    auditLogs: number;
  };
}

export interface BackupDocumentsMetadata {
  prefix: string;
  totalCount: number;
  totalSizeBytes: number;
  requiredCount: number;
  regenerableCount: number;
  files: BackupDocumentEntry[];
}

export interface BackupManifest {
  version: '1.0';
  setId: string; // Format: set_YYYYMMDD_HHMMSS_<hex>
  timestamp: string; // ISO 8601
  status: 'COMPLETE' | 'FAILED' | 'INCOMPLETE';
  environment: string;
  sourceBucket: string;
  database: BackupDatabaseMetadata;
  documents: BackupDocumentsMetadata;
  verification: {
    completedAt: string;
    durationMs: number;
  };
  error?: string;
}

export interface BackupHealthResult {
  healthy: boolean;
  status: 'HEALTHY' | 'STALE' | 'CORRUPT' | 'MISSING' | 'INCOMPLETE';
  setId?: string;
  timestamp?: string;
  ageHours?: number;
  maxAgeHours: number;
  dbSizeBytes?: number;
  dbSha256Valid?: boolean;
  documentsCount?: number;
  reason?: string;
  details?: Record<string, any>;
}
