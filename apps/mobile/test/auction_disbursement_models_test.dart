// ==============================================================================
// Kumaran Chits — Module 6 Dart Core Model & Idempotency Unit Tests
// Verifies Guardrail 2 (Whole-Rupee 64-bit int & BigInt-string deserialization),
// BilingualVoucherResponseDto circular-toJson fix, runtime field parity
// (paymentReference, isWinner, EligibleBidder nested customer), & idempotency.
// ==============================================================================

import 'dart:convert';
import '../lib/core/api/client/idempotency_interceptor.dart';
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
  print('Running Module 6: Auction & Disbursement Dart Model Tests...');

  // Test 1: AuctionResponseDto & AuctionDetailResponseDto handle BigInt-serialized strings & whole int
  {
    final json = <String, dynamic>{
      'id': 'auc-002',
      'chitGroupId': 'chit-001',
      'installmentMonth': 2,
      'auctionDate': '2026-12-22T05:30:00.000Z',
      'status': 'COMPLETED',
      'bidDiscount': '25000',
      'foremanCommissionRate': '4.00',
      'foremanCommissionAmount': '4000',
      'totalDividend': '21000',
      'dividendPerTicket': '1050',
      'prizeMoney': '75000',
      'conductedByUserId': 'partner-a-001',
      'finalizedByUserId': 'partner-b-002',
      'tieBidders': [
        {
          'id': 'tie-1',
          'ticketId': 'tkt-05',
          'bidDiscount': '25000',
          'tokenNumber': 2,
          'isWinner': true,
        },
        {
          'id': 'tie-2',
          'ticketId': 'tkt-08',
          'bidDiscount': 25000,
          'tokenNumber': 1,
          'isLotWinner': false,
        },
      ],
    };

    final auc = AuctionDetailResponseDto.fromJson(json);
    assertEqual(auc.installmentMonth, 2, 'installmentMonth must be int 2');
    assertTrue(auc.bidDiscount is int, 'bidDiscount must be whole int');
    assertEqual(auc.bidDiscount, 25000, 'bidDiscount must parse from string');
    assertEqual(auc.foremanCommissionRate, 4.0, 'foremanCommissionRate must parse from string');
    assertEqual(auc.foremanCommissionAmount, 4000, 'commission must be 4000');
    assertEqual(auc.totalDividend, 21000, 'totalDividend must be 21000');
    assertEqual(auc.dividendPerTicket, 1050, 'dividendPerTicket must be 1050');
    assertEqual(auc.prizeMoney, 75000, 'prizeMoney must be 75000');
    assertEqual(auc.tieBidders.length, 2, 'must deserialize both tie bidders');
    assertEqual(auc.tieBidders[0].tokenNumber, 2, 'tokenNumber must parse as int');
    assertEqual(auc.tieBidders[0].isWinner, true, 'isWinner must map Prisma column');
    assertEqual(auc.tieBidders[0].isLotWinner, true, 'isLotWinner alias must match');
    assertEqual(auc.tieBidders[1].isWinner, false, 'isLotWinner fallback must work');
  }

  // Test 2: EligibleBidderResponseDto handles both Prisma nested SubscriberTicket & flat DTO
  {
    final runtimePrismaShape = <String, dynamic>{
      'id': 'ticket-uuid-05',
      'ticketNumber': 5,
      'customerId': 'cust-005',
      'customer': {
        'id': 'cust-005',
        'customerCode': 'KC-CUST-00005',
        'fullName': 'M. Selvam',
        'phone': '9842700005',
      },
    };

    final bidderFromRuntime = EligibleBidderResponseDto.fromJson(runtimePrismaShape);
    assertEqual(bidderFromRuntime.ticketId, 'ticket-uuid-05', 'ticketId falls back to id');
    assertEqual(bidderFromRuntime.ticketNumber, 5, 'ticketNumber must be int 5');
    assertEqual(bidderFromRuntime.customerName, 'M. Selvam', 'customerName from nested customer');
    assertEqual(bidderFromRuntime.customerCode, 'KC-CUST-00005', 'customerCode from nested customer');
    assertEqual(bidderFromRuntime.phone, '9842700005', 'phone from nested customer');

    final flatDtoShape = <String, dynamic>{
      'ticketId': 'ticket-uuid-09',
      'ticketNumber': 9,
      'customerId': 'cust-009',
      'customerName': 'S. Sundaram',
      'customerCode': 'KC-CUST-00009',
      'phone': '9842700009',
    };
    final bidderFromDto = EligibleBidderResponseDto.fromJson(flatDtoShape);
    assertEqual(bidderFromDto.ticketId, 'ticket-uuid-09', 'flat ticketId matches');
    assertEqual(bidderFromDto.customerName, 'S. Sundaram', 'flat customerName matches');
  }

  // Test 3: Guardrail 2 — 64-bit integer precision preserved on Bid & Correction & Payout DTOs
  {
    const largeWholeRupee = 9007199254740993; // > 2^53 - 1
    final bid = RecordBidDto.fromJson({
      'ticketId': 'tkt-1',
      'bidDiscount': '$largeWholeRupee',
      'auctionDate': '2026-12-22T00:00:00.000Z',
    });
    assertEqual(bid.bidDiscount, largeWholeRupee, 'RecordBidDto preserves 64-bit int');

    final correction = RequestAuctionCorrectionDto.fromJson({
      'correctedBidDiscount': '24000',
      'reason': 'Clerical digit entry error',
    });
    assertEqual(correction.correctedBidDiscount, 24000, 'Correction parses BigInt string');

    final auth = AuthorizePayoutDto.fromJson({
      'disbursementMode': 'ACCOUNT_PAYEE_CHEQUE',
      'disbursedAmount': '75000',
    });
    assertEqual(auth.disbursedAmount, 75000, 'AuthorizePayoutDto parses BigInt string');
  }

  // Test 4: WinnerDisbursementItemDto supports canonical paymentReference + legacy disbursementReference
  {
    final winner = WinnerDisbursementItemDto.fromJson({
      'id': 'win-001',
      'auctionId': 'auc-002',
      'ticketId': 'tkt-05',
      'disbursementStatus': 'DISBURSED',
      'disbursementMode': 'BANK_TRANSFER_NEFT',
      'disbursedAmount': '71050',
      'paymentReference': 'KVB-NEFT-20261222-001',
      'verifiedByUserId': 'partner-a-001',
      'authorizedByUserId': 'partner-b-002',
      'disbursedAt': '2026-12-23T09:00:00.000Z',
    });

    assertEqual(winner.disbursedAmount, 71050, 'disbursedAmount parses arrears-adjusted int');
    assertEqual(winner.paymentReference, 'KVB-NEFT-20261222-001', 'paymentReference matches Prisma');
    assertEqual(winner.disbursementReference, 'KVB-NEFT-20261222-001', 'legacy alias matches');
    assertEqual(winner.verifiedByUserId, 'partner-a-001', 'verifiedByUserId preserved');
    assertEqual(winner.authorizedByUserId, 'partner-b-002', 'authorizedByUserId preserved');
  }

  // Test 5: DEF-WM-10 CRITICAL — BilingualVoucherResponseDto.toJson() must NOT create circular map
  {
    final voucher = BilingualVoucherResponseDto.fromJson({
      'voucherNumber': 'KC-VOU-PRD-2026-KCA-1L-20M-01-00002',
      'isBilingual': true,
      'issuedAt': '2026-12-23T09:00:00.000Z',
      'data': {'chitValue': 100000, 'prizeMoney': 75000},
      'formattedText': 'KUMARAN FINANCE / குமரன் பைனான்ஸ்',
    });

    final encoded = jsonEncode(voucher.toJson());
    final decoded = jsonDecode(encoded) as Map<String, dynamic>;
    assertEqual(decoded['voucherNumber'], 'KC-VOU-PRD-2026-KCA-1L-20M-01-00002', 'voucherNumber round-trips');
    assertEqual((decoded['data'] as Map<String, dynamic>)['prizeMoney'], 75000, 'nested data preserved without cycle');
  }

  // Test 6: FinalSettlementDataDto parses FIN-B Month N settlement fields as exact int
  {
    final settlement = FinalSettlementDataDto.fromJson({
      'chitGroupId': 'chit-001',
      'installmentMonth': 20,
      'ticketNumber': 20,
      'customerName': 'N. Subramaniam',
      'grossPrize': '100000',
      'foremanCommission': '4000',
      'finalMonthInstallment': '5000',
      'priorArrearsDeducted': '0',
      'netPrizeMoney': '91000',
      'disbursementMode': 'ACCOUNT_PAYEE_CHEQUE',
      'paymentReference': 'IOB-CHQ-FINAL-998811',
      'disbursedAt': '2026-12-23T00:00:00.000Z',
      'auctionId': 'auc-020',
    });

    assertEqual(settlement.grossPrize, 100000, 'grossPrize is int 100000');
    assertEqual(settlement.foremanCommission, 4000, 'foremanCommission is int 4000');
    assertEqual(settlement.finalMonthInstallment, 5000, 'finalMonthInstallment is int 5000');
    assertEqual(settlement.netPrizeMoney, 91000, 'netPrizeMoney is int 91000');
  }

  // Test 7: XR-WM-03 — ConfirmSafetyProofDto.sizeBytes & SafetyProofUrlResponseDto.expiresInSeconds are int
  {
    final confirm = ConfirmSafetyProofDto.fromJson({
      'key': 'safety-proof/auc-002/cheque.jpg',
      'fileName': 'cheque.jpg',
      'mimeType': 'image/jpeg',
      'sizeBytes': 512000,
    });
    final int sizeBytes = confirm.sizeBytes;
    assertEqual(sizeBytes, 512000, 'sizeBytes matches 512000 as int');

    final confirmFromStr = ConfirmSafetyProofDto.fromJson({
      'key': 'safety-proof/auc-002/cheque.jpg',
      'fileName': 'cheque.jpg',
      'mimeType': 'image/jpeg',
      'sizeBytes': '1048576',
    });
    assertEqual(confirmFromStr.sizeBytes, 1048576, 'sizeBytes parses integer string');

    final urlDto = SafetyProofUrlResponseDto.fromJson({
      'url': 'https://r2.kumaran.internal/safety-proof/auc-002/cheque.jpg',
      'expiresInSeconds': 900,
      'securityDocS3Key': 'safety-proof/auc-002/cheque.jpg',
    });
    final int expires = urlDto.expiresInSeconds;
    assertEqual(expires, 900, 'expiresInSeconds matches 900 as int');
  }

  // Test 8: IdempotencyHelper covers /auctions and /disbursements mutations
  {
    assertTrue(
      IdempotencyHelper.requiresIdempotency('POST', '/api/v1/auctions/auc-1/finalize'),
      'POST /auctions finalize requires Idempotency-Key',
    );
    assertTrue(
      IdempotencyHelper.requiresIdempotency('POST', '/api/v1/disbursements/auction/auc-1/disburse'),
      'POST /disbursements release requires Idempotency-Key',
    );
    assertEqual(
      IdempotencyHelper.requiresIdempotency('GET', '/api/v1/auctions/auc-1'),
      false,
      'GET /auctions does not require Idempotency-Key',
    );
  }

  print('ALL Module 6 Dart model & idempotency tests PASSED successfully!');
}
