import { execSync } from 'child_process';
import * as path from 'path';

/**
 * Kumaran Chits — Isolated Test Database Seeder
 *
 * Strictly targets the test database (chitflow_test) to wipe stale test artifacts
 * and reset deterministic seed data for automated E2E test suites without touching
 * developer or production databases.
 */
async function truncateTestTables(targetUrl: string): Promise<void> {
  // Lazy-import PrismaClient after targetUrl resolution so Prisma's .env auto-load
  // cannot shadow defaultTestUrl with developer DATABASE_URL from .env.
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: targetUrl } },
  });
  try {
    const dbRows = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
    const activeDb = dbRows[0]?.db || '';
    if (!activeDb.toLowerCase().includes('test') || activeDb.toLowerCase().includes('prod')) {
      throw new Error(`Refusing TRUNCATE on non-test database "${activeDb}"`);
    }

    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    if (tables.length > 0) {
      const tableList = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function flushTestRedisCache(): Promise<void> {
  const redisDb = Number(process.env.REDIS_DB ?? 1);
  if (!Number.isInteger(redisDb) || redisDb <= 0 || redisDb > 15) {
    return;
  }

  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);

  try {
    const { Redis } = await import('ioredis');
    const client = new Redis({
      host,
      port,
      db: redisDb,
      connectTimeout: 2000,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      lazyConnect: true,
    });
    try {
      await client.connect();
      await client.flushdb();
      console.log(`🧹 Flushed isolated test Redis DB ${redisDb} (${host}:${port}).`);
    } finally {
      await client.quit().catch(() => client.disconnect());
    }
  } catch (err: any) {
    console.warn(`⚠️ Skipping test Redis flush (DB ${redisDb} unreachable): ${err.message}`);
  }
}

async function seedTestDatabase(): Promise<void> {
  const defaultTestUrl =
    'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_test?schema=public';
  const targetUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || defaultTestUrl;

  // Mask credentials for safe terminal logging
  const maskedUrl = targetUrl.replace(/:[^:@]+@/, ':****@');

  // Safety Guard: Refuse to execute if database name does not contain "test"
  const dbNameMatch = targetUrl.match(/\/([^?\/]+)(\?|$)/);
  const dbName = dbNameMatch ? dbNameMatch[1] : '';

  if (!dbName.toLowerCase().includes('test') || dbName.toLowerCase().includes('prod')) {
    console.error(`❌ [Safety Guard] Refusing to seed database "${dbName}".`);
    console.error('   The target database URL must explicitly contain "test" (e.g., "chitflow_test").');
    console.error(`   Target URL: ${maskedUrl}`);
    process.exit(1);
  }

  console.log('================================================================');
  console.log('🌱 Refreshing Isolated Test Database Seed');
  console.log(`🎯 Target DB : ${dbName} (${maskedUrl})`);
  console.log('================================================================');

  const apiDir = path.resolve(__dirname, '../..');

  try {
    execSync('npx prisma migrate deploy', {
      cwd: apiDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: targetUrl,
        NODE_ENV: 'test',
      },
    });

    await truncateTestTables(targetUrl);

    execSync('npx prisma db seed', {
      cwd: apiDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: targetUrl,
        NODE_ENV: 'test',
      },
    });
    await flushTestRedisCache();
    console.log('✅ Test database migrated, reset, and seeded successfully with deterministic baseline.');
  } catch (error: any) {
    console.error('❌ Failed to seed test database:', error.message);
    process.exit(1);
  }
}

void seedTestDatabase();
