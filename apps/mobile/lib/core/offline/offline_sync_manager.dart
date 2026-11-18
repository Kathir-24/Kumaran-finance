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
  final int maxRetries;

  OfflineSyncManager({
    required this.storage,
    required this.apiClient,
    this.maxRetries = 5,
  });

  /// Dispatches pending offline collections to the server.
  /// When [useBatchEndpoint] is true and multiple items are pending, dispatches via
  /// `POST /api/v1/collections/sync-offline-queue` with item-level failure isolation.
  /// Falls back seamlessly to point-of-collection single-record sync via `/api/v1/collections/record`.
  Future<SyncResult> syncPendingCollections({bool useBatchEndpoint = false}) async {
    final allPending = await storage.getPendingCollections();
    final pending = allPending.where((item) => item.retryCount < maxRetries).toList();
    if (pending.isEmpty) {
      return const SyncResult(totalSynced: 0, totalFailed: 0, errors: []);
    }

    if (useBatchEndpoint && pending.length > 1) {
      try {
        final res = await apiClient.request(
          method: 'POST',
          path: '/api/v1/collections/sync-offline-queue',
          body: {
            'items': pending
                .map((item) => {
                      'idempotencyKey': item.idempotencyKey,
                      'ticketId': item.ticketId,
                      'installmentMonth': item.installmentMonth,
                      'amount': item.amountCollected,
                      'paymentMethod': item.paymentMethod,
                      'collectedAt': item.collectedAt,
                      'notes':
                          'Offline field collection synced automatically (${item.receiptNumberProvisional})',
                    })
                .toList(),
          },
        );

        final data = res['data'] is Map<String, dynamic>
            ? res['data'] as Map<String, dynamic>
            : res;
        final syncedList = (data['synced'] as List<dynamic>?) ?? [];
        final failedList = (data['failed'] as List<dynamic>?) ?? [];

        final syncedKeyMap = {
          for (final s in syncedList) (s as Map<String, dynamic>)['idempotencyKey']: s
        };

        final failedKeyMap = {
          for (final f in failedList) (f as Map<String, dynamic>)['idempotencyKey']: f
        };

        int syncedCount = 0;
        int failedCount = 0;
        final List<String> errorMessages = [];

        for (final item in pending) {
          if (syncedKeyMap.containsKey(item.idempotencyKey)) {
            await storage.removeCollection(item.queueId);
            syncedCount++;
          } else if (failedKeyMap.containsKey(item.idempotencyKey)) {
            final f = failedKeyMap[item.idempotencyKey] as Map<String, dynamic>;
            final errorStr =
                '${f['errorCode'] ?? 'FAILED'}: ${f['errorMessage'] ?? 'Sync failed'}';
            await storage.updateCollectionStatus(
              item.queueId,
              OfflineSyncStatus.failed,
              error: errorStr,
            );
            failedCount++;
            errorMessages.add('Due ${item.dueId}: $errorStr');
          }
        }

        return SyncResult(
          totalSynced: syncedCount,
          totalFailed: failedCount,
          errors: errorMessages,
        );
      } catch (_) {
        // Fall through to sequential sync on batch network/proxy error
      }
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
