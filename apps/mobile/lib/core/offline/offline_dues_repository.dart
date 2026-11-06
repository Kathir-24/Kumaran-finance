// ==============================================================================
// Kumaran Chits — Mobile Offline Dues & Collections Repository
// Manages offline route dues, collection registration, and local persistence.
// ==============================================================================

import '../api/client/idempotency_interceptor.dart';
import 'models/offline_models.dart';
import 'offline_database.dart';

class OfflineDuesRepository {
  final OfflineStorageProvider storage;

  OfflineDuesRepository({required this.storage});

  /// Pre-caches assigned customer dues for the agent's morning field round
  Future<void> cacheMorningDues(List<CachedAssignedDue> dues) async {
    await storage.saveAssignedDues(dues);
  }

  /// Retrieves cached dues with optional route filter
  Future<List<CachedAssignedDue>> getAssignedDues({String? routeName}) async {
    return storage.getAssignedDues(routeName: routeName);
  }

  /// Records a doorstep cash collection offline in customer's presence
  Future<OfflineCollectionItem> recordOfflineCollection({
    required String dueId,
    required String ticketId,
    required int amountCollected,
    required String agentBranchCode,
  }) async {
    final now = DateTime.now().toUtc();
    final timestamp = now.millisecondsSinceEpoch;
    final idempotencyKey = IdempotencyHelper.generateUuidV4();
    final queueId = 'queue-$timestamp-$idempotencyKey';
    final provisionalReceipt = 'PROV-$agentBranchCode-$timestamp';

    final item = OfflineCollectionItem(
      queueId: queueId,
      dueId: dueId,
      ticketId: ticketId,
      amountCollected: amountCollected,
      paymentMethod: 'CASH',
      collectedAt: now.toIso8601String(),
      idempotencyKey: idempotencyKey,
      receiptNumberProvisional: provisionalReceipt,
      syncStatus: OfflineSyncStatus.pending,
    );

    // Enqueue collection for background synchronization
    await storage.enqueueCollection(item);

    // Optimistically mark local due as PAID so agent does not collect twice
    await storage.markDueAsPaid(dueId);

    return item;
  }

  /// Returns collections awaiting synchronization
  Future<List<OfflineCollectionItem>> getPendingCollections() async {
    return storage.getPendingCollections();
  }
}
