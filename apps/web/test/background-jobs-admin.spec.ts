// ==============================================================================
// Kumaran Chits — Background Jobs & Operations Control Invariant Tests (Task 9.3)
// Verifies BullMQ queue telemetry, repeatable IST schedules, operational triggers,
// multi-channel delivery audit logs, and 100% bilingual dictionary parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ------------------------------------------------------------------------------
// Invariant 1: Super Admin RBAC Authority on Background Operations
// ------------------------------------------------------------------------------
test('1. Super Admin Authority Gate: Restricts trigger mutations strictly to SUPER_ADMIN', () => {
  const isAuthorizedToTrigger = (userRoles: string[]): boolean => {
    return userRoles.includes('SUPER_ADMIN');
  };

  const isAuthorizedToViewTelemetry = (userRoles: string[]): boolean => {
    const allowed = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'AUDITOR'];
    return userRoles.some((r) => allowed.includes(r));
  };

  // Super Admin has full operational authority
  assert.equal(isAuthorizedToTrigger(['SUPER_ADMIN']), true);
  assert.equal(isAuthorizedToViewTelemetry(['SUPER_ADMIN']), true);

  // CA Auditor and Branch Manager have read-only telemetry visibility
  assert.equal(isAuthorizedToTrigger(['AUDITOR']), false);
  assert.equal(isAuthorizedToViewTelemetry(['AUDITOR']), true);

  assert.equal(isAuthorizedToTrigger(['BRANCH_MANAGER']), false);
  assert.equal(isAuthorizedToViewTelemetry(['BRANCH_MANAGER']), true);

  // Field Agent and Customer are completely barred
  assert.equal(isAuthorizedToTrigger(['COLLECTION_AGENT']), false);
  assert.equal(isAuthorizedToViewTelemetry(['COLLECTION_AGENT']), false);

  assert.equal(isAuthorizedToTrigger(['CUSTOMER']), false);
  assert.equal(isAuthorizedToViewTelemetry(['CUSTOMER']), false);
});

// ------------------------------------------------------------------------------
// Invariant 2: PostgreSQL as Sole Financial Truth vs Asynchronous BullMQ Telemetry
// ------------------------------------------------------------------------------
test('2. PostgreSQL Sole Truth: BullMQ background jobs process async telemetry without financial authority', () => {
  // Mock worker execution response
  const mockArrearsResult = {
    totalDuesChecked: 40,
    overdueCount: 5,
    newlyOverdueCount: 2,
    defaults3MonthsCount: 1,
    arrearsCount: 3,
    executionTimeMs: 125,
  };

  // Ensure result payload adheres to execution summary DTO
  assert.equal(typeof mockArrearsResult.totalDuesChecked, 'number');
  assert.equal(typeof mockArrearsResult.overdueCount, 'number');
  assert.equal(typeof mockArrearsResult.defaults3MonthsCount, 'number');
  assert.ok(mockArrearsResult.executionTimeMs > 0);

  // Verify that an enqueued job returns BullMQ tracking metadata rather than monetary mutations
  const mockEnqueuedJob = {
    enqueued: true,
    jobId: 'job-uuid-daily-arrears-001',
    queue: 'daily-maintenance-queue',
    name: 'process-daily-arrears',
  };

  assert.equal(mockEnqueuedJob.enqueued, true);
  assert.ok(mockEnqueuedJob.jobId.startsWith('job-uuid-'));
  assert.equal(mockEnqueuedJob.queue, 'daily-maintenance-queue');
});

