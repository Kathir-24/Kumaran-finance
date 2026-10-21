import { execSync } from 'child_process';
import * as path from 'path';

/**
 * Kumaran Chits — Isolated Test Database Seeder
 *
 * Strictly targets the test database (chitflow_test) to reset deterministic
 * seed data for automated E2E test suites without touching developer or production databases.
 */
function seedTestDatabase(): void {
  const defaultTestUrl =
    'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_test?schema=public';
  const targetUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || defaultTestUrl;

  // Mask credentials for safe terminal logging
  const maskedUrl = targetUrl.replace(/:[^:@]+@/, ':****@');

  // Safety Guard: Refuse to execute if database name does not contain "test"
  const dbNameMatch = targetUrl.match(/\/([^?\/]+)(\?|$)/);
  const dbName = dbNameMatch ? dbNameMatch[1] : '';

  if (!dbName.toLowerCase().includes('test')) {
    console.error(`❌ [Safety Guard] Refusing to seed database "${dbName}".`);
    console.error('   The target database URL must explicitly contain "test" (e.g., "chitflow_test").');
    console.error(`   Target URL: ${maskedUrl}`);
    process.exit(1);
  }

  console.log('================================================================');
  console.log('🌱 Refreshing Isolated Test Database Seed');
  console.log(`🎯 Target DB : ${dbName} (${maskedUrl})`);
  console.log('================================================================');

  const apiDir = path.resolve(__dirname, '..');

  try {
    execSync('npx prisma db seed', {
      cwd: apiDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: targetUrl,
        NODE_ENV: 'test',
      },
    });
    console.log('✅ Test database seeded successfully with deterministic baseline.');
  } catch (error: any) {
    console.error('❌ Failed to seed test database:', error.message);
    process.exit(1);
  }
}

seedTestDatabase();
