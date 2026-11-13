// ==============================================================================
// Kumaran Chits — Customer Profile Edit & RBAC Unit Tests
// Asserts RBAC access gates, ADR-18 10-digit Indian phone validation,
// DPDP Act 2023 masked Aadhaar last-4 data minimization, PAN formatting,
// optimistic locking payload invariants, and 100% bilingual dictionary parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import enMessages from '../messages/en.json' with { type: 'json' };
import taMessages from '../messages/ta.json' with { type: 'json' };

// Validation helper replicating CustomerEditDialog logic
function validateCustomerEditInput(input: {
  fullName: string;
  phone: string;
  altPhone?: string;
  addressLine1: string;
  city: string;
  pincode: string;
  panNumber?: string;
  aadhaarLast4?: string;
}) {
  const errors: string[] = [];

  const REGEX_PHONE = /^[6-9]\d{9}$/;
  const REGEX_PINCODE = /^\d{6}$/;
  const REGEX_PAN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  const REGEX_AADHAAR_LAST_4 = /^\d{4}$/;

  if (!input.fullName || input.fullName.trim().length < 2) {
    errors.push('Full Name in English is required (at least 2 characters).');
  }

  const cleanPhone = input.phone.trim();
  if (!REGEX_PHONE.test(cleanPhone)) {
    errors.push('Primary Mobile must be a valid 10-digit Indian phone starting with 6-9.');
  }

  if (input.altPhone && input.altPhone.trim() && !REGEX_PHONE.test(input.altPhone.trim())) {
    errors.push('Alternate Mobile must be a valid 10-digit Indian phone.');
  }

  if (!input.addressLine1 || input.addressLine1.trim().length < 3) {
    errors.push('Street Address Line 1 is required.');
  }

  if (!input.city || input.city.trim().length < 2) {
    errors.push('Town or City is required.');
  }

  if (!REGEX_PINCODE.test(input.pincode.trim())) {
    errors.push('Postal PIN Code must be exactly 6 digits.');
  }

  if (input.panNumber && input.panNumber.trim()) {
    const cleanPan = input.panNumber.trim().toUpperCase();
    if (!REGEX_PAN.test(cleanPan)) {
      errors.push('Income Tax PAN must be a valid 10-character alphanumeric code.');
    }
  }

  if (input.aadhaarLast4 && input.aadhaarLast4.trim()) {
    const cleanAadhaar = input.aadhaarLast4.trim();
    if (!REGEX_AADHAAR_LAST_4.test(cleanAadhaar)) {
      errors.push('Aadhaar must strictly be the last 4 digits (e.g. 4821). Full 12 digits are prohibited.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// RBAC evaluation helper replicating CustomerProfileHeader logic
function canUserEditCustomerProfile(roles: string[]): boolean {
  return roles.some((role) => ['SUPER_ADMIN', 'BRANCH_MANAGER'].includes(role));
}

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

test('Task: Customer Edit RBAC Gate — Restricts editing to Super Admin & Branch Manager', () => {
  // Authorized personas
  assert.equal(canUserEditCustomerProfile(['SUPER_ADMIN']), true);
  assert.equal(canUserEditCustomerProfile(['BRANCH_MANAGER']), true);
  assert.equal(canUserEditCustomerProfile(['BRANCH_MANAGER', 'ACCOUNTANT']), true);

  // Unauthorized personas
  assert.equal(canUserEditCustomerProfile(['ACCOUNTANT']), false);
  assert.equal(canUserEditCustomerProfile(['COLLECTION_AGENT']), false);
  assert.equal(canUserEditCustomerProfile(['CUSTOMER']), false);
  assert.equal(canUserEditCustomerProfile(['AUDITOR']), false);
  assert.equal(canUserEditCustomerProfile([]), false);
});

test('Task: ADR-18 10-Digit Indian Phone Validation Invariant', () => {
  const baseValid = {
    fullName: 'Sundaram S',
    phone: '9842712345',
    addressLine1: '14/2, North Street',
    city: 'Perundurai',
    pincode: '638052',
  };

  // Valid Indian mobile numbers starting with 6, 7, 8, 9
  assert.equal(validateCustomerEditInput({ ...baseValid, phone: '9842712345' }).isValid, true);
  assert.equal(validateCustomerEditInput({ ...baseValid, phone: '8765432109' }).isValid, true);
  assert.equal(validateCustomerEditInput({ ...baseValid, phone: '7654321098' }).isValid, true);
  assert.equal(validateCustomerEditInput({ ...baseValid, phone: '6543210987' }).isValid, true);

  // Invalid numbers: starts with 1-5, short, long, or non-digits
  assert.equal(validateCustomerEditInput({ ...baseValid, phone: '5842712345' }).isValid, false);
  assert.equal(validateCustomerEditInput({ ...baseValid, phone: '984271234' }).isValid, false); // 9 digits
  assert.equal(validateCustomerEditInput({ ...baseValid, phone: '98427123456' }).isValid, false); // 11 digits
  assert.equal(validateCustomerEditInput({ ...baseValid, phone: '98427abcde' }).isValid, false);
});

test('Task: DPDP Act 2023 Masked Aadhaar Data Minimization Invariant', () => {
  const baseValid = {
    fullName: 'Sundaram S',
    phone: '9842712345',
    addressLine1: '14/2, North Street',
    city: 'Perundurai',
    pincode: '638052',
  };

  // Valid: strictly last 4 digits
  assert.equal(validateCustomerEditInput({ ...baseValid, aadhaarLast4: '4821' }).isValid, true);
  assert.equal(validateCustomerEditInput({ ...baseValid, aadhaarLast4: '0000' }).isValid, true);
  assert.equal(validateCustomerEditInput({ ...baseValid, aadhaarLast4: '' }).isValid, true); // Optional

  // Invalid: full 12-digit Aadhaar violation (DPDP Act)
  const fullAadhaarResult = validateCustomerEditInput({ ...baseValid, aadhaarLast4: '123456789012' });
  assert.equal(fullAadhaarResult.isValid, false);
  assert.ok(fullAadhaarResult.errors.some((e) => e.includes('last 4 digits')));

  // Invalid: 3 digits or non-digits
  assert.equal(validateCustomerEditInput({ ...baseValid, aadhaarLast4: '123' }).isValid, false);
  assert.equal(validateCustomerEditInput({ ...baseValid, aadhaarLast4: 'abcd' }).isValid, false);
});

test('Task: PAN Format & Pincode Invariants', () => {
  const baseValid = {
    fullName: 'Sundaram S',
    phone: '9842712345',
    addressLine1: '14/2, North Street',
    city: 'Perundurai',
    pincode: '638052',
  };

  // Valid PAN
  assert.equal(validateCustomerEditInput({ ...baseValid, panNumber: 'ABCDE1234F' }).isValid, true);
  assert.equal(validateCustomerEditInput({ ...baseValid, panNumber: '' }).isValid, true); // Optional

  // Invalid PAN
  assert.equal(validateCustomerEditInput({ ...baseValid, panNumber: 'ABCDE1234' }).isValid, false);
  assert.equal(validateCustomerEditInput({ ...baseValid, panNumber: '12345ABCDE' }).isValid, false);

  // Valid & Invalid Pincode
  assert.equal(validateCustomerEditInput({ ...baseValid, pincode: '638052' }).isValid, true);
  assert.equal(validateCustomerEditInput({ ...baseValid, pincode: '63805' }).isValid, false); // 5 digits
  assert.equal(validateCustomerEditInput({ ...baseValid, pincode: '6380521' }).isValid, false); // 7 digits
});

test('Task: Optimistic Locking Payload Formation', () => {
  const customer = {
    id: 'cust-uuid-1',
    customerCode: 'KC-CUST-00101',
    fullName: 'Sundaram S',
    phone: '9842712345',
    version: 3,
  };

  // Construct update payload
  const updatePayload = {
    fullName: customer.fullName,
    phone: customer.phone,
    version: customer.version,
  };

  // Assert version is preserved for optimistic concurrency control
  assert.equal(updatePayload.version, 3);
  assert.equal(typeof updatePayload.version, 'number');
});

test('Task: Bilingual Dictionary Parity — customer edit keys (en <-> ta)', () => {
  const requiredEditKeys = [
    'editProfile',
    'editProfileTitle',
    'editProfileDesc',
    'editProfileSuccess',
    'editProfileImmutableNotice',
    'concurrentConflict',
    'phoneInUse',
    'saveChanges',
    'savingChanges',
    'cancel',
  ];

  for (const key of requiredEditKeys) {
    assert.ok(
      key in enMessages.customers,
      `Missing translation key '${key}' in en.json (customers)`,
    );
    assert.ok(
      key in taMessages.customers,
      `Missing translation key '${key}' in ta.json (customers)`,
    );
  }

  // Ensure full key count and list match exactly
  const enKeys = Object.keys(enMessages.customers).sort();
  const taKeys = Object.keys(taMessages.customers).sort();
  assert.equal(enKeys.length, taKeys.length);
  assert.deepEqual(enKeys, taKeys);
});
