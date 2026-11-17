// ==============================================================================
// Kumaran Chits — Mobile Offline Background Sync Engine
// Safely flushes offline collections to backend API using UUIDv4 idempotency keys.
// ==============================================================================

import '../api/client/api_client.dart';
import 'models/offline_models.dart';
import 'offline_database.dart';

class SyncResult {
  final int totalSynced;
  final int totalFailed;
  final List<String> errors;

  const SyncResult({
    required this.totalSynced,
    required this.totalFailed,
    required this.errors,
  });
}

class OfflineSyncManager {
  final OfflineStorageProvider storage;
  final KumaranMobileApiClient apiClient;

  OfflineSyncManager({
    required this.storage,
    required this.apiClient,
  });

  /// Dispatches all pending offline collections sequentially to the server
  Future<SyncResult> syncPendingCollections() async {
    final pending = await storage.getPendingCollections();
    if (pending.isEmpty) {
      return const SyncResult(totalSynced: 0, totalFailed: 0, errors: []);
    }

    int syncedCount = 0;
    int failedCount = 0;
    final List<String> errorMessages = [];

    for (final item in pending) {
      await storage.updateCollectionStatus(item.queueId, OfflineSyncStatus.syncing);

      try {
        // Submit collection to backend using the immutable point-of-collection idempotency key
        await apiClient.request(
          method: 'POST',
          path: '/api/v1/collections/record',
          body: {
            'ticketId': item.ticketId,
            'installmentMonth': item.installmentMonth,
            'amount': item.amountCollected,
            'paymentMethod': item.paymentMethod,
            'idempotencyKey': item.idempotencyKey,
            'collectedAt': item.collectedAt,
            'notes': 'Offline field collection synced automatically (${item.receiptNumberProvisional})',
          },
          customHeaders: {
            'Idempotency-Key': item.idempotencyKey,
          },
        );

        // Successfully recorded on server: purge from offline queue
        await storage.removeCollection(item.queueId);
        syncedCount++;
      } catch (err) {
        final errorStr = err.toString();

        // If server returns 409 Conflict, it means the idempotency key was already committed
        if (errorStr.contains('409') || errorStr.contains('ALREADY_PAID')) {
          await storage.removeCollection(item.queueId);
          syncedCount++;
        } else {
          await storage.updateCollectionStatus(
            item.queueId,
            OfflineSyncStatus.failed,
            error: errorStr,
          );
          failedCount++;
          errorMessages.add('Due ${item.dueId}: $errorStr');
        }
      }
    }

    return SyncResult(
      totalSynced: syncedCount,
      totalFailed: failedCount,
      errors: errorMessages,
    );
  }
}
