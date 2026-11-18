// Mobile Dart Unit Tests: Module 4 Chit Scheme Models Deserialization
import '../lib/core/api/models/api_models.dart';

void assertEqual(dynamic actual, dynamic expected, String message) {
  if (actual != expected) {
    throw AssertionError('$message. Expected: $expected, got: $actual');
  }
}

void assertTrue(bool condition, String message) {
  if (!condition) {
    throw AssertionError(message);
  }
}

void main() {
  print('Running Module 4: Chit Scheme & Ticket Model Deserialization Tests...');

  // Test 1: ChitGroupResponseDto parses whole-rupee math & frozen 4% commission correctly
  {
    final json = <String, dynamic>{
      'id': 'chit-group-001',
      'groupCode': 'KCA-1L-20M-01',
      'groupName': '₹1 Lakh 20 Months Group A',
      'groupNameTamil': 'ரூ 1 லட்சம் 20 மாதங்கள் குழு A',
      'chitValue': 100000,
      'durationMonths': 20,
      'totalTickets': 20,
      'baseInstallment': 5000,
      'foremanCommissionRate': 4.0,
      'maxDiscountCeiling': 25000,
      'initMode': 'NEW_GROUP',
      'onboardedAtMonth': 1,
      'status': 'ACTIVE',
      'sanctionOrderNumber': 'ROC/ERD/CHIT/2026/045',
      'startDate': '2026-11-01T00:00:00.000Z',
      'endDate': '2028-06-01T00:00:00.000Z',
      'branchId': 'branch-prd-001',
      'createdAt': '2026-11-01T00:00:00.000Z',
      'updatedAt': '2026-11-01T00:00:00.000Z',
    };

    final group = ChitGroupResponseDto.fromJson(json);
    assertEqual(group.id, 'chit-group-001', 'id should match');
    assertEqual(group.groupCode, 'KCA-1L-20M-01', 'groupCode should match');
    assertEqual(group.chitValue, 100000, 'chitValue should be 64-bit int');
    assertEqual(group.chitValue.runtimeType, int, 'chitValue runtimeType must be int (Guardrail 2)');
    assertEqual(group.baseInstallment, 5000, 'baseInstallment should match (V / N)');
    assertEqual(group.foremanCommissionRate, 4.0, 'foremanCommissionRate should be 4.0%');
    assertEqual(group.maxDiscountCeiling, 25000, 'maxDiscountCeiling should be V / 4');
    assertEqual(group.status, 'ACTIVE', 'status should match');
    assertEqual(group.durationMonths, 20, 'durationMonths should be int 20');
    assertEqual(group.totalTickets, 20, 'totalTickets should be int 20');
  }

  // Test 1b: ChitGroupResponseDto parses BigInt-serialized strings (> 2^53 - 1) without double truncation
  {
    const largeWholeRupee = 9007199254740993;
    final bigGroup = ChitGroupResponseDto.fromJson({
      'id': 'chit-group-big',
      'groupCode': 'KCA-BIG-20M-01',
      'groupName': 'Large Test Scheme',
      'chitValue': '$largeWholeRupee',
      'durationMonths': '20',
      'totalTickets': '20',
      'baseInstallment': '5000',
      'foremanCommissionRate': '4.00',
      'maxDiscountCeiling': '25000',
      'initMode': 'NEW_GROUP',
      'onboardedAtMonth': '1',
      'status': 'ACTIVE',
      'startDate': '2026-11-01T00:00:00.000Z',
      'endDate': '2028-06-01T00:00:00.000Z',
      'branchId': 'branch-prd-001',
      'createdAt': '2026-11-01T00:00:00.000Z',
      'updatedAt': '2026-11-01T00:00:00.000Z',
    });
    assertEqual(bigGroup.chitValue, largeWholeRupee, 'chitValue preserves exact 64-bit int from string');
    assertEqual(bigGroup.foremanCommissionRate, 4.0, 'foremanCommissionRate parses from string "4.00"');
    assertEqual(bigGroup.durationMonths, 20, 'durationMonths parses from string');
  }

  // Test 2: TicketResponseDto parses assigned customer and prized status
  {
    final json = <String, dynamic>{
      'id': 'ticket-001',
      'chitGroupId': 'chit-group-001',
      'customerId': 'cust-001',
      'ticketNumber': 1,
      'isPrized': true,
      'prizedAuctionId': 'auction-001',
      'consecutiveUnpaidMonths': 0,
      'status': 'ACTIVE',
      'joiningDate': '2026-11-01T00:00:00.000Z',
    };

    final ticket = TicketResponseDto.fromJson(json);
    assertEqual(ticket.id, 'ticket-001', 'ticket id should match');
    assertEqual(ticket.ticketNumber, 1, 'ticketNumber should be 1');
    assertEqual(ticket.isPrized, true, 'isPrized should be true (Company Pool #1)');
    assertEqual(ticket.consecutiveUnpaidMonths, 0, 'consecutiveUnpaidMonths should be 0');
    assertEqual(ticket.status, 'ACTIVE', 'status should be ACTIVE');
  }

  print('ALL Module 4 Dart model tests PASSED successfully!');
}
