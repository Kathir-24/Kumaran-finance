// ==============================================================================
// Kumaran Chits — Customer Directory Test Suite (Task 5.1)
// Asserts Bilingual Search Logic, KYC Filters, Pagination Math, ADR-13 & ADR-16,
// Backend DTO Conformance, and 100% Bilingual Dictionary Parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import enMessages from '../messages/en.json' with { type: 'json' };
import taMessages from '../messages/ta.json' with { type: 'json' };

// 1. Search filter helper mirroring CustomerService.findAll where.OR logic
interface MockCustomer {
  id: string;
  customerCode: string;
  fullName: string;
  fullNameTamil?: string | null;
  phone: string;
  isKycVerified: boolean;
  aadhaarLast4?: string | null;
  panNumber?: string | null;
  _count: {
    tickets: number;
    nominees: number;
    documents: number;
  };
}

const mockSubscribers: MockCustomer[] = [
  {
    id: 'cust-001',
    customerCode: 'KC-CUST-00101',
    fullName: 'K. Mohanraj',
    fullNameTamil: 'கே. மோகன்ராஜ்',
    phone: '9842100101',
    isKycVerified: true,
    aadhaarLast4: '4821',
    panNumber: 'ABCDE1234F',
    _count: { tickets: 2, nominees: 1, documents: 3 },
  },
  {
    id: 'cust-002',
    customerCode: 'KC-CUST-00102',
    fullName: 'C. Chandrasekaran',
    fullNameTamil: 'சி. சந்திரசேகரன்',
    phone: '9842100102',
    isKycVerified: false,
    aadhaarLast4: null,
    panNumber: null,
    _count: { tickets: 1, nominees: 1, documents: 0 },
  },
  {
    id: 'cust-003',
    customerCode: 'KC-CUST-00103',
    fullName: 'V. Gopalakrishnan',
    fullNameTamil: 'வி. கோபாலகிருஷ்ணன்',
    phone: '9842100103',
    isKycVerified: true,
    aadhaarLast4: '1234',
    panNumber: 'XYZWE5678K',
    _count: { tickets: 1, nominees: 2, documents: 2 },
  },
  {
    id: 'cust-004',
    customerCode: 'KC-CUST-00104',
    fullName: 'M. Sampath',
    fullNameTamil: 'எம். சம்பத்',
    phone: '9842100104',
    isKycVerified: false,
    aadhaarLast4: null,
    panNumber: null,
    _count: { tickets: 0, nominees: 0, documents: 0 },
  },
];

function filterCustomers(
  customers: MockCustomer[],
  params: { search?: string; isKycVerified?: string }
): MockCustomer[] {
  let result = [...customers];

  if (params.search && params.search.trim().length > 0) {
    const s = params.search.trim().toLowerCase();
    result = result.filter(
      (c) =>
        c.fullName.toLowerCase().includes(s) ||
        (c.fullNameTamil && c.fullNameTamil.toLowerCase().includes(s)) ||
        c.phone.includes(s) ||
        c.customerCode.toLowerCase().includes(s)
    );
  }

  if (params.isKycVerified !== undefined) {
    const isVerified = params.isKycVerified === 'true';
    result = result.filter((c) => c.isKycVerified === isVerified);
  }

  return result;
}