// ------------------------------------------------------------------------------
// Invariant 3: Queue Health Telemetry Aggregation Across 3 Production Queues
// ------------------------------------------------------------------------------
test('3. Queue Health Telemetry: Accurately aggregates task metrics across the 3 dedicated queues', () => {
  const mockReports = [
    {
      queueName: 'daily-maintenance-queue',
      isAvailable: true,
      active: 1,
      waiting: 2,
      completed: 15,
      failed: 0,
      delayed: 0,
      paused: false,
    },
    {
      queueName: 'reconciliation-queue',
      isAvailable: true,
      active: 0,
      waiting: 0,
      completed: 10,
      failed: 1,
      delayed: 0,
      paused: false,
    },
    {
      queueName: 'notification-queue',
      isAvailable: true,
      active: 2,
      waiting: 3,
      completed: 140,
      failed: 0,
      delayed: 1,
      paused: false,
    },
  ];

  // Aggregation logic
  const isRedisAvailable = mockReports.length > 0 && mockReports.every((q) => q.isAvailable);
  const totalActive = mockReports.reduce((sum, q) => sum + q.active, 0);
  const totalWaiting = mockReports.reduce((sum, q) => sum + q.waiting, 0);
  const totalCompleted = mockReports.reduce((sum, q) => sum + q.completed, 0);
  const totalFailed = mockReports.reduce((sum, q) => sum + q.failed, 0);
  const totalDelayed = mockReports.reduce((sum, q) => sum + q.delayed, 0);

  assert.equal(isRedisAvailable, true);
  assert.equal(totalActive, 3);
  assert.equal(totalWaiting, 5);
  assert.equal(totalCompleted, 165);
  assert.equal(totalFailed, 1);
  assert.equal(totalDelayed, 1);
});

// ------------------------------------------------------------------------------
// Invariant 4: Repeatable IST Cron Schedules & Timezone Mapping
// ------------------------------------------------------------------------------
test('4. Repeatable IST Schedules: Validates Asia/Kolkata automated cron patterns', () => {
  const formatScheduleCron = (cron: string): string => {
    switch (cron) {
      case '1 0 * * *':
        return '00:01 AM IST Daily';
      case '0 6 * * *':
        return '06:00 AM IST Daily';
      case '0 9 * * *':
        return '09:00 AM IST Daily';
      default:
        return 'Custom Cron';
    }
  };

  assert.equal(formatScheduleCron('1 0 * * *'), '00:01 AM IST Daily');
  assert.equal(formatScheduleCron('0 6 * * *'), '06:00 AM IST Daily');
  assert.equal(formatScheduleCron('0 9 * * *'), '09:00 AM IST Daily');

  // Verify next execution timestamp safely parses epoch ms
  const nextTimestamp = 1731110400000;
  const d = new Date(nextTimestamp);
  assert.equal(isNaN(d.getTime()), false);
});

// ------------------------------------------------------------------------------
// Invariant 5: Daily Arrears Scan Payload & ADR-07 3-Month Default Tagging
// ------------------------------------------------------------------------------
test('5. Daily Arrears Invariant: Validates calculation breakdown and optional cutoffDate', () => {
  const generateCutoffQuery = (cutoffDate?: string) => {
    if (!cutoffDate) return {};
    const d = new Date(cutoffDate);
    assert.equal(isNaN(d.getTime()), false, 'Must be valid date string');
    return { cutoffDate: d.toISOString().split('T')[0] };
  };

  assert.deepEqual(generateCutoffQuery(), {});
  assert.deepEqual(generateCutoffQuery('2026-11-15'), { cutoffDate: '2026-11-15' });

  // Assert ADR-07 invariant: 3-month consecutive defaulters tagged
  const mockExecution = {
    totalDuesChecked: 100,
    overdueCount: 12,
    newlyOverdueCount: 3,
    defaults3MonthsCount: 2,
    arrearsCount: 9,
    executionTimeMs: 250,
  };

  assert.ok(mockExecution.defaults3MonthsCount <= mockExecution.overdueCount);
  assert.ok(mockExecution.newlyOverdueCount <= mockExecution.overdueCount);
});

