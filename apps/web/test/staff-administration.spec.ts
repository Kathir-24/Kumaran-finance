import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Task 9.2: Staff User Administration Unit Tests', () => {
  type UserRole =
    | 'SUPER_ADMIN'
    | 'BRANCH_MANAGER'
    | 'ACCOUNTANT'
    | 'COLLECTION_AGENT'
    | 'CUSTOMER'
    | 'AUDITOR';

  interface StaffUser {
    id: string;
    branchId?: string | null;
    name: string;
    phone: string;
    roles: UserRole[];
    isActive: boolean;
    passwordHash: string;
    refreshTokenHash?: string | null;
    createdAt: Date;
    updatedAt: Date;
    // Strictly zero email per ADR-18
  }

  interface CreateStaffPayload {
    name: string;
    phone: string;
    roles: UserRole[];
    branchId?: string;
    password?: string;
  }

  const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;
  const DEFAULT_STAFF_PASSWORD = 'Admin@Kumaran2026';
  const PRIMARY_HO_BRANCH_ID = 'branch-prd-001';

  const mockManagingPartner: StaffUser = {
    id: 'user-partner-001',
    branchId: PRIMARY_HO_BRANCH_ID,
    name: 'K. Kathirvel (Partner)',
    phone: '9842100001',
    roles: ['SUPER_ADMIN'],
    isActive: true,
    passwordHash: '$2b$10$partnerHash',
    refreshTokenHash: 'active-refresh-token',
    createdAt: new Date('2026-10-15T10:00:00Z'),
    updatedAt: new Date('2026-10-15T10:00:00Z'),
  };

  const mockFieldAgent: StaffUser = {
    id: 'user-agent-002',
    branchId: PRIMARY_HO_BRANCH_ID,
    name: 'R. Murugan',
    phone: '9842154321',
    roles: ['COLLECTION_AGENT'],
    isActive: true,
    passwordHash: '$2b$10$agentHash',
    refreshTokenHash: 'agent-refresh-token',
    createdAt: new Date('2026-10-16T10:00:00Z'),
    updatedAt: new Date('2026-10-16T10:00:00Z'),
  };

  // Helper functions simulating backend business guards
  const onboardStaffUser = (
    actorRoles: UserRole[],
    payload: CreateStaffPayload,
    existingUsers: StaffUser[]
  ): StaffUser => {
    // 1. RBAC Guard: Super Admin only
    if (!actorRoles.includes('SUPER_ADMIN')) {
      throw new Error('FORBIDDEN: Only Super Admin / Managing Partners can onboard staff users');
    }

    // 2. Name validation
    const trimmedName = payload.name?.trim();
    if (!trimmedName || trimmedName.length < 3) {
      throw new Error('INVALID_NAME: Staff name must be at least 3 characters');
    }

    // 3. ADR-18 Phone-Only Identity validation
    const trimmedPhone = payload.phone?.trim();
    if (!trimmedPhone || !INDIAN_PHONE_REGEX.test(trimmedPhone)) {
      throw new Error('INVALID_PHONE: Contact phone must be a valid 10-digit Indian mobile number');
    }

    if (existingUsers.some((u) => u.phone === trimmedPhone)) {
      throw new Error(`CONFLICT: Phone number ${trimmedPhone} is already registered to a staff account`);
    }

    // 4. Roles validation
    if (!payload.roles || payload.roles.length === 0) {
      throw new Error('INVALID_ROLES: At least one RBAC role persona must be assigned');
    }

    // 5. Branch assignment: Defaults to Head Office PRD if omitted
    const assignedBranchId = payload.branchId || PRIMARY_HO_BRANCH_ID;

    return {
      id: `user-staff-${Date.now()}`,
      branchId: assignedBranchId,
      name: trimmedName,
      phone: trimmedPhone,
      roles: payload.roles,
      isActive: true,
      passwordHash: `$2b$10$hashed_${payload.password || DEFAULT_STAFF_PASSWORD}`,
      refreshTokenHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  const updateStaffStatus = (
    actorId: string,
    actorRoles: UserRole[],
    targetUser: StaffUser,
    newStatus: boolean
  ): StaffUser => {
    if (!actorRoles.includes('SUPER_ADMIN')) {
      throw new Error('FORBIDDEN: Only Super Admin can change staff active status');
    }

    // Self-Protection Guard
    if (actorId === targetUser.id && !newStatus) {
      throw new Error('BAD_REQUEST: Super Admins cannot deactivate their own active account');
    }

    return {
      ...targetUser,
      isActive: newStatus,
      // Invalidate sessions immediately upon deactivation
      refreshTokenHash: newStatus ? targetUser.refreshTokenHash : null,
      updatedAt: new Date(),
    };
  };

  const updateStaffRoles = (
    actorId: string,
    actorRoles: UserRole[],
    targetUser: StaffUser,
    newRoles: UserRole[]
  ): StaffUser => {
    if (!actorRoles.includes('SUPER_ADMIN')) {
      throw new Error('FORBIDDEN: Only Super Admin can modify staff RBAC roles');
    }

    if (!newRoles || newRoles.length === 0) {
      throw new Error('INVALID_ROLES: At least one role is required');
    }

    // Self-Privilege Revocation Guard
    if (actorId === targetUser.id && !newRoles.includes('SUPER_ADMIN')) {
      throw new Error('BAD_REQUEST: Super Admins cannot revoke their own Super Admin privileges');
    }

    return {
      ...targetUser,
      roles: newRoles,
      updatedAt: new Date(),
    };
  };

  const resetStaffPassword = (
    actorRoles: UserRole[],
    targetUser: StaffUser,
    customPassword?: string
  ): { targetUser: StaffUser; temporaryPassword: string } => {
    if (!actorRoles.includes('SUPER_ADMIN')) {
      throw new Error('FORBIDDEN: Only Super Admin can trigger emergency password reset');
    }

    if (customPassword && customPassword.trim().length < 8) {
      throw new Error('INVALID_PASSWORD: Temporary password must be at least 8 characters');
    }

    const tempPassword = customPassword?.trim() || 'Temp#99887766!';

    return {
      targetUser: {
        ...targetUser,
        passwordHash: `$2b$10$hashed_${tempPassword}`,
        refreshTokenHash: null, // Revokes all active sessions immediately
        updatedAt: new Date(),
      },
      temporaryPassword: tempPassword,
    };
  };

  it('1. ADR-18 Phone-Only Identity: Enforces 10-digit Indian phone regex and eliminates email', () => {
    const invalidPhones = [
      '1234567890',  // invalid prefix
      '5555555555',  // invalid prefix
      '987654321',   // 9 digits
      '98765432100', // 11 digits
      'staff@kumaran.in', // email string
      '',            // empty
    ];

    for (const badPhone of invalidPhones) {
      assert.throws(
        () =>
          onboardStaffUser(
            ['SUPER_ADMIN'],
            {
              name: 'Test Staff',
              phone: badPhone,
              roles: ['COLLECTION_AGENT'],
            },
            [mockManagingPartner]
          ),
        /INVALID_PHONE/
      );
    }

    const created = onboardStaffUser(
      ['SUPER_ADMIN'],
      {
        name: 'V. Senthil',
        phone: '9842198765',
        roles: ['COLLECTION_AGENT'],
      },
      [mockManagingPartner]
    );

    assert.equal(created.phone, '9842198765');
    assert.equal('email' in created, false, 'Staff user entity must NOT contain email field');
  });

  it('2. Super Admin Authority Gate: Restricts onboarding, status, and role mutations to SUPER_ADMIN', () => {
    const unauthorizedRoles: UserRole[][] = [
      ['ACCOUNTANT'],
      ['COLLECTION_AGENT'],
      ['BRANCH_MANAGER'],
      ['AUDITOR'],
      ['CUSTOMER'],
      ['COLLECTION_AGENT', 'ACCOUNTANT'],
    ];

    for (const roles of unauthorizedRoles) {
      assert.throws(
        () =>
          onboardStaffUser(
            roles,
            {
              name: 'Unauthorized User',
              phone: '9842111222',
              roles: ['COLLECTION_AGENT'],
            },
            []
          ),
        /FORBIDDEN/
      );

      assert.throws(
        () => updateStaffStatus('other-id', roles, mockFieldAgent, false),
        /FORBIDDEN/
      );

      assert.throws(
        () => updateStaffRoles('other-id', roles, mockFieldAgent, ['ACCOUNTANT']),
        /FORBIDDEN/
      );

      assert.throws(
        () => resetStaffPassword(roles, mockFieldAgent),
        /FORBIDDEN/
      );
    }
  });

  it('3. Dual-Role Support: Validates multi-role staff profiles (e.g. Field Agent + Desk Accountant)', () => {
    const dualRoleStaff = onboardStaffUser(
      ['SUPER_ADMIN'],
      {
        name: 'M. Palanisamy',
        phone: '9842177889',
        roles: ['COLLECTION_AGENT', 'ACCOUNTANT'],
      },
      [mockManagingPartner]
    );

    assert.equal(dualRoleStaff.roles.length, 2);
    assert.ok(dualRoleStaff.roles.includes('COLLECTION_AGENT'));
    assert.ok(dualRoleStaff.roles.includes('ACCOUNTANT'));
  });

  it('4. Self-Protection Guard: Blocks Super Admin from deactivating own active account', () => {
    assert.throws(
      () =>
        updateStaffStatus(
          mockManagingPartner.id,
          ['SUPER_ADMIN'],
          mockManagingPartner,
          false
        ),
      /BAD_REQUEST: Super Admins cannot deactivate their own active account/
    );

    // Can deactivate other staff account
    const deactivatedAgent = updateStaffStatus(
      mockManagingPartner.id,
      ['SUPER_ADMIN'],
      mockFieldAgent,
      false
    );
    assert.equal(deactivatedAgent.isActive, false);
    assert.equal(deactivatedAgent.refreshTokenHash, null, 'Deactivation must revoke refresh tokens');
  });

  it('5. Self-Privilege Revocation Guard: Blocks Super Admin from revoking own Super Admin role', () => {
    assert.throws(
      () =>
        updateStaffRoles(
          mockManagingPartner.id,
          ['SUPER_ADMIN'],
          mockManagingPartner,
          ['ACCOUNTANT'] // Attempt to revoke own SUPER_ADMIN role
        ),
      /BAD_REQUEST: Super Admins cannot revoke their own Super Admin privileges/
    );

    // Can update roles for another staff member
    const updatedAgent = updateStaffRoles(
      mockManagingPartner.id,
      ['SUPER_ADMIN'],
      mockFieldAgent,
      ['COLLECTION_AGENT', 'ACCOUNTANT']
    );
    assert.ok(updatedAgent.roles.includes('ACCOUNTANT'));
  });

  it('6. Emergency Password Reset & Session Invalidation: Resets password and purges refreshTokenHash', () => {
    const { targetUser: resetUser, temporaryPassword } = resetStaffPassword(
      ['SUPER_ADMIN'],
      mockFieldAgent,
      'Kumaran#Secure2026!'
    );

    assert.equal(temporaryPassword, 'Kumaran#Secure2026!');
    assert.equal(resetUser.refreshTokenHash, null, 'Emergency reset must terminate active sessions');
    assert.notEqual(resetUser.passwordHash, mockFieldAgent.passwordHash);

    // Auto-generated password
    const autoGen = resetStaffPassword(['SUPER_ADMIN'], mockFieldAgent);
    assert.ok(autoGen.temporaryPassword.length >= 8);
  });

  it('7. Primary Branch Assignment: Defaults to Head Office PRD when branchId is omitted', () => {
    const defaultBranchUser = onboardStaffUser(
      ['SUPER_ADMIN'],
      {
        name: 'S. Loganathan',
        phone: '9842188990',
        roles: ['ACCOUNTANT'],
      },
      [mockManagingPartner]
    );

    assert.equal(defaultBranchUser.branchId, PRIMARY_HO_BRANCH_ID);

    const explicitBranchUser = onboardStaffUser(
      ['SUPER_ADMIN'],
      {
        name: 'K. Balan',
        phone: '9842188991',
        roles: ['BRANCH_MANAGER'],
        branchId: 'branch-erd-002',
      },
      [mockManagingPartner]
    );

    assert.equal(explicitBranchUser.branchId, 'branch-erd-002');
  });

  it('8. Bilingual Parity: 100% dictionary match between en.json and ta.json in users namespace', () => {
    const webRoot = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
      ? process.cwd()
      : path.resolve(process.cwd(), 'apps/web');

    const enPath = path.resolve(webRoot, 'messages/en.json');
    const taPath = path.resolve(webRoot, 'messages/ta.json');

    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

    assert.ok(en.users, 'en.json must contain "users" namespace');
    assert.ok(ta.users, 'ta.json must contain "users" namespace');

    const enKeys = Object.keys(en.users).sort();
    const taKeys = Object.keys(ta.users).sort();

    assert.equal(enKeys.length, taKeys.length, 'Key counts must be identical between en.json and ta.json');
    for (const key of enKeys) {
      assert.ok(ta.users[key], `ta.json is missing key: users.${key}`);
    }
  });
});
