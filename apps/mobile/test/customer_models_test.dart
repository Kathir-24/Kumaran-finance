// ==============================================================================
// Kumaran Chits — Customer & Nominee Model Deserialization Test Suite (DEF-02, DEF-12)
// Validates NomineeResponseDto fullName/name parity and integer typing in Dart models.
// ==============================================================================

import '../lib/core/api/models/api_models.dart';

void assertEqual(dynamic actual, dynamic expected, String message) {
  if (actual != expected) {
    throw Exception('Assertion failed: $message (Expected: $expected, Actual: $actual)');
  }
}

void assertTrue(bool condition, String message) {
  if (!condition) {
    throw Exception('Assertion failed: $message (Expected true, got false)');
  }
}

void main() {
  print('Running Module 3: Customer & Nominee Model Deserialization Tests...');

  // Test 1: DEF-02: NomineeResponseDto deserializes fullName when provided by runtime API
  {
    final json = <String, dynamic>{
      'id': 'nominee-001',
      'customerId': 'cust-001',
      'fullName': 'Kavitha Sundaram',
      'relationship': 'Spouse',
      'phone': '9842798765',
      'aadhaarLast4': '8912',
      'createdAt': '2026-11-17T12:00:00.000Z',
    };

    final nominee = NomineeResponseDto.fromJson(json);
    assertEqual(nominee.fullName, 'Kavitha Sundaram', 'nominee.fullName should match');
    assertEqual(nominee.name, 'Kavitha Sundaram', 'nominee.name alias should match');
    assertEqual(nominee.relationship, 'Spouse', 'relationship should match');
    assertEqual(nominee.phone, '9842798765', 'phone should match');
    assertEqual(nominee.aadhaarLast4, '8912', 'aadhaarLast4 should match');
  }

  // Test 2: DEF-02: NomineeResponseDto backward compatibility with legacy name field
  {
    final json = <String, dynamic>{
      'id': 'nominee-002',
      'customerId': 'cust-002',
      'name': 'R. Saradha',
      'relationship': 'Mother',
      'phone': '9843123456',
      'createdAt': '2026-11-17T12:00:00.000Z',
    };

    final nominee = NomineeResponseDto.fromJson(json);
    assertEqual(nominee.fullName, 'R. Saradha', 'fullName fallback should match name');
    assertEqual(nominee.name, 'R. Saradha', 'name should match');
    assertEqual(nominee.relationship, 'Mother', 'relationship should match');
  }

  // Test 3: DEF-12: CustomerCountsDto uses integer types for counts
  {
    final json = <String, dynamic>{
      'tickets': 3,
      'nominees': 1,
      'documents': 2,
    };

    final counts = CustomerCountsDto.fromJson(json);
    assertEqual(counts.tickets, 3, 'tickets count should be 3');
    assertEqual(counts.nominees, 1, 'nominees count should be 1');
    assertEqual(counts.documents, 2, 'documents count should be 2');
    assertTrue(counts.tickets is int, 'tickets should be int');
    assertTrue(counts.nominees is int, 'nominees should be int');
    assertTrue(counts.documents is int, 'documents should be int');
  }

  // Test 4: DEF-12: CustomerResponseDto uses integer type for version counter
  {
    final json = <String, dynamic>{
      'id': 'cust-001',
      'customerCode': 'KC-CUST-00001',
      'fullName': 'Sundaram S',
      'phone': '9842712345',
      'addressLine1': '14 Main St',
      'city': 'Perundurai',
      'pincode': '638052',
      'isKycVerified': true,
      'version': 4,
      'createdAt': '2026-11-17T12:00:00.000Z',
      'updatedAt': '2026-11-17T12:00:00.000Z',
    };

    final customer = CustomerResponseDto.fromJson(json);
    assertEqual(customer.version, 4, 'version should be 4');
    assertTrue(customer.version is int, 'version should be int');
  }

  // Test 5: DEF-12: ConfirmCustomerDocumentDto uses integer type for sizeBytes
  {
    final json = <String, dynamic>{
      'key': 'kyc/cust-001/doc-1.pdf',
      'docType': 'PAN',
      'fileName': 'pan.pdf',
      'mimeType': 'application/pdf',
      'sizeBytes': 2048576,
    };

    final doc = ConfirmCustomerDocumentDto.fromJson(json);
    assertEqual(doc.sizeBytes, 2048576, 'sizeBytes should match');
    assertTrue(doc.sizeBytes is int, 'sizeBytes should be int');
  }

  print('ALL Module 3 Dart model tests PASSED successfully!');
}