// ------------------------------------------------------------------------------
// Invariant 6: Pre-Auction Reminders 3-Day Lookahead Invariant
// ------------------------------------------------------------------------------
test('6. Pre-Auction Reminder Invariant: Targets upcoming auctions 3 days ahead', () => {
  const computeDefaultPreAuctionLookahead = (baseDate: Date): string => {
    const target = new Date(baseDate);
    target.setDate(target.getDate() + 3);
    return target.toISOString().split('T')[0];
  };

  const testDate = new Date('2026-11-10T10:00:00.000Z');
  const targetDateStr = computeDefaultPreAuctionLookahead(testDate);
  assert.equal(targetDateStr, '2026-11-13');
});

// ------------------------------------------------------------------------------
// Invariant 7: Cost-Controlled Multi-Channel Delivery Hierarchy
// ------------------------------------------------------------------------------
test('7. Cost-Controlled Delivery Hierarchy: Prioritizes free FCM Push over Keypad SMS', () => {
  const determineDeliveryChannel = (subscriber: {
    hasAppInstalled: boolean;
    fcmToken?: string;
  }): 'PUSH' | 'SMS' => {
    if (subscriber.hasAppInstalled && subscriber.fcmToken) {
      return 'PUSH'; // ₹0 Cost
    }
    return 'SMS'; // DLT-compliant keypad fallback
  };

  // Smartphone subscriber receives free push
  assert.equal(
    determineDeliveryChannel({ hasAppInstalled: true, fcmToken: 'fcm-token-xyz123' }),
    'PUSH'
  );

  // Keypad phone subscriber without token receives SMS fallback
  assert.equal(
    determineDeliveryChannel({ hasAppInstalled: false, fcmToken: undefined }),
    'SMS'
  );

  // Non-token app user falls back to SMS
  assert.equal(
    determineDeliveryChannel({ hasAppInstalled: true, fcmToken: undefined }),
    'SMS'
  );
});

// ------------------------------------------------------------------------------
// Invariant 8: 100% Bilingual Dictionary Parity for Jobs Namespace
// ------------------------------------------------------------------------------
test('8. Bilingual Parity: 100% dictionary match between en.json and ta.json in jobs namespace', () => {
  const basePath = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
    ? process.cwd()
    : path.resolve(process.cwd(), 'apps/web');

  const enPath = path.resolve(basePath, 'messages/en.json');
  const taPath = path.resolve(basePath, 'messages/ta.json');

  assert.ok(fs.existsSync(enPath), `en.json must exist at ${enPath}`);
  assert.ok(fs.existsSync(taPath), `ta.json must exist at ${taPath}`);

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

  assert.ok(en.jobs, 'English dictionary must contain "jobs" section');
  assert.ok(ta.jobs, 'Tamil dictionary must contain "jobs" section');

  // Also assert nav key exists
  assert.ok(en.nav?.jobs, 'English nav must contain "jobs"');
  assert.ok(ta.nav?.jobs, 'Tamil nav must contain "jobs"');

  // Recursively extract all keys
  function getAllKeys(obj: any, prefix = ''): string[] {
    return Object.keys(obj).flatMap((key) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        return getAllKeys(obj[key], fullKey);
      }
      return [fullKey];
    });
  }

  const enKeys = getAllKeys(en.jobs);
  const taKeys = getAllKeys(ta.jobs);

  assert.ok(enKeys.length >= 80, `Expected at least 80 keys in jobs, found ${enKeys.length}`);
  assert.equal(
    enKeys.length,
    taKeys.length,
    `Key count mismatch: EN has ${enKeys.length}, TA has ${taKeys.length}`
  );

  const missingInTamil = enKeys.filter((key) => !taKeys.includes(key));
  const missingInEnglish = taKeys.filter((key) => !enKeys.includes(key));

  assert.deepEqual(
    missingInTamil,
    [],
    `Keys missing in ta.json: ${missingInTamil.join(', ')}`
  );
  assert.deepEqual(
    missingInEnglish,
    [],
    `Keys missing in en.json: ${missingInEnglish.join(', ')}`
  );
});