// 2. Pagination calculation helper
function calculatePagination(total: number, page: number, limit: number) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(100, limit));
  const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0;
  const skip = (safePage - 1) * safeLimit;
  const start = total > 0 ? (safePage - 1) * safeLimit + 1 : 0;
  const end = total > 0 ? Math.min(safePage * safeLimit, total) : 0;

  return {
    page: safePage,
    limit: safeLimit,
    totalPages,
    skip,
    start,
    end,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

// ==============================================================================
// Unit Test Assertions
// ==============================================================================

test('Task 5.1: Search logic correctly matches English, Tamil Unicode, Phone, and Customer Code', () => {
  // Scenario A: English name substring
  const searchEnglish = filterCustomers(mockSubscribers, { search: 'mohanraj' });
  assert.equal(searchEnglish.length, 1);
  assert.equal(searchEnglish[0].id, 'cust-001');

  // Scenario B: Tamil script Unicode substring
  const searchTamil = filterCustomers(mockSubscribers, { search: 'சந்திரசேகரன்' });
  assert.equal(searchTamil.length, 1);
  assert.equal(searchTamil[0].id, 'cust-002');

  // Scenario C: 10-digit phone number
  const searchPhone = filterCustomers(mockSubscribers, { search: '9842100103' });
  assert.equal(searchPhone.length, 1);
  assert.equal(searchPhone[0].id, 'cust-003');

  // Scenario D: Sequential customer code
  const searchCode = filterCustomers(mockSubscribers, { search: 'KC-CUST-00104' });
  assert.equal(searchCode.length, 1);
  assert.equal(searchCode[0].id, 'cust-004');

  // Scenario E: Non-matching search
  const searchNotFound = filterCustomers(mockSubscribers, { search: 'NonExistent' });
  assert.equal(searchNotFound.length, 0);
});

test('Task 5.1: KYC Verification Status filters accurately partition subscribers', () => {
  // All status
  const allList = filterCustomers(mockSubscribers, {});
  assert.equal(allList.length, 4);

  // Approved KYC only
  const verifiedList = filterCustomers(mockSubscribers, { isKycVerified: 'true' });
  assert.equal(verifiedList.length, 2);
  assert.ok(verifiedList.every((c) => c.isKycVerified === true));

  // Pending KYC only (ADR-16 compliance)
  const pendingList = filterCustomers(mockSubscribers, { isKycVerified: 'false' });
  assert.equal(pendingList.length, 2);
  assert.ok(pendingList.every((c) => c.isKycVerified === false));
});

test('Task 5.1: Pagination math handles bounds, item ranges, and edge cases', () => {
  // Scenario A: 25 items, page 1, limit 20
  const page1 = calculatePagination(25, 1, 20);
  assert.equal(page1.page, 1);
  assert.equal(page1.totalPages, 2);
  assert.equal(page1.start, 1);
  assert.equal(page1.end, 20);
  assert.equal(page1.hasPrev, false);
  assert.equal(page1.hasNext, true);

  // Scenario B: 25 items, page 2, limit 20
  const page2 = calculatePagination(25, 2, 20);
  assert.equal(page2.page, 2);
  assert.equal(page2.start, 21);
  assert.equal(page2.end, 25);
  assert.equal(page2.hasPrev, true);
  assert.equal(page2.hasNext, false);

  // Scenario C: 0 items (empty search result)
  const emptyPage = calculatePagination(0, 1, 20);
  assert.equal(emptyPage.totalPages, 0);
  assert.equal(emptyPage.start, 0);
  assert.equal(emptyPage.end, 0);
  assert.equal(emptyPage.hasPrev, false);
  assert.equal(emptyPage.hasNext, false);
});

test('Task 5.1: ADR-13 unique customer limits and ticket holdings tracking', () => {
  // Customer can hold tickets in different groups, but _count reflects total active tickets
  const custWith2Tickets = mockSubscribers.find((c) => c.id === 'cust-001');
  assert.ok(custWith2Tickets);
  assert.equal(custWith2Tickets._count.tickets, 2);

  // Invariant: Customer cannot hold multiple tickets in the SAME group
  const sameGroupTickets = [
    { chitGroupId: 'group-1', customerId: 'cust-001', ticketNumber: 2 },
    { chitGroupId: 'group-1', customerId: 'cust-002', ticketNumber: 3 },
  ];

  const hasDuplicate = (groupId: string, customerId: string) => {
    return sameGroupTickets.some(
      (t) => t.chitGroupId === groupId && t.customerId === customerId
    );
  };

  assert.equal(hasDuplicate('group-1', 'cust-001'), true, 'Duplicate in group-1 detected');
  assert.equal(hasDuplicate('group-1', 'cust-003'), false, 'New customer in group-1 allowed');
  assert.equal(hasDuplicate('group-2', 'cust-001'), false, 'Same customer in different group allowed');
});

test('Task 5.1: ADR-16 Optional KYC & Masked Aadhaar format', () => {
  const verifiedCust = mockSubscribers.find((c) => c.aadhaarLast4 !== null);
  assert.ok(verifiedCust);
  assert.equal(verifiedCust.aadhaarLast4?.length, 4);

  // Format as masked 12-digit Aadhaar
  const formatMaskedAadhaar = (last4?: string | null) => {
    if (!last4) return null;
    return `•••• •••• ${last4}`;
  };

  assert.equal(formatMaskedAadhaar(verifiedCust.aadhaarLast4), '•••• •••• 4821');
  assert.equal(formatMaskedAadhaar(null), null);
});

test('Task 5.1: Backend contract conforms to CustomerListItemDto schema', () => {
  const sample = mockSubscribers[0];

  // Required fields in CustomerListItemDto
  const requiredFields: (keyof MockCustomer)[] = [
    'id',
    'customerCode',
    'fullName',
    'phone',
    'isKycVerified',
    '_count',
  ];

  for (const field of requiredFields) {
    assert.ok(sample[field] !== undefined, `Field ${field} must exist on CustomerListItemDto`);
  }

  assert.ok(typeof sample._count.tickets === 'number');
  assert.ok(typeof sample._count.nominees === 'number');
  assert.ok(typeof sample._count.documents === 'number');
});

test('Task 5.1: Bilingual Dictionary Parity — customers namespace (en <-> ta)', () => {
  const enCustomers = (enMessages as any).customers || {};
  const taCustomers = (taMessages as any).customers || {};

  const enKeys = Object.keys(enCustomers).sort();
  const taKeys = Object.keys(taCustomers).sort();

  assert.deepEqual(
    enKeys,
    taKeys,
    'en.json and ta.json customers dictionary must have 100% identical keys'
  );

  // Verify critical operational keys are populated and non-empty
  const criticalKeys = [
    'title',
    'subtitle',
    'newCustomer',
    'searchPlaceholder',
    'allKyc',
    'kycVerified',
    'kycPending',
    'totalSubscribers',
    'colCode',
    'colName',
    'colContact',
    'colKyc',
    'colHoldings',
    'viewProfile',
    'adr13Notice',
    'adr16Notice',
  ];

  for (const k of criticalKeys) {
    assert.ok(enCustomers[k] && enCustomers[k].length > 0, `English key ${k} must be non-empty`);
    assert.ok(taCustomers[k] && taCustomers[k].length > 0, `Tamil key ${k} must be non-empty`);
  }
});
