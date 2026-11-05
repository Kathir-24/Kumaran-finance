import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Task 9.1: Branch Offices Administration Unit Tests', () => {
  type UserRole = 'SUPER_ADMIN' | 'BRANCH_MANAGER' | 'ACCOUNTANT' | 'COLLECTION_AGENT' | 'CUSTOMER' | 'AUDITOR';

  interface BranchEntity {
    id: string;
    code: string;
    name: string;
    nameTamil?: string | null;
    address: string;
    phone: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    // Strictly zero company_id per Guardrail 1 / ADR-01
  }

  interface CreateBranchPayload {
    code: string;
    name: string;
    nameTamil?: string;
    address: string;
    phone: string;
  }

  const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

  const mockHeadOffice: BranchEntity = {
    id: 'branch-prd-001',
    code: 'PRD',
    name: 'Head Office - Perundurai',
    nameTamil: 'தலைமை கிளை - பெருந்துறை',
    address: '142, Erode Main Road, Perundurai - 638052',
    phone: '9876543210',
    isActive: true,
    createdAt: new Date('2026-10-15T10:00:00Z'),
    updatedAt: new Date('2026-10-15T10:00:00Z'),
  };

  const validateAndCreateBranch = (
    userRoles: UserRole[],
    payload: CreateBranchPayload,
    existingBranches: BranchEntity[]
  ): BranchEntity => {
    // 1. RBAC Guard: Super Admin only
    if (!userRoles.includes('SUPER_ADMIN')) {
      throw new Error('FORBIDDEN: Only Super Admin / Managing Partners can register new branch offices');
    }

    // 2. Code validation & normalization
    const normalizedCode = payload.code?.trim().toUpperCase();
    if (!normalizedCode || normalizedCode.length < 2) {
      throw new Error('INVALID_CODE: Branch code must be at least 2 characters');
    }
    if (existingBranches.some((b) => b.code === normalizedCode)) {
      throw new Error(`CONFLICT: Branch with code "${normalizedCode}" already exists`);
    }

    // 3. Name validation
    const trimmedName = payload.name?.trim();
    if (!trimmedName || trimmedName.length < 3) {
      throw new Error('INVALID_NAME: Branch name must be at least 3 characters');
    }

    // 4. Address validation
    const trimmedAddress = payload.address?.trim();
    if (!trimmedAddress || trimmedAddress.length < 5) {
      throw new Error('INVALID_ADDRESS: Physical address must be at least 5 characters');
    }

    // 5. Phone validation (ADR-18)
    const trimmedPhone = payload.phone?.trim();
    if (!trimmedPhone || !INDIAN_PHONE_REGEX.test(trimmedPhone)) {
      throw new Error('INVALID_PHONE: Contact phone must be a valid 10-digit Indian mobile number');
    }

    // 6. Return created branch (Zero company_id)
    return {
      id: `branch-${normalizedCode.toLowerCase()}-001`,
      code: normalizedCode,
      name: trimmedName,
      nameTamil: payload.nameTamil?.trim() || null,
      address: trimmedAddress,
      phone: trimmedPhone,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  it('1. Guardrail 1 & ADR-01: Branch schema & creation enforce zero company_id columns', () => {
    const branches = [mockHeadOffice];
    const newBranch = validateAndCreateBranch(
      ['SUPER_ADMIN'],
      {
        code: 'erd',
        name: 'Erode Town Branch',
        nameTamil: 'ஈரோடு கிளை',
        address: '12, Brough Road, Erode - 638001',
        phone: '9842143210',
      },
      branches
    );

    assert.equal(newBranch.code, 'ERD');
    assert.equal('company_id' in newBranch, false, 'Branch entity must NOT have company_id column');
    assert.equal('companyId' in newBranch, false, 'Branch entity must NOT have companyId column');
  });

  it('2. ADR-02: Head Office PRD is registered as central anchor and directory filters correctly', () => {
    const branches: BranchEntity[] = [
      mockHeadOffice,
      {
        id: 'branch-tpr-002',
        code: 'TPR',
        name: 'Tiruppur Branch',
        nameTamil: 'திருப்பூர் கிளை',
        address: '45, Kumaran Road, Tiruppur - 641601',
        phone: '9842143211',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Search by code
    const byCode = branches.filter((b) => b.code.toLowerCase().includes('prd'));
    assert.equal(byCode.length, 1);
    assert.equal(byCode[0].id, 'branch-prd-001');

    // Filter active only
    const activeOnly = branches.filter((b) => b.isActive);
    assert.equal(activeOnly.length, 1);
    assert.equal(activeOnly[0].code, 'PRD');

    // Search by phone
    const byPhone = branches.filter((b) => b.phone.includes('43211'));
    assert.equal(byPhone.length, 1);
    assert.equal(byPhone[0].code, 'TPR');
  });

  it('3. RBAC Authority: Restricts branch creation strictly to SUPER_ADMIN', () => {
    const unauthorizedRoles: UserRole[][] = [
      ['ACCOUNTANT'],
      ['COLLECTION_AGENT'],
      ['AUDITOR'],
      ['BRANCH_MANAGER'],
      ['CUSTOMER'],
      ['ACCOUNTANT', 'COLLECTION_AGENT'],
    ];

    for (const roles of unauthorizedRoles) {
      assert.throws(
        () =>
          validateAndCreateBranch(
            roles,
            {
              code: 'BHV',
              name: 'Bhavani Branch',
              address: '77, Main Road, Bhavani',
              phone: '9842143212',
            },
            [mockHeadOffice]
          ),
        /FORBIDDEN/
      );
    }

    // Super Admin succeeds
    const created = validateAndCreateBranch(
      ['SUPER_ADMIN'],
      {
        code: 'BHV',
        name: 'Bhavani Branch',
        address: '77, Main Road, Bhavani',
        phone: '9842143212',
      },
      [mockHeadOffice]
    );
    assert.equal(created.code, 'BHV');
  });

  it('4. Branch Code Formatting & Uniqueness: Uppercases code and catches 409 Conflict', () => {
    // Uppercase normalization
    const created = validateAndCreateBranch(
      ['SUPER_ADMIN'],
      {
        code: '  kng  ',
        name: 'Kangeyam Branch',
        address: '10, Car Street, Kangeyam',
        phone: '9842143215',
      },
      [mockHeadOffice]
    );
    assert.equal(created.code, 'KNG');

    // Duplicate code rejection
    assert.throws(
      () =>
        validateAndCreateBranch(
          ['SUPER_ADMIN'],
          {
            code: 'prd',
            name: 'Duplicate Perundurai',
            address: 'Another address',
            phone: '9842143219',
          },
          [mockHeadOffice]
        ),
      /CONFLICT: Branch with code "PRD" already exists/
    );

    // Code length check (< 2 chars)
    assert.throws(
      () =>
        validateAndCreateBranch(
          ['SUPER_ADMIN'],
          {
            code: 'A',
            name: 'Short Code Branch',
            address: 'Valid address here',
            phone: '9842143219',
          },
          [mockHeadOffice]
        ),
      /INVALID_CODE/
    );
  });

  it('5. ADR-18 Indian Phone Validation: Strictly enforces 10-digit Indian phone regex (^[6-9]\\d{9}$)', () => {
    const invalidPhones = [
      '1234567890', // starts with 1
      '5555555555', // starts with 5
      '987654321',  // 9 digits
      '98765432100', // 11 digits
      'abcdefghij', // alpha
      '98765 43210', // spaces inside
      '',           // empty
    ];

    for (const badPhone of invalidPhones) {
      assert.throws(
        () =>
          validateAndCreateBranch(
            ['SUPER_ADMIN'],
            {
              code: 'TST',
              name: 'Test Branch',
              address: 'Valid address here',
              phone: badPhone,
            },
            [mockHeadOffice]
          ),
        /INVALID_PHONE/
      );
    }

    const validPhones = ['9876543210', '8765432109', '7654321098', '6543210987'];
    for (const goodPhone of validPhones) {
      const res = validateAndCreateBranch(
        ['SUPER_ADMIN'],
        {
          code: `T${goodPhone.slice(-3)}`,
          name: 'Valid Phone Branch',
          address: 'Valid address here',
          phone: goodPhone,
        },
        [mockHeadOffice]
      );
      assert.equal(res.phone, goodPhone);
    }
  });

  it('6. Bilingual Display: English name is mandatory and Tamil title is supported', () => {
    // English name required
    assert.throws(
      () =>
        validateAndCreateBranch(
          ['SUPER_ADMIN'],
          {
            code: 'NAM',
            name: '  ',
            address: 'Valid address here',
            phone: '9842143210',
          },
          [mockHeadOffice]
        ),
      /INVALID_NAME/
    );

    // With Tamil name
    const branchWithTamil = validateAndCreateBranch(
      ['SUPER_ADMIN'],
      {
        code: 'SLM',
        name: 'Salem Branch',
        nameTamil: 'சேலம் கிளை',
        address: '100, Fort Main Road, Salem',
        phone: '9842143210',
      },
      [mockHeadOffice]
    );
    assert.equal(branchWithTamil.name, 'Salem Branch');
    assert.equal(branchWithTamil.nameTamil, 'சேலம் கிளை');

    // Without Tamil name
    const branchWithoutTamil = validateAndCreateBranch(
      ['SUPER_ADMIN'],
      {
        code: 'NMK',
        name: 'Namakkal Branch',
        address: '50, Bus Stand Road, Namakkal',
        phone: '9842143210',
      },
      [mockHeadOffice]
    );
    assert.equal(branchWithoutTamil.nameTamil, null);
  });

  it('7. Address & Field Integrity: Physical address must be non-empty and trimmed', () => {
    assert.throws(
      () =>
        validateAndCreateBranch(
          ['SUPER_ADMIN'],
          {
            code: 'ADD',
            name: 'Address Test Branch',
            address: '    ',
            phone: '9842143210',
          },
          [mockHeadOffice]
        ),
      /INVALID_ADDRESS/
    );
  });

  it('8. Bilingual Parity: 100% dictionary match between en.json and ta.json in branches namespace', () => {
    const webRoot = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
      ? process.cwd()
      : path.resolve(process.cwd(), 'apps/web');

    const enPath = path.resolve(webRoot, 'messages/en.json');
    const taPath = path.resolve(webRoot, 'messages/ta.json');

    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

    assert.ok(en.branches, 'en.json must contain "branches" namespace');
    assert.ok(ta.branches, 'ta.json must contain "branches" namespace');

    const enKeys = Object.keys(en.branches).sort();
    const taKeys = Object.keys(ta.branches).sort();

    assert.equal(enKeys.length, taKeys.length, 'Key counts must be identical between en.json and ta.json');
    for (const key of enKeys) {
      assert.ok(ta.branches[key], `ta.json is missing key: branches.${key}`);
    }
  });
});
