// ==============================================================================
// Kumaran Chits — Mobile Offline Caching & Synchronization Test
// ==============================================================================

import 'dart:async';
import '../lib/core/api/client/api_client.dart';
import '../lib/core/offline/models/offline_models.dart';
import '../lib/core/offline/offline_database.dart';
import '../lib/core/offline/offline_dues_repository.dart';
import '../lib/core/offline/offline_sync_manager.dart';

class MockHttpClientSuccess extends KumaranMobileApiClient {
  final List<Map<String, dynamic>> dispatchedCalls = [];

  MockHttpClientSuccess() : super(baseUrl: 'http://test-server');

  @override
  Future<Map<String, dynamic>> request({
    required String method,
    required String path,
    Map<String, dynamic>? queryParameters,
    Map<String, dynamic>? body,
    Map<String, String>? customHeaders,
  }) async {
    dispatchedCalls.add({
      'method': method,
      'path': path,
      'body': body,
      'headers': customHeaders,
    });

    return {
      'success': true,
      'statusCode': 201,
      'data': {
        'receiptNumber': 'KC-REC-PRD-2026-00099',
        'status': 'SUCCESS',
      },
    };
  }
}

void assertEqual(dynamic actual, dynamic expected, String message) {
  if (actual != expected) {
    throw Exception('Assertion failed: $message (Expected: $expected, Actual: $actual)');
  }
}

Future<void> main() async {
  print('Running Mobile Offline Sync Tests...');

  final storage = InMemoryOfflineStorageProvider();
  final repository = OfflineDuesRepository(storage: storage);
  final mockClient = MockHttpClientSuccess();
  final syncManager = OfflineSyncManager(storage: storage, apiClient: mockClient);

  // 1. Pre-cache assigned morning dues
  final morningDues = [
    const CachedAssignedDue(
      dueId: 'due-001',
      ticketId: 'ticket-001',
      chitGroupId: 'chit-001',
      chitGroupCode: 'KCF-2026-A',
      customerId: 'cust-001',
      customerName: 'K. Ramasamy',
      customerPhone: '9842711223',
      routeName: 'Perundurai North Route',
      installmentMonth: 3,
      dueAmount: 50000,
      dividendAmount: 10000,
      netPayable: 40000,
      dueStatus: 'UNPAID',
      dueDate: '2026-11-10',
      cachedAt: '2026-11-06T06:00:00Z',
    ),
  ];

  await repository.cacheMorningDues(morningDues);
  final cached = await repository.getAssignedDues();
  assertEqual(cached.length, 1, 'Should pre-cache 1 due');
  assertEqual(cached.first.dueStatus, 'UNPAID', 'Initial status should be UNPAID');

  // 2. Record doorstep cash collection offline
  final collectionItem = await repository.recordOfflineCollection(
    dueId: 'due-001',
    ticketId: 'ticket-001',
    amountCollected: 40000,
    agentBranchCode: 'PRD',
  );

  assertEqual(collectionItem.amountCollected, 40000, 'Collected amount matches');
  assertEqual(collectionItem.paymentMethod, 'CASH', 'Payment method is CASH');
  assertEqual(collectionItem.idempotencyKey.isNotEmpty, true, 'UUIDv4 idempotency key must be generated');

  // Verify local due status was optimistically transitioned to PAID
  final updatedDues = await repository.getAssignedDues();
  assertEqual(updatedDues.first.dueStatus, 'PAID', 'Local due optimistically marked PAID');

  // 3. Verify item is queued for background sync
  final pending = await repository.getPendingCollections();
  assertEqual(pending.length, 1, 'Should have 1 pending collection in queue');
  assertEqual(pending.first.queueId, collectionItem.queueId, 'Queued item ID matches');

  // 4. Trigger sync
  final syncResult = await syncManager.syncPendingCollections();
  assertEqual(syncResult.totalSynced, 1, 'Should sync 1 collection');
  assertEqual(syncResult.totalFailed, 0, 'Zero failures');
  assertEqual(mockClient.dispatchedCalls.length, 1, 'Dispatched 1 HTTP request');

  final call = mockClient.dispatchedCalls.first;
  assertEqual(call['method'], 'POST', 'HTTP method is POST');
  assertEqual(call['path'], '/api/v1/collections/counter', 'Correct API path');
  assertEqual(call['headers']['Idempotency-Key'], collectionItem.idempotencyKey, 'Idempotency key preserved');

  // 5. Verify queue is drained after successful sync
  final queueAfterSync = await repository.getPendingCollections();
  assertEqual(queueAfterSync.length, 0, 'Offline queue must be drained on successful sync');

  print('All Mobile Offline Sync Tests Passed Successfully!');
}
