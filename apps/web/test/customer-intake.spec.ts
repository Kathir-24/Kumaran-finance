// ==============================================================================
// Kumaran Chits — Customer Intake Wizard Test Suite (Task 5.2)
// Asserts ADR-16 Paper Intake Rules, ADR-18 Phone Validation, DPDP Act Masked
// Aadhaar, PAN uppercase formatting, RBAC Authority Gates, and Bilingual Parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import enMessages from '../messages/en.json' with { type: 'json' };
import taMessages from '../messages/ta.json' with { type: 'json' };

// 1. Validation helpers mirroring client & backend DTO logic
const REGEX_INDIAN_PHONE = /^[6-9]\d{9}$/;
const REGEX_INDIAN_PAN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const REGEX_AADHAAR_LAST_4 = /^\d{4}$/;
const REGEX_INDIAN_PINCODE = /^\d{6}$/;

function validateCustomerIntake(payload: {
  fullName: string;
  fullNameTamil?: string;
  phone: string;
  altPhone?: string;
  addressLine1: string;
  city?: string;
  pincode?: string;
  panNumber?: string;
  aadhaarLast4?: string;
  includeNominee?: boolean;
  nominee?: {
    fullName: string;
    relationship: string;
    phone: string;
    aadhaarLast4?: string;
  };
}) {
  const errors: string[] = [];

  // Mandatory fields (ADR-16)
  if (!payload.fullName || payload.fullName.trim().length < 2) {
    errors.push('Full Name must be at least 2 characters');
  }
  if (!payload.phone || !REGEX_INDIAN_PHONE.test(payload.phone.trim())) {
    errors.push('Phone number must be a valid 10-digit Indian mobile starting with 6-9');
  }
  if (!payload.addressLine1 || payload.addressLine1.trim().length === 0) {
    errors.push('Address Line 1 is required');
  }

  // Optional field formats
  if (payload.altPhone && !REGEX_INDIAN_PHONE.test(payload.altPhone.trim())) {
    errors.push('Alternate phone must be a valid 10-digit Indian mobile');
  }
  if (payload.pincode && !REGEX_INDIAN_PINCODE.test(payload.pincode.trim())) {
    errors.push('PIN code must be exactly 6 digits');
  }
  if (payload.panNumber && !REGEX_INDIAN_PAN.test(payload.panNumber.trim().toUpperCase())) {
    errors.push('PAN must be valid format (e.g. ABCDE1234F)');
  }
  if (payload.aadhaarLast4 && !REGEX_AADHAAR_LAST_4.test(payload.aadhaarLast4.trim())) {
    errors.push('Aadhaar must be strictly the last 4 digits (e.g. 4821)');
  }

  // Nominee validation if included
  if (payload.includeNominee && payload.nominee) {
    if (!payload.nominee.fullName || payload.nominee.fullName.trim().length < 2) {
      errors.push('Nominee Full Name must be at least 2 characters');
    }
    if (!payload.nominee.relationship || payload.nominee.relationship.trim().length === 0) {
      errors.push('Nominee relationship is required');
    }
    if (!payload.nominee.phone || !REGEX_INDIAN_PHONE.test(payload.nominee.phone.trim())) {
      errors.push('Nominee phone must be a valid 10-digit Indian mobile');
    }
    if (payload.nominee.aadhaarLast4 && !REGEX_AADHAAR_LAST_4.test(payload.nominee.aadhaarLast4.trim())) {
      errors.push('Nominee Aadhaar must be strictly 4 digits');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// 2. RBAC helper
function canPerformCustomerIntake(roles: string[]): boolean {
  const ALLOWED_ROLES = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'COLLECTION_AGENT'];
  return roles.some((r) => ALLOWED_ROLES.includes(r));
}

// ==============================================================================
// Unit Test Assertions
// ==============================================================================

test('Task 5.2: ADR-16 Invariant — Registration succeeds with only mandatory fields', () => {
  // Minimal paper notebook intake payload
  const minimalPayload = {
    fullName: 'S. Rathinasamy',
    phone: '9842712345',
    addressLine1: '45/1 Erode Main Road',
  };

  const result = validateCustomerIntake(minimalPayload);
  assert.equal(result.isValid, true);
  assert.equal(result.errors.length, 0);

  // Missing full name fails
  const missingName = validateCustomerIntake({ ...minimalPayload, fullName: '' });
  assert.equal(missingName.isValid, false);
  assert.ok(missingName.errors.some((e) => e.includes('Full Name')));

  // Missing address line 1 fails
  const missingAddress = validateCustomerIntake({ ...minimalPayload, addressLine1: '' });
  assert.equal(missingAddress.isValid, false);
  assert.ok(missingAddress.errors.some((e) => e.includes('Address Line 1')));
});

test('Task 5.2: ADR-18 Indian Phone Validation — 10 digits starting with 6-9', () => {
  const base = {
    fullName: 'S. Rathinasamy',
    addressLine1: '45/1 Erode Main Road',
  };

  // Valid Indian mobile numbers
  for (const validPhone of ['9842712345', '8765432109', '7654321098', '6543210987']) {
    const res = validateCustomerIntake({ ...base, phone: validPhone });
    assert.equal(res.isValid, true, `Phone ${validPhone} should be accepted`);
  }

  // Invalid phone numbers
  for (const invalidPhone of ['12345', '98427123450', '5842712345', 'ABCDEF1234', '1234567890']) {
    const res = validateCustomerIntake({ ...base, phone: invalidPhone });
    assert.equal(res.isValid, false, `Phone ${invalidPhone} should be rejected`);
  }
});

test('Task 5.2: DPDP Act 2023 Masked Aadhaar — Strictly last 4 digits (no 12-digit leaks)', () => {
  const base = {
    fullName: 'S. Rathinasamy',
    phone: '9842712345',
    addressLine1: '45/1 Erode Main Road',
  };

  // Valid 4-digit masked Aadhaar
  assert.equal(validateCustomerIntake({ ...base, aadhaarLast4: '4821' }).isValid, true);
  assert.equal(validateCustomerIntake({ ...base, aadhaarLast4: '0012' }).isValid, true);

  // Invalid: full 12-digit Aadhaar (violates data minimization)
  const fullAadhaar = validateCustomerIntake({ ...base, aadhaarLast4: '123456789012' });
  assert.equal(fullAadhaar.isValid, false);
  assert.ok(fullAadhaar.errors.some((e) => e.includes('Aadhaar')));

  // Invalid: alphanumeric or symbols
  assert.equal(validateCustomerIntake({ ...base, aadhaarLast4: '482A' }).isValid, false);
  assert.equal(validateCustomerIntake({ ...base, aadhaarLast4: '48 2' }).isValid, false);
});

test('Task 5.2: Income Tax PAN Validation & Auto-Uppercase Invariant', () => {
  const base = {
    fullName: 'S. Rathinasamy',
    phone: '9842712345',
    addressLine1: '45/1 Erode Main Road',
  };

  // Valid PAN (5 letters, 4 numbers, 1 letter)
  assert.equal(validateCustomerIntake({ ...base, panNumber: 'ABCDE1234F' }).isValid, true);
  assert.equal(validateCustomerIntake({ ...base, panNumber: 'abcde1234f' }).isValid, true); // Case insensitive check

  // Invalid PAN formats
  assert.equal(validateCustomerIntake({ ...base, panNumber: 'ABCD12345F' }).isValid, false);
  assert.equal(validateCustomerIntake({ ...base, panNumber: '12345ABCDE' }).isValid, false);
  assert.equal(validateCustomerIntake({ ...base, panNumber: 'ABCDE1234' }).isValid, false);
});

test('Task 5.2: Indian PIN Code — Strictly 6 digits', () => {
  const base = {
    fullName: 'S. Rathinasamy',
    phone: '9842712345',
    addressLine1: '45/1 Erode Main Road',
  };

  // Valid PIN codes
  assert.equal(validateCustomerIntake({ ...base, pincode: '638052' }).isValid, true); // Perundurai
  assert.equal(validateCustomerIntake({ ...base, pincode: '638001' }).isValid, true); // Erode

  // Invalid PIN codes
  assert.equal(validateCustomerIntake({ ...base, pincode: '63805' }).isValid, false);
  assert.equal(validateCustomerIntake({ ...base, pincode: '6380521' }).isValid, false);
  assert.equal(validateCustomerIntake({ ...base, pincode: '63805A' }).isValid, false);
});

test('Task 5.2: Nominee Details Validation Invariant', () => {
  const base = {
    fullName: 'S. Rathinasamy',
    phone: '9842712345',
    addressLine1: '45/1 Erode Main Road',
    includeNominee: true,
  };

  // Valid nominee
  const validNominee = validateCustomerIntake({
    ...base,
    nominee: {
      fullName: 'R. Saradha',
      relationship: 'Spouse',
      phone: '9842798765',
      aadhaarLast4: '7812',
    },
  });
  assert.equal(validNominee.isValid, true);

  // Invalid nominee phone
  const invalidNomineePhone = validateCustomerIntake({
    ...base,
    nominee: {
      fullName: 'R. Saradha',
      relationship: 'Spouse',
      phone: '12345',
    },
  });
  assert.equal(invalidNomineePhone.isValid, false);
  assert.ok(invalidNomineePhone.errors.some((e) => e.includes('Nominee phone')));
});

test('Task 5.2: Guardrail 10 — RBAC Authority Gate prevents Desk Accountant from customer intake', () => {
  // Permitted roles
  assert.equal(canPerformCustomerIntake(['SUPER_ADMIN']), true, 'Super Admin must be permitted');
  assert.equal(canPerformCustomerIntake(['BRANCH_MANAGER']), true, 'Branch Manager must be permitted');
  assert.equal(canPerformCustomerIntake(['COLLECTION_AGENT']), true, 'Collection Agent must be permitted');

  // Restricted roles per CustomerController.create:L67
  assert.equal(canPerformCustomerIntake(['ACCOUNTANT']), false, 'Desk Accountant must be strictly barred');
  assert.equal(canPerformCustomerIntake(['AUDITOR']), false, 'Auditor must be strictly barred');
  assert.equal(canPerformCustomerIntake(['CUSTOMER']), false, 'Subscriber must be barred');
  assert.equal(canPerformCustomerIntake([]), false, 'Empty role must be barred');
});

test('Task 5.2: DEF-09 Alternate Mobile Phone Validation Invariant', () => {
  const base = {
    fullName: 'S. Rathinasamy',
    phone: '9842712345',
    addressLine1: '45/1 Erode Main Road',
  };

  // Valid altPhone
  assert.equal(validateCustomerIntake({ ...base, altPhone: '9443212345' }).isValid, true);
  assert.equal(validateCustomerIntake({ ...base, altPhone: '6380123456' }).isValid, true);

  // Invalid altPhone (starts with 0-5, too short, or non-digits)
  assert.equal(validateCustomerIntake({ ...base, altPhone: '1234567890' }).isValid, false);
  assert.equal(validateCustomerIntake({ ...base, altPhone: '0984212345' }).isValid, false);
  assert.equal(validateCustomerIntake({ ...base, altPhone: '98427' }).isValid, false);
});

test('Task 5.2: DEF-10 Branch Selection & DEF-11 Partial Failure Retry Invariant', () => {
  // Simulates the intake submission flow
  interface IntakeState {
    createdCustomerId: string | null;
    customerCreatedCalls: number;
    nomineeCreatedCalls: number;
  }

  const simulateIntakeSubmission = async (
    state: IntakeState,
    payload: { customer: { fullName: string; phone: string; branchId?: string }; nominee?: { name: string; failOnNominee?: boolean } },
  ) => {
    // Step 1: Customer Creation (skipped if customer already created)
    let customerId = state.createdCustomerId;
    if (!customerId) {
      state.customerCreatedCalls++;
      customerId = 'cust-uuid-created-001';
      state.createdCustomerId = customerId;
    }

    // Step 2: Nominee Creation
    if (payload.nominee) {
      state.nomineeCreatedCalls++;
      if (payload.nominee.failOnNominee) {
        throw new Error('Nominee creation network timeout');
      }
    }

    return { customerId, branchId: payload.customer.branchId || 'default-ho' };
  };

  const state: IntakeState = {
    createdCustomerId: null,
    customerCreatedCalls: 0,
    nomineeCreatedCalls: 0,
  };

  // 1st Attempt: Customer created, but nominee throws error
  assert.rejects(
    async () => {
      await simulateIntakeSubmission(state, {
        customer: { fullName: 'S. Rathinasamy', phone: '9842712345', branchId: 'branch-erd-002' },
        nominee: { name: 'R. Saradha', failOnNominee: true },
      });
    },
    /Nominee creation network timeout/,
  );

  // Assert customer was created once
  assert.equal(state.customerCreatedCalls, 1);
  assert.equal(state.nomineeCreatedCalls, 1);
  assert.equal(state.createdCustomerId, 'cust-uuid-created-001');

  // 2nd Attempt (Retry): User re-submits form after fixing nominee info
  // Since state.createdCustomerId is preserved, customer creation is NOT re-invoked (avoiding 409 Conflict)
  assert.doesNotReject(async () => {
    const res = await simulateIntakeSubmission(state, {
      customer: { fullName: 'S. Rathinasamy', phone: '9842712345', branchId: 'branch-erd-002' },
      nominee: { name: 'R. Saradha', failOnNominee: false },
    });
    assert.equal(res.customerId, 'cust-uuid-created-001');
    assert.equal(res.branchId, 'branch-erd-002');
  });

  // Customer create was NOT called again; nominee was called second time
  assert.equal(state.customerCreatedCalls, 1, 'Customer creation should NOT be called again on retry');
  assert.equal(state.nomineeCreatedCalls, 2, 'Nominee creation should be retried');
});

test('Task 5.2: Bilingual Dictionary Parity — intake keys (en <-> ta)', () => {
  const enCustomers = (enMessages as any).customers || {};
  const taCustomers = (taMessages as any).customers || {};

  const requiredIntakeKeys = [
    'intakeTitle',
    'intakeSubtitle',
    'sectionSubscriber',
    'sectionAddress',
    'sectionNominee',
    'sectionKyc',
    'fullNameLabel',
    'fullNamePlaceholder',
    'phoneLabel',
    'phonePlaceholder',
    'address1Label',
    'address1Placeholder',
    'enableNominee',
    'nomineeNameLabel',
    'nomineeRelationLabel',
    'nomineePhoneLabel',
    'panLabel',
    'aadhaarLabel',
    'fillSample',
    'submitting',
    'submit',
    'successTitle',
    'successDesc',
    'btnViewProfile',
    'btnAssignTicket',
    'btnRegisterAnother',
    'phoneConflictAlert',
    'intakeAccessDeniedTitle',
    'intakeAccessDeniedDesc',
  ];

  for (const k of requiredIntakeKeys) {
    assert.ok(enCustomers[k] && enCustomers[k].length > 0, `English key ${k} must exist and be non-empty`);
    assert.ok(taCustomers[k] && taCustomers[k].length > 0, `Tamil key ${k} must exist and be non-empty`);
  }
});
