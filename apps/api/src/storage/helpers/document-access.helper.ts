import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

export class DocumentAccessHelper {
  /**
   * Verifies that the requesting user has permission to view/download the specific payment receipt.
   */
  static assertReceiptAccess(
    payment: {
      branchId: string;
      recordedByUserId: string;
      allocations: Array<{ ticket: { customer: { phone: string } } }>;
    },
    user: JwtPayload,
  ): void {
    if (
      user.roles.includes(Role.SUPER_ADMIN) ||
      user.roles.includes(Role.AUDITOR) ||
      user.roles.includes(Role.ACCOUNTANT)
    ) {
      return; // Global access
    }

    if (
      user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.SUPER_ADMIN)
    ) {
      if (user.branchId && payment.branchId !== user.branchId) {
        throw new ForbiddenException(
          'Access denied: This receipt belongs to another branch office',
        );
      }
      return;
    }

    if (
      user.roles.includes(Role.COLLECTION_AGENT) &&
      !user.roles.includes(Role.SUPER_ADMIN) &&
      !user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.ACCOUNTANT)
    ) {
      if (payment.recordedByUserId !== user.sub) {
        throw new ForbiddenException(
          'Access denied: Collection agents can only download receipts for collections they recorded',
        );
      }
      return;
    }

    if (user.roles.includes(Role.CUSTOMER)) {
      const customerPhone = payment.allocations[0]?.ticket.customer.phone;
      if (!customerPhone || customerPhone !== user.phone) {
        throw new ForbiddenException(
          'Access denied: You can only download your own subscription receipts',
        );
      }
      return;
    }

    throw new ForbiddenException('Access denied: Unauthorized to view this receipt');
  }

  /**
   * Verifies that the requesting user has permission to view/download the prize payout voucher.
   */
  static assertVoucherAccess(
    winner: {
      auction: { chitGroup: { branchId: string } };
      ticket: { customer: { phone: string } };
    },
    user: JwtPayload,
  ): void {
    if (
      user.roles.includes(Role.COLLECTION_AGENT) &&
      !user.roles.includes(Role.SUPER_ADMIN) &&
      !user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.ACCOUNTANT)
    ) {
      throw new ForbiddenException(
        'Access denied: Field collection agents cannot access prize disbursement vouchers',
      );
    }

    if (
      user.roles.includes(Role.SUPER_ADMIN) ||
      user.roles.includes(Role.AUDITOR) ||
      user.roles.includes(Role.ACCOUNTANT)
    ) {
      return;
    }

    if (
      user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.SUPER_ADMIN)
    ) {
      if (user.branchId && winner.auction.chitGroup.branchId !== user.branchId) {
        throw new ForbiddenException(
          'Access denied: This payout voucher belongs to another branch office',
        );
      }
      return;
    }

    if (user.roles.includes(Role.CUSTOMER)) {
      if (winner.ticket.customer.phone !== user.phone) {
        throw new ForbiddenException(
          'Access denied: You can only view prize payout vouchers where you are the winner',
        );
      }
      return;
    }

    throw new ForbiddenException('Access denied: Unauthorized to view this voucher');
  }

  /**
   * Verifies that the requesting user has permission to view/download Form XVII auction minutes.
   */
  static assertMinutesAccess(
    auction: { chitGroup: { branchId: string } },
    user: JwtPayload,
  ): void {
    if (user.roles.includes(Role.CUSTOMER)) {
      throw new ForbiddenException(
        'Access denied: Subscribers cannot access internal statutory auction minutes',
      );
    }

    if (
      user.roles.includes(Role.COLLECTION_AGENT) &&
      !user.roles.includes(Role.SUPER_ADMIN) &&
      !user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.ACCOUNTANT)
    ) {
      throw new ForbiddenException(
        'Access denied: Field collection agents cannot access statutory auction minutes',
      );
    }

    if (
      user.roles.includes(Role.SUPER_ADMIN) ||
      user.roles.includes(Role.AUDITOR) ||
      user.roles.includes(Role.ACCOUNTANT)
    ) {
      return;
    }

    if (
      user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.SUPER_ADMIN)
    ) {
      if (user.branchId && auction.chitGroup.branchId !== user.branchId) {
        throw new ForbiddenException(
          'Access denied: Auction minutes belong to another branch office',
        );
      }
      return;
    }

    throw new ForbiddenException('Access denied: Unauthorized to view auction minutes');
  }

  /**
   * Verifies that the requesting user has permission to view/download Form XXI passbook ledger.
   */
  static assertPassbookAccess(
    ticket: {
      chitGroup: { branchId: string };
      customer: { phone: string };
    },
    user: JwtPayload,
  ): void {
    if (
      user.roles.includes(Role.COLLECTION_AGENT) &&
      !user.roles.includes(Role.SUPER_ADMIN) &&
      !user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.ACCOUNTANT)
    ) {
      throw new ForbiddenException(
        'Access denied: Field collection agents cannot download member passbook statements',
      );
    }

    if (
      user.roles.includes(Role.SUPER_ADMIN) ||
      user.roles.includes(Role.AUDITOR) ||
      user.roles.includes(Role.ACCOUNTANT)
    ) {
      return;
    }

    if (
      user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.SUPER_ADMIN)
    ) {
      if (user.branchId && ticket.chitGroup.branchId !== user.branchId) {
        throw new ForbiddenException(
          'Access denied: Subscriber passbook belongs to another branch office',
        );
      }
      return;
    }

    if (user.roles.includes(Role.CUSTOMER)) {
      if (ticket.customer.phone !== user.phone) {
        throw new ForbiddenException(
          'Access denied: You can only view your own passbook statement',
        );
      }
      return;
    }

    throw new ForbiddenException('Access denied: Unauthorized to view passbook');
  }

  /**
   * Validates access to raw storage keys based on directory category.
   */
  static assertStorageKeyAccess(key: string, user: JwtPayload): void {
    if (
      user.roles.includes(Role.SUPER_ADMIN) ||
      user.roles.includes(Role.AUDITOR)
    ) {
      return; // Global oversight
    }

    if (key.startsWith('kyc/')) {
      if (user.roles.includes(Role.COLLECTION_AGENT)) {
        throw new ForbiddenException(
          'Access denied: Field collection agents cannot access customer KYC scans',
        );
      }
      if (user.roles.includes(Role.CUSTOMER)) {
        // Customer can only access their own KYC folder
        const customerFolder = key.split('/')[1];
        if (customerFolder !== user.sub && !customerFolder?.includes(user.phone)) {
          throw new ForbiddenException(
            'Access denied: You can only view your own KYC documents',
          );
        }
      }
      return;
    }

    if (key.startsWith('minutes/') || key.startsWith('safety-proof/')) {
      if (user.roles.includes(Role.CUSTOMER)) {
        throw new ForbiddenException(
          'Access denied: Subscribers cannot access internal company safety or minutes files',
        );
      }
      if (user.roles.includes(Role.COLLECTION_AGENT)) {
        throw new ForbiddenException(
          'Access denied: Field agents cannot access internal company safety or minutes files',
        );
      }
    }

    if (key.startsWith('receipts/') || key.startsWith('vouchers/')) {
      if (user.roles.includes(Role.CUSTOMER)) {
        throw new ForbiddenException(
          'Access denied: Please access receipts and vouchers through the authorized /pdf endpoints',
        );
      }
      if (user.roles.includes(Role.COLLECTION_AGENT)) {
        throw new ForbiddenException(
          'Access denied: Direct storage file access is restricted for collection agents',
        );
      }
    }
  }

  /**
   * Verifies that the requesting user has permission to view, upload, or modify
   * customer records and KYC documents based on persona and branch boundaries.
   * Enforces Anti-BOLA/IDOR rules:
   * 1. Super Admin, Auditor, Accountant: Global oversight.
   * 2. Branch Manager: Scoped strictly to their assigned branch. Cross-branch access throws 403 Forbidden.
   * 3. Customer: Scoped strictly to self. Third-party access throws 403 Forbidden.
   * 4. Collection Agent: Blocked from viewing/mutating KYC files.
   */
  static assertCustomerAccess(
    customer: { id: string; branchId: string; phone?: string | null },
    user: JwtPayload,
  ): void {
    if (
      user.roles.includes(Role.SUPER_ADMIN) ||
      user.roles.includes(Role.AUDITOR) ||
      user.roles.includes(Role.ACCOUNTANT)
    ) {
      return; // Global access
    }

    if (
      user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.SUPER_ADMIN)
    ) {
      if (user.branchId && customer.branchId !== user.branchId) {
        throw new ForbiddenException(
          'BOLA_VIOLATION: Access denied. Customer profile and KYC documents belong to another branch office',
        );
      }
      return;
    }

    if (user.roles.includes(Role.CUSTOMER)) {
      if (user.sub !== customer.id && (!customer.phone || customer.phone !== user.phone)) {
        throw new ForbiddenException(
          'BOLA_VIOLATION: Access denied. Subscribers are only permitted to access their own account',
        );
      }
      return;
    }

    throw new ForbiddenException('BOLA_VIOLATION: Access denied. Unauthorized to access this customer record');
  }
}
