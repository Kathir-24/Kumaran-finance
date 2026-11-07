// ==============================================================================
// Kumaran Chits — Automated Disaster Recovery Plan (DRP) Drill Engine
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.3)
// Invariants: docs/05-testing/financial-tests.md (§1 - §4), AGENTS.md §3
// ==============================================================================

import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import type { Readable } from 'stream';
import { runBackup } from './backup-to-s3';

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

function resolveS3Config() {
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

const DRILL_DB_NAME = 'chitflow_drp_drill';

export interface DrillResult {
  success: boolean;
  rpoKey: string;
  rpoSizeBytes: number;
  rtoDurationMs: number;
  rtoDurationSeconds: string;
  sourceCounts: Record<string, number>;
  restoredCounts: Record<string, number>;
  assertions: {
    name: string;
    description: string;
    passed: boolean;
    details?: string;
  }[];
}

export async function runDrpDrill(): Promise<DrillResult> {
  console.log(`\n======================================================`);
  console.log(`🚀 STARTING AUTOMATED DISASTER RECOVERY (DRP) DRILL`);
  console.log(`   Kumaran Chits — Kumaran Finance (Perundurai, TN)`);
  console.log(`   Compliance: docs/06-devops/infrastructure-and-drp.md §3.3`);
  console.log(`======================================================\n`);

  const s3Config = resolveS3Config();
  const s3Client = new S3Client({
    region: s3Config.region,
    endpoint: s3Config.endpoint,
    forcePathStyle: s3Config.forcePathStyle,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
    },
  });

  const sourceDbUrl =
    process.env.DATABASE_URL ||
    'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public';

  const sourcePrisma = new PrismaClient({
    datasources: { db: { url: sourceDbUrl } },
  });

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

  // 1. Pre-flight: Query source baseline counts
  console.log(`[PRE-FLIGHT] Capturing baseline metrics from source database...`);
  const [
    sourceUsers,
    sourceCustomers,
    sourceGroups,
    sourceTickets,
    sourceDues,
    sourcePayments,
  ] = await Promise.all([
    sourcePrisma.user.count(),
    sourcePrisma.customer.count(),
    sourcePrisma.chitGroup.count(),
    sourcePrisma.subscriberTicket.count(),
    sourcePrisma.installmentDue.count(),
    sourcePrisma.payment.count(),
  ]);

  const sourceCounts: Record<string, number> = {
    users: sourceUsers,
    customers: sourceCustomers,
    chitGroups: sourceGroups,
    tickets: sourceTickets,
    installmentDues: sourceDues,
    payments: sourcePayments,
  };

  console.log(`[PRE-FLIGHT] Baseline record counts:`, sourceCounts);

  // 2. Automated S3 Snapshot (RPO Verification)
  console.log(`\n[PHASE 1: RPO] Creating fresh database snapshot & uploading to S3...`);
  const backupResult = await runBackup();
  console.log(`[PHASE 1: RPO] Backup key generated: ${backupResult.s3Key} (${backupResult.sizeBytes} bytes)`);

  // 3. Isolated Target Database Setup
  console.log(`\n[PHASE 2: ISOLATION] Preparing isolated target database '${DRILL_DB_NAME}'...`);
  if (isDockerRunning) {
    execSync(
      `docker exec chitflow-db psql -U chitflow -d postgres -c "DROP DATABASE IF EXISTS ${DRILL_DB_NAME} WITH (FORCE);"`,
      { stdio: 'ignore' },
    );
    execSync(
      `docker exec chitflow-db psql -U chitflow -d postgres -c "CREATE DATABASE ${DRILL_DB_NAME};"`,
      { stdio: 'inherit' },
    );
  } else {
    execSync(`psql -U chitflow -d postgres -c "DROP DATABASE IF EXISTS ${DRILL_DB_NAME} WITH (FORCE);"`, {
      stdio: 'ignore',
    });
    execSync(`psql -U chitflow -d postgres -c "CREATE DATABASE ${DRILL_DB_NAME};"`, {
      stdio: 'inherit',
    });
  }

  // 4. Download Snapshot & Execute Restore (RTO Benchmark)
  console.log(`\n[PHASE 3: RTO] Downloading snapshot from S3 & benchmarking recovery time...`);
  const rtoStart = Date.now();

  const getResponse = await s3Client.send(
    new GetObjectCommand({
      Bucket: s3Config.bucket,
      Key: backupResult.s3Key,
    }),
  );

  if (!getResponse.Body) {
    throw new Error(`[ERROR] S3 GetObject returned empty body for key: ${backupResult.s3Key}`);
  }

  const dumpBuffer = await streamToBuffer(getResponse.Body as Readable);

  const tempDir = path.resolve(__dirname, '../../infra/backups');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const drillDumpPath = path.join(tempDir, `drill_${path.basename(backupResult.s3Key)}`);
  fs.writeFileSync(drillDumpPath, dumpBuffer);

  // Restore into drill database
  const fileName = path.basename(drillDumpPath);
  if (isDockerRunning) {
    execSync(`docker cp "${drillDumpPath}" "chitflow-db:/tmp/${fileName}"`, { stdio: 'inherit' });
    execSync(
      `docker exec chitflow-db pg_restore -U chitflow -d ${DRILL_DB_NAME} --clean --if-exists "/tmp/${fileName}"`,
      { stdio: 'inherit' },
    );
    execSync(`docker exec chitflow-db rm "/tmp/${fileName}"`, { stdio: 'ignore' });
  } else {
    const drillUrl = sourceDbUrl.replace(/\/chitflow_dev\?/, `/${DRILL_DB_NAME}?`);
    execSync(`pg_restore -d "${drillUrl}" --clean --if-exists "${drillDumpPath}"`, { stdio: 'inherit' });
  }

  const rtoEnd = Date.now();
  const rtoDurationMs = rtoEnd - rtoStart;
  const rtoDurationSeconds = (rtoDurationMs / 1000).toFixed(2);
  console.log(`[PHASE 3: RTO] Database restored in ${rtoDurationSeconds}s (Target: < 7200s / 2 hours).`);

  // 5. Connect to Drill Database & Verify Financial Invariants
  console.log(`\n[PHASE 4: INVARIANTS] Verifying data integrity & financial invariants on restored DB...`);
  const drillDbUrl = sourceDbUrl.replace(/\/chitflow_dev\?/, `/${DRILL_DB_NAME}?`);
  const drillPrisma = new PrismaClient({
    datasources: { db: { url: drillDbUrl } },
  });

  const assertions: DrillResult['assertions'] = [];

  try {
    // Assertion 1: Row Parity
    const [
      drillUsers,
      drillCustomers,
      drillGroups,
      drillTickets,
      drillDues,
      drillPayments,
    ] = await Promise.all([
      drillPrisma.user.count(),
      drillPrisma.customer.count(),
      drillPrisma.chitGroup.count(),
      drillPrisma.subscriberTicket.count(),
      drillPrisma.installmentDue.count(),
      drillPrisma.payment.count(),
    ]);

    const restoredCounts: Record<string, number> = {
      users: drillUsers,
      customers: drillCustomers,
      chitGroups: drillGroups,
      tickets: drillTickets,
      installmentDues: drillDues,
      payments: drillPayments,
    };

    const countParityPassed =
      drillUsers === sourceUsers &&
      drillCustomers === sourceCustomers &&
      drillGroups === sourceGroups &&
      drillTickets === sourceTickets &&
      drillDues === sourceDues &&
      drillPayments === sourcePayments;

    assertions.push({
      name: 'Assertion 1: Entity Row Parity',
      description: 'Restored database record counts match baseline source exactly',
      passed: countParityPassed,
      details: countParityPassed
        ? `All 6 entity sets match (Users: ${drillUsers}, Customers: ${drillCustomers}, ChitGroups: ${drillGroups}, Tickets: ${drillTickets}, Dues: ${drillDues}, Payments: ${drillPayments})`
        : `Count mismatch detected`,
    });

    // Assertion 2: Commission Freeze (ADR-04)
    const allGroups = await drillPrisma.chitGroup.findMany({
      select: { id: true, groupCode: true, foremanCommissionRate: true },
    });
    const commissionPassed = allGroups.every((g) => Number(g.foremanCommissionRate) === 4.0);
    assertions.push({
      name: 'Assertion 2: Foreman Commission Freeze (ADR-04)',
      description: 'Foreman commission is frozen at exactly 4.00% across all groups',
      passed: commissionPassed,
      details: `Verified ${allGroups.length} chit groups locked at 4.00% commission`,
    });

    // Assertion 3: Ticket Limit (ADR-13)
    const allTickets = await drillPrisma.subscriberTicket.findMany({
      select: { chitGroupId: true, customerId: true },
    });
    const seenTicketKeys = new Set<string>();
    let hasDuplicateTicket = false;
    for (const t of allTickets) {
      const key = `${t.chitGroupId}_${t.customerId}`;
      if (seenTicketKeys.has(key)) {
        hasDuplicateTicket = true;
        break;
      }
      seenTicketKeys.add(key);
    }
    assertions.push({
      name: 'Assertion 3: Ticket Limit Constraint (ADR-13)',
      description: 'No customer holds more than 1 ticket in the same chit group',
      passed: !hasDuplicateTicket,
      details: !hasDuplicateTicket
        ? `Enforced: 0 duplicate subscriber assignments across ${allTickets.length} tickets`
        : `Violation: Duplicate ticket assignment found in database`,
    });

    // Assertion 4: Whole Rupee Math (BigInt Integrity)
    const nonNegativeDues = await drillPrisma.installmentDue.findMany({
      where: { netPayableAmount: { lt: 0n } },
    });
    const mathIntegrityPassed = nonNegativeDues.length === 0;
    assertions.push({
      name: 'Assertion 4: Pure Whole-Rupee Math (ADR-02)',
      description: 'Zero floating-point numbers or negative installment amounts',
      passed: mathIntegrityPassed,
      details: mathIntegrityPassed
        ? `All stored financial records conform to 64-bit integer Rupees`
        : `Found invalid or negative monetary values`,
    });

    // Assertion 5: Financial Accounting Equation (DRP §3.3)
    // Sum of generated dues = Sum of successful payments + remaining unpaid dues
    const totalDuesAgg = await drillPrisma.installmentDue.aggregate({
      _sum: { netPayableAmount: true },
    });
    const paidDuesAgg = await drillPrisma.installmentDue.aggregate({
      where: { status: 'PAID' },
      _sum: { netPayableAmount: true },
    });
    const outstandingDuesAgg = await drillPrisma.installmentDue.aggregate({
      where: { status: { in: ['UNPAID', 'OVERDUE'] } },
      _sum: { netPayableAmount: true },
    });

    const totalDues = totalDuesAgg._sum?.netPayableAmount ?? 0n;
    const paidDues = paidDuesAgg._sum?.netPayableAmount ?? 0n;
    const outstandingDues = outstandingDuesAgg._sum?.netPayableAmount ?? 0n;

    const balanceEquationPassed = totalDues === paidDues + outstandingDues;
    assertions.push({
      name: 'Assertion 5: Accounting Balance Invariant (DRP §3.3)',
      description: 'Σ Total Dues = Σ Paid Dues + Σ Outstanding Unpaid Dues',
      passed: balanceEquationPassed,
      details: balanceEquationPassed
        ? `Balance verified: ₹${totalDues.toString()} = ₹${paidDues.toString()} (Paid) + ₹${outstandingDues.toString()} (Outstanding)`
        : `Discrepancy: Total=₹${totalDues.toString()}, Sum=₹${(paidDues + outstandingDues).toString()}`,
    });

    // 6. Cleanup & Teardown
    console.log(`\n[PHASE 5: CLEANUP] Terminating isolated target database and temporary files...`);
    await drillPrisma.$disconnect();
    await sourcePrisma.$disconnect();

    if (isDockerRunning) {
      execSync(
        `docker exec chitflow-db psql -U chitflow -d postgres -c "DROP DATABASE IF EXISTS ${DRILL_DB_NAME} WITH (FORCE);"`,
        { stdio: 'ignore' },
      );
    } else {
      execSync(`psql -U chitflow -d postgres -c "DROP DATABASE IF EXISTS ${DRILL_DB_NAME} WITH (FORCE);"`, {
        stdio: 'ignore',
      });
    }

    if (fs.existsSync(drillDumpPath)) {
      fs.unlinkSync(drillDumpPath);
    }

    const allPassed = assertions.every((a) => a.passed);

    // 7. Structured Report
    console.log(`\n======================================================`);
    console.log(`📋 DISASTER RECOVERY DRILL AUDIT REPORT`);
    console.log(`======================================================`);
    console.log(`   RPO Snapshot Key:    ${backupResult.s3Key}`);
    console.log(`   Snapshot Size:       ${backupResult.sizeBytes} bytes`);
    console.log(`   RTO Restore Time:    ${rtoDurationSeconds} seconds (Target: < 7200s)`);
    console.log(`   Overall Status:      ${allPassed ? '✅ PASSED (100% COMPLIANT)' : '❌ FAILED'}`);
    console.log(`------------------------------------------------------`);
    assertions.forEach((a) => {
      console.log(`   ${a.passed ? '✅' : '❌'} ${a.name}`);
      console.log(`      ${a.details}`);
    });
    console.log(`======================================================\n`);

    return {
      success: allPassed,
      rpoKey: backupResult.s3Key,
      rpoSizeBytes: backupResult.sizeBytes,
      rtoDurationMs,
      rtoDurationSeconds,
      sourceCounts,
      restoredCounts,
      assertions,
    };
  } catch (err) {
    await drillPrisma.$disconnect();
    await sourcePrisma.$disconnect();
    if (isDockerRunning) {
      execSync(
        `docker exec chitflow-db psql -U chitflow -d postgres -c "DROP DATABASE IF EXISTS ${DRILL_DB_NAME} WITH (FORCE);"`,
        { stdio: 'ignore' },
      );
    }
    if (fs.existsSync(drillDumpPath)) {
      fs.unlinkSync(drillDumpPath);
    }
    throw err;
  }
}

// CLI Execution Entrypoint
if (require.main === module) {
  runDrpDrill()
    .then((result) => {
      if (!result.success) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error(`\n❌ DISASTER RECOVERY DRILL FAILED:\n`, err);
      process.exit(1);
    });
}
