// ==============================================================================
// Kumaran Chits — Module 7 Dart Core Report, Dashboard & Audit Model Tests
// Verifies Guardrail 2 (Whole-Rupee 64-bit int & BigInt-string deserialization),
// runtime backend field parity across Form XXII/XVII/XXI, Day Book, Defaulters,
// Pending Approvals, Dashboard KPIs, Audit Logs, and non-circular JSON encoding.
// ==============================================================================

import 'dart:convert';
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
  print('Running Module 7: Report, Dashboard & Audit Dart Model Tests...');

  const largeWholeRupee = 9007199254740993; // > 2^53 - 1 (IEEE-754 double precision boundary)

  // Test 1: FormXxiiReportResponseDto parses 64-bit int from runtime nested reconciliation BigInt strings
  {
    final runtimeCashBook = FormXxiiReportResponseDto.fromJson({
      'date': '2026-11-18',
      'branchId': 'branch-prd-001',
      'reconciliation': {
        'openingCashInSafe': '$largeWholeRupee',
        'todayCashInflows': '35000',
        'todayCashOutflows': '20000',
        'closingCashInSafe': '${largeWholeRupee + 15000}',
      },
      'inflows': [
        {'paymentId': 'pay-1', 'amount': '35000'},
      ],
      'outflows': [
        {'winnerId': 'win-1', 'amount': '20000'},
      ],
    });

    assertEqual(runtimeCashBook.scope, 'branch-prd-001', 'scope must fall back to branchId');
    assertEqual(runtimeCashBook.openingBalance, largeWholeRupee, 'openingBalance preserves 64-bit BigInt string');
    assertEqual(runtimeCashBook.cashInflows, 35000, 'cashInflows parses from reconciliation');
    assertEqual(runtimeCashBook.cashOutflows, 20000, 'cashOutflows parses from reconciliation');
    assertEqual(runtimeCashBook.closingBalance, largeWholeRupee + 15000, 'closingBalance preserves 64-bit precision');
    assertEqual(runtimeCashBook.entries.length, 2, 'entries merges inflows + outflows when entries omitted');
    assertTrue(jsonEncode(runtimeCashBook.toJson()).contains('branch-prd-001'), 'toJson serializes cleanly');
  }

  // Test 2: ExecutiveDashboardKpiResponseDto parses runtime keys as int (not double)
  {
    final dash = ExecutiveDashboardKpiResponseDto.fromJson({
      'scope': 'COMPANY_WIDE',
      'activeChitsCount': 4,
      'totalSubscribersCount': 80,
      'todayCollections': {'total': '75000', 'cash': '45000'},
      'todayDisbursements': {'total': '190000'},
      'branchVault': {'currentCashInSafe': '$largeWholeRupee'},
      'arrearsAging': {'bucket1Month': {'count': 3, 'totalAmount': '15000'}},
      'pendingActions': {
        'cashHandoversPendingSignoff': 2,
        'winnersPendingSafetyProof': 1,
        'disbursementsPendingAuthorization': 3,
      },
    });

    assertEqual(dash.activeChitsCount, 4, 'activeChitsCount must be int 4');
    assertEqual(dash.activeSubscribersCount, 80, 'activeSubscribersCount falls back to totalSubscribersCount');
    assertEqual(dash.pendingApprovalsCount, 6, 'pendingApprovalsCount derived from pendingActions');
    assertTrue(dash.vaultBalance != null, 'vaultBalance falls back to branchVault');
    assertTrue(dash.arrearsSummary != null, 'arrearsSummary falls back to arrearsAging');
    assertTrue(jsonEncode(dash.toJson()).contains('COMPANY_WIDE'), 'dashboard toJson is non-circular');
  }

  // Test 3: PendingApprovalsSummaryDto & PendingApprovalsResponseDto handle runtime keys & int counts
  {
    final summary = PendingApprovalsSummaryDto.fromJson({
      'cashHandoversCount': 2,
      'paymentReversalsCount': 1,
      'disbursementAuthorizationsCount': 3,
      'safetyProofVerificationsCount': 4,
      'totalPendingCount': 10,
    });
    assertEqual(summary.unacknowledgedHandoversCount, 2, 'cashHandoversCount fallback');
    assertEqual(summary.pendingReversalsCount, 1, 'paymentReversalsCount fallback');
    assertEqual(summary.pendingAuthorizationsCount, 3, 'disbursementAuthorizationsCount fallback');
    assertEqual(summary.pendingSafetyVerificationsCount, 4, 'safetyProofVerificationsCount fallback');
    assertEqual(summary.totalPendingCount, 10, 'totalPendingCount is int 10');

    final response = PendingApprovalsResponseDto.fromJson({
      'scope': 'ALL_BRANCHES',
      'summary': summary,
      'cashHandovers': [{'collectorId': 'c1'}],
      'paymentReversals': [{'id': 'r1'}],
      'disbursementAuthorizations': [{'id': 'a1'}],
      'safetyProofVerifications': [{'id': 's1'}],
    });
    assertEqual(response.handovers.length, 1, 'handovers falls back to cashHandovers');
    assertEqual(response.reversals.length, 1, 'reversals falls back to paymentReversals');
    assertEqual(response.authorizations.length, 1, 'authorizations falls back to disbursementAuthorizations');
    assertEqual(response.safetyProofs.length, 1, 'safetyProofs falls back to safetyProofVerifications');
    assertTrue(jsonEncode(response.toJson()).contains('"totalPendingCount":10'), 'nested summary encodes cleanly');
  }

  // Test 4: FormXviiReportResponseDto, FormXxiReportResponseDto, DayBookReportResponseDto runtime parity
  {
    final form17 = FormXviiReportResponseDto.fromJson({
      'chitGroup': {'id': 'grp-01', 'groupCode': 'KCA-1L-20M-01', 'durationMonths': 20},
      'auctions': [{'auctionId': 'auc-2', 'installmentMonth': 2}],
    });
    assertEqual(form17.chitGroupId, 'grp-01', 'chitGroupId falls back to chitGroup.id');
    assertEqual(form17.groupCode, 'KCA-1L-20M-01', 'groupCode falls back to chitGroup.groupCode');
    assertEqual(form17.durationMonths, 20, 'durationMonths is int 20');

    final form21 = FormXxiReportResponseDto.fromJson({
      'chitGroup': {'id': 'grp-01', 'groupCode': 'KCA-1L-20M-01'},
      'ledgers': [
        {
          'ticketId': 'tkt-04',
          'ticketNumber': 4,
          'customer': {'fullName': 'S. Sundaram'},
          'monthlySchedule': [{'installmentMonth': 1, 'netPayableAmount': '5000'}],
        },
      ],
    });
    assertEqual(form21.ticketId, 'tkt-04', 'ticketId falls back to ledgers[0].ticketId');
    assertEqual(form21.ticketNumber, 4, 'ticketNumber is int 4');
    assertEqual(form21.schedule.length, 1, 'schedule falls back to ledgers[0].monthlySchedule');

    final dayBook = DayBookReportResponseDto.fromJson({
      'date': '2026-11-18',
      'branchId': 'ALL_BRANCHES',
      'summary': {'totalInflows': '50000', 'totalOutflows': '20000', 'netCashFlow': '30000'},
      'inflows': [{'paymentId': 'p1'}],
      'outflows': [{'winnerId': 'w1'}],
    });
    assertEqual(dayBook.scope, 'ALL_BRANCHES', 'dayBook scope falls back to branchId');
    assertEqual(dayBook.totalCollections, '50000', 'totalCollections falls back to summary.totalInflows');
    assertEqual(dayBook.entries.length, 2, 'entries combines inflows and outflows');
  }

  // Test 5: DefaulterItemResponseDto, ReportPaginationDto & AuditLogsReportResponseDto
  {
    final defaulter = DefaulterItemResponseDto.fromJson({
      'ticketId': 'tkt-19',
      'ticketNumber': 19,
      'consecutiveUnpaidMonths': 3,
      'riskCategory': 'HIGH_RISK_3M_REMOVAL',
      'eligibleForRemovalRights': true,
      'totalArrearsAmount': '$largeWholeRupee',
    });
    assertEqual(defaulter.ticketNumber, 19, 'ticketNumber must be int 19');
    assertEqual(defaulter.consecutiveUnpaidMonths, 3, 'consecutiveUnpaidMonths must be int 3');
    assertEqual(defaulter.isEligibleForRemoval, true, 'isEligibleForRemoval falls back to eligibleForRemovalRights');
    assertEqual(defaulter.totalArrears, largeWholeRupee, 'totalArrears preserves 64-bit int');

    final pagination = ReportPaginationDto.fromJson({
      'page': 2,
      'limit': 50,
      'totalRecords': 120,
      'totalPages': 3,
    });
    assertEqual(pagination.page, 2, 'page is int 2');
    assertEqual(pagination.limit, 50, 'limit is int 50');
    assertEqual(pagination.totalRecords, 120, 'totalRecords is int 120');
    assertEqual(pagination.totalPages, 3, 'totalPages is int 3');

    final auditLogs = AuditLogsReportResponseDto.fromJson({
      'pagination': pagination.toJson(),
      'logs': [{'id': 'log-1', 'action': 'AUCTION_FINALIZED'}],
    });
    assertEqual(auditLogs.logs.length, 1, 'auditLogs preserves logs list');
    assertTrue(jsonEncode(auditLogs.toJson()).contains('AUCTION_FINALIZED'), 'auditLogs encodes cleanly');
  }

  // Test 6 (DEF-M10-MOB-01): PassbookEntryDto, InstallmentDueResponseDto, AgentDueItemResponseDto & SettleRemovalResponseDto
  // parse 64-bit whole-Rupee int safely from BigInt strings with zero double/num crashes
  {
    final passbookEntry = PassbookEntryDto.fromJson({
      'installmentMonth': 2,
      'dueDate': '2026-11-18',
      'grossAmount': '$largeWholeRupee',
      'dividendDeduction': '1050',
      'netPayableAmount': '${largeWholeRupee - 1050}',
      'paidAmount': '${largeWholeRupee - 1050}',
      'status': 'PAID',
      'paidAt': '2026-11-15T10:00:00.000Z',
      'receiptNumber': 'KC-REC-PRD-2026-00012',
    });
    assertEqual(passbookEntry.installmentMonth, 2, 'passbook installmentMonth is int 2');
    assertEqual(passbookEntry.grossAmount, largeWholeRupee, 'passbook grossAmount preserves 64-bit BigInt string');
    assertEqual(passbookEntry.dividendDeduction, 1050, 'passbook dividendDeduction is int 1050');
    assertEqual(passbookEntry.netPayableAmount, largeWholeRupee - 1050, 'passbook netPayableAmount preserves 64-bit int');
    assertEqual(passbookEntry.paidAmount, largeWholeRupee - 1050, 'passbook paidAmount preserves 64-bit int');

    final passbookResp = PassbookResponseDto.fromJson({
      'ticket': {'id': 'tkt-1'},
      'chitGroup': {'groupCode': 'KCA-1L-20M-01'},
      'customer': {'fullName': 'M. Murugan'},
      'summary': {'totalPaid': '$largeWholeRupee'},
      'passbook': [passbookEntry.toJson()],
    });
    assertEqual(passbookResp.passbook.length, 1, 'passbook response contains 1 entry');
    assertEqual(passbookResp.passbook.first.grossAmount, largeWholeRupee, 'passbook round-trip preserves 64-bit int');

    final due = InstallmentDueResponseDto.fromJson({
      'id': 'due-1',
      'chitGroupId': 'grp-1',
      'ticketId': 'tkt-1',
      'installmentMonth': 3,
      'dueDate': '2026-12-18',
      'grossAmount': '5000',
      'dividendDeduction': '1050',
      'netPayableAmount': '3950',
      'paidAmount': '0',
      'status': 'UNPAID',
    });
    assertEqual(due.installmentMonth, 3, 'due installmentMonth is int');
    assertEqual(due.grossAmount, 5000, 'due grossAmount parses from string to int');
    assertEqual(due.netPayableAmount, 3950, 'due netPayableAmount parses from string to int');

    final settlement = SettleRemovalResponseDto.fromJson({
      'message': 'Settled',
      'ticketId': 'tkt-9',
      'ticketNumber': '9',
      'totalPaid': '$largeWholeRupee',
      'damagesDeducted': '4000',
      'refundAmount': '${largeWholeRupee - 4000}',
      'status': 'REMOVED_DEF_3M',
    });
    assertEqual(settlement.ticketNumber, 9, 'settlement ticketNumber is int 9');
    assertEqual(settlement.totalPaid, largeWholeRupee, 'settlement totalPaid preserves 64-bit int');
    assertEqual(settlement.damagesDeducted, 4000, 'settlement damagesDeducted is int 4000');
    assertEqual(settlement.refundAmount, largeWholeRupee - 4000, 'settlement refundAmount preserves 64-bit int');
  }

  print('All Module 7 Dart Model Tests PASSED!');
}
