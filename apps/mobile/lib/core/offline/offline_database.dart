// ==============================================================================
// Kumaran Chits — Mobile Offline Local Storage Provider
// Stores cached assigned dues and offline collection queue.
// ==============================================================================

import 'models/offline_models.dart';

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
