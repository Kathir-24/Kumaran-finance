// ==============================================================================
// Kumaran Chits — Mobile Offline Local Storage Provider
// Stores cached assigned dues and offline collection queue.
// ==============================================================================

import 'models/offline_models.dart';

/// Canonical SQLite schema DDL statements for Phase 2 mobile SQLite / Drift persistence.
class OfflineSqliteSchema {
  static const String createCachedAssignedDuesTable = '''
CREATE TABLE IF NOT EXISTS cached_assigned_dues (
  due_id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  chit_group_id TEXT NOT NULL,
  chit_group_code TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  route_name TEXT,
  installment_month INTEGER NOT NULL,
  due_amount INTEGER NOT NULL,
  dividend_amount INTEGER NOT NULL,
  net_payable INTEGER NOT NULL,
  due_status TEXT NOT NULL,
  due_date TEXT NOT NULL,
  cached_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dues_route ON cached_assigned_dues(route_name);
CREATE INDEX IF NOT EXISTS idx_dues_status ON cached_assigned_dues(due_status);
''';

  static const String createOfflineCollectionsQueueTable = '''
CREATE TABLE IF NOT EXISTS offline_collections_queue (
  queue_id TEXT PRIMARY KEY,
  due_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  installment_month INTEGER NOT NULL,
  amount_collected INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  receipt_number_provisional TEXT NOT NULL,
  sync_status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_queue_sync_status ON offline_collections_queue(sync_status);
CREATE INDEX IF NOT EXISTS idx_queue_idempotency ON offline_collections_queue(idempotency_key);
''';
}

abstract class OfflineStorageProvider {
  Future<void> init();
  Future<void> saveAssignedDues(List<CachedAssignedDue> dues);
  Future<List<CachedAssignedDue>> getAssignedDues({String? routeName});
  Future<void> enqueueCollection(OfflineCollectionItem item);
  Future<List<OfflineCollectionItem>> getPendingCollections();
  Future<void> updateCollectionStatus(String queueId, OfflineSyncStatus status, {String? error});
  Future<void> removeCollection(String queueId);
  Future<void> markDueAsPaid(String dueId);
  Future<void> clearAll();
}

class InMemoryOfflineStorageProvider implements OfflineStorageProvider {
  final Map<String, CachedAssignedDue> _dues = {};
  final Map<String, OfflineCollectionItem> _queue = {};

  @override
  Future<void> init() async {}

  @override
  Future<void> saveAssignedDues(List<CachedAssignedDue> dues) async {
    for (final due in dues) {
      _dues[due.dueId] = due;
    }
  }

  @override
  Future<List<CachedAssignedDue>> getAssignedDues({String? routeName}) async {
    if (routeName == null || routeName.isEmpty) {
      return _dues.values.toList();
    }
    return _dues.values.where((d) => d.routeName == routeName).toList();
  }

  @override
  Future<void> enqueueCollection(OfflineCollectionItem item) async {
    _queue[item.queueId] = item;
  }

  @override
  Future<List<OfflineCollectionItem>> getPendingCollections() async {
    return _queue.values
        .where((item) =>
            item.syncStatus == OfflineSyncStatus.pending ||
            item.syncStatus == OfflineSyncStatus.failed)
        .toList();
  }

  @override
  Future<void> updateCollectionStatus(
    String queueId,
    OfflineSyncStatus status, {
    String? error,
  }) async {
    final existing = _queue[queueId];
    if (existing != null) {
      _queue[queueId] = OfflineCollectionItem(
        queueId: existing.queueId,
        dueId: existing.dueId,
        ticketId: existing.ticketId,
        installmentMonth: existing.installmentMonth,
        amountCollected: existing.amountCollected,
        paymentMethod: existing.paymentMethod,
        collectedAt: existing.collectedAt,
        idempotencyKey: existing.idempotencyKey,
        receiptNumberProvisional: existing.receiptNumberProvisional,
        syncStatus: status,
        retryCount: status == OfflineSyncStatus.failed
            ? existing.retryCount + 1
            : existing.retryCount,
        lastError: error ?? existing.lastError,
      );
    }
  }

  @override
  Future<void> removeCollection(String queueId) async {
    _queue.remove(queueId);
  }

  @override
  Future<void> markDueAsPaid(String dueId) async {
    final existing = _dues[dueId];
    if (existing != null) {
      _dues[dueId] = CachedAssignedDue(
        dueId: existing.dueId,
        ticketId: existing.ticketId,
        chitGroupId: existing.chitGroupId,
        chitGroupCode: existing.chitGroupCode,
        customerId: existing.customerId,
        customerName: existing.customerName,
        customerPhone: existing.customerPhone,
        routeName: existing.routeName,
        installmentMonth: existing.installmentMonth,
        dueAmount: existing.dueAmount,
        dividendAmount: existing.dividendAmount,
        netPayable: existing.netPayable,
        dueStatus: 'PAID',
        dueDate: existing.dueDate,
        cachedAt: existing.cachedAt,
      );
    }
  }

  @override
  Future<void> clearAll() async {
    _dues.clear();
    _queue.clear();
  }
}
