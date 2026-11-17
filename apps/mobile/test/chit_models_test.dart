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
    assertEqual(group.chitValue, 100000.0, 'chitValue should match');
    assertEqual(group.baseInstallment, 5000.0, 'baseInstallment should match (V / N)');
    assertEqual(group.foremanCommissionRate, 4.0, 'foremanCommissionRate should be 4.0%');
    assertEqual(group.maxDiscountCeiling, 25000.0, 'maxDiscountCeiling should be V / 4');
    assertEqual(group.status, 'ACTIVE', 'status should match');
    assertEqual(group.durationMonths, 20.0, 'durationMonths should match');
    assertEqual(group.totalTickets, 20.0, 'totalTickets should match');
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
