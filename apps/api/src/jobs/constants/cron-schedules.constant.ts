// ==============================================================================
// Kumaran Chits — Background Cron Schedules Constants
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Standard: Indian Standard Time (IST - Asia/Kolkata)
// ==============================================================================

export const TIMEZONE_IST = 'Asia/Kolkata';

// 1. Daily Midnight Arrears & 3-Month Default Recalculation (00:01 AM IST)
export const CRON_DAILY_ARREARS = '1 0 * * *';
export const REPEATABLE_JOB_DAILY_ARREARS = 'repeatable-daily-arrears-midnight';

// 2. Daily Morning Payment Settlement Reconciliation (06:00 AM IST)
export const CRON_SETTLEMENT_RECONCILIATION = '0 6 * * *';
export const REPEATABLE_JOB_SETTLEMENT_RECONCILIATION = 'repeatable-settlement-reconciliation-morning';

// 3. Pre-Auction Reminder Broadcast (09:00 AM IST - 3 days ahead)
export const CRON_PRE_AUCTION_REMINDERS = '0 9 * * *';
export const REPEATABLE_JOB_PRE_AUCTION_REMINDERS = 'repeatable-pre-auction-reminders-morning';
export const JOB_SCAN_PRE_AUCTION_REMINDERS = 'scan-pre-auction-reminders';
