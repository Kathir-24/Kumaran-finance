// ==============================================================================
// Kumaran Chits — Mobile Offline Models (Dart)
// Represents cached route dues and offline doorstep collections queue.
// ==============================================================================

class CachedAssignedDue {
  final String dueId;
  final String ticketId;
  final String chitGroupId;
  final String chitGroupCode;
  final String customerId;
  final String customerName;
  final String customerPhone;
  final String? routeName;
  final int installmentMonth;
  final int dueAmount;        // Whole rupees (BigInt)
  final int dividendAmount;   // Whole rupees (BigInt)
  final int netPayable;       // Whole rupees (BigInt)
  final String dueStatus;     // UNPAID, PAID
  final String dueDate;
  final String cachedAt;

  const CachedAssignedDue({
    required this.dueId,
    required this.ticketId,
    required this.chitGroupId,
    required this.chitGroupCode,
    required this.customerId,
    required this.customerName,
    required this.customerPhone,
    this.routeName,
    required this.installmentMonth,
    required this.dueAmount,
    required this.dividendAmount,
    required this.netPayable,
    required this.dueStatus,
    required this.dueDate,
    required this.cachedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'due_id': dueId,
      'ticket_id': ticketId,
      'chit_group_id': chitGroupId,
      'chit_group_code': chitGroupCode,
      'customer_id': customerId,
      'customer_name': customerName,
      'customer_phone': customerPhone,
      'route_name': routeName,
      'installment_month': installmentMonth,
      'due_amount': dueAmount,
      'dividend_amount': dividendAmount,
      'net_payable': netPayable,
      'due_status': dueStatus,
      'due_date': dueDate,
      'cached_at': cachedAt,
    };
  }

  factory CachedAssignedDue.fromMap(Map<String, dynamic> map) {
    return CachedAssignedDue(
      dueId: map['due_id'] as String,
      ticketId: map['ticket_id'] as String,
      chitGroupId: map['chit_group_id'] as String,
      chitGroupCode: map['chit_group_code'] as String,
      customerId: map['customer_id'] as String,
      customerName: map['customer_name'] as String,
      customerPhone: map['customer_phone'] as String,
      routeName: map['route_name'] as String?,
      installmentMonth: (map['installment_month'] as num).toInt(),
      dueAmount: (map['due_amount'] as num).toInt(),
      dividendAmount: (map['dividend_amount'] as num).toInt(),
      netPayable: (map['net_payable'] as num).toInt(),
      dueStatus: map['due_status'] as String,
      dueDate: map['due_date'] as String,
      cachedAt: map['cached_at'] as String,
    );
  }
}

enum OfflineSyncStatus { pending, syncing, synced, failed }

class OfflineCollectionItem {
  final String queueId;
  final String dueId;
  final String ticketId;
  final int installmentMonth;
  final int amountCollected;       // Whole rupees (BigInt)
  final String paymentMethod;      // CASH
  final String collectedAt;
  final String idempotencyKey;     // UUIDv4 generated at point-of-collection
  final String receiptNumberProvisional;
  final OfflineSyncStatus syncStatus;
  final int retryCount;
  final String? lastError;

  const OfflineCollectionItem({
    required this.queueId,
    required this.dueId,
    required this.ticketId,
    required this.installmentMonth,
    required this.amountCollected,
    required this.paymentMethod,
    required this.collectedAt,
    required this.idempotencyKey,
    required this.receiptNumberProvisional,
    required this.syncStatus,
    this.retryCount = 0,
    this.lastError,
  });

  Map<String, dynamic> toMap() {
    return {
      'queue_id': queueId,
      'due_id': dueId,
      'ticket_id': ticketId,
      'installment_month': installmentMonth,
      'amount_collected': amountCollected,
      'payment_method': paymentMethod,
      'collected_at': collectedAt,
      'idempotency_key': idempotencyKey,
      'receipt_number_provisional': receiptNumberProvisional,
      'sync_status': syncStatus.name,
      'retry_count': retryCount,
      'last_error': lastError,
    };
  }

  factory OfflineCollectionItem.fromMap(Map<String, dynamic> map) {
    return OfflineCollectionItem(
      queueId: map['queue_id'] as String,
      dueId: map['due_id'] as String,
      ticketId: map['ticket_id'] as String,
      installmentMonth: (map['installment_month'] as num?)?.toInt() ?? 1,
      amountCollected: (map['amount_collected'] as num).toInt(),
      paymentMethod: map['payment_method'] as String,
      collectedAt: map['collected_at'] as String,
      idempotencyKey: map['idempotency_key'] as String,
      receiptNumberProvisional: map['receipt_number_provisional'] as String,
      syncStatus: OfflineSyncStatus.values.firstWhere(
        (s) => s.name == map['sync_status'],
        orElse: () => OfflineSyncStatus.pending,
      ),
      retryCount: (map['retry_count'] as num?)?.toInt() ?? 0,
      lastError: map['last_error'] as String?,
    );
  }
}
