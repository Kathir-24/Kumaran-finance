import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';

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
      user.roles.includes(Role.PARTNER) ||
      user.roles.includes(Role.AUDITOR) ||
      user.roles.includes(Role.ACCOUNTANT)
    ) {
      return; // Global access
    }

    if (
      user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.SUPER_ADMIN)
    ) {
      if (!user.branchId || payment.branchId !== user.branchId) {
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
      user.roles.includes(Role.PARTNER) ||
      user.roles.includes(Role.AUDITOR) ||
      user.roles.includes(Role.ACCOUNTANT)
    ) {
      return;
    }

    if (
      user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.SUPER_ADMIN)
    ) {
      if (!user.branchId || winner.auction.chitGroup.branchId !== user.branchId) {
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
      user.roles.includes(Role.PARTNER) ||
      user.roles.includes(Role.AUDITOR) ||
      user.roles.includes(Role.ACCOUNTANT)
    ) {
      return;
    }

    if (
      user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.SUPER_ADMIN)
    ) {
      if (!user.branchId || auction.chitGroup.branchId !== user.branchId) {
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
      user.roles.includes(Role.PARTNER) ||
      user.roles.includes(Role.AUDITOR) ||
      user.roles.includes(Role.ACCOUNTANT)
    ) {
      return;
    }

    if (
      user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.SUPER_ADMIN)
    ) {
      if (!user.branchId || ticket.chitGroup.branchId !== user.branchId) {
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
  /**
   * Validates access to raw storage keys based on directory category, ownership, and branch boundaries (F06).
   */
  static async assertStorageKeyAccess(
    key: string,
    user: JwtPayload,
    prisma?: PrismaService,
  ): Promise<void> {
    // Strict Default-Deny on unapproved prefixes (F06)
    const APPROVED_PREFIXES = [
      'kyc/',
      'passbooks/',
      'minutes/',
      'safety-proof/',
      'safety-proofs/',
      'receipts/',
      'vouchers/',
    ];
    if (!APPROVED_PREFIXES.some((p) => key.startsWith(p))) {
      throw new ForbiddenException(
        'Access denied: Unknown or unauthorized storage category',
      );
    }

    if (
      user.roles.includes(Role.SUPER_ADMIN) ||
      user.roles.includes(Role.AUDITOR)
    ) {
      return; // Global oversight for approved storage categories
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
      if (
        user.roles.includes(Role.BRANCH_MANAGER) &&
        !user.roles.includes(Role.SUPER_ADMIN)
      ) {
        if (!user.branchId || !prisma) {
          throw new ForbiddenException(
            'Access denied: Branch manager must have an assigned branch',
          );
        }
        const customerId = key.split('/')[1];
        if (customerId) {
          const cust = await prisma.customer.findUnique({
            where: { id: customerId },
            select: { branchId: true },
          });
          if (!cust || !cust.branchId || cust.branchId !== user.branchId) {
            throw new ForbiddenException(
              'Access denied: Customer does not belong to your assigned branch',
            );
          }
        }
      }
      return;
    }

    if (key.startsWith('passbooks/')) {
      if (user.roles.includes(Role.CUSTOMER)) {
        // Format: passbooks/{chitGroupId}/ticket-{ticketNumber}.pdf
        const parts = key.split('/');
        const chitGroupId = parts[1];
        const ticketFile = parts[2] || '';
        const ticketNumMatch = ticketFile.match(/ticket-(\d+)/);
        const ticketNumber = ticketNumMatch ? parseInt(ticketNumMatch[1], 10) : null;

        if (prisma && chitGroupId && ticketNumber !== null) {
          const ticket = await prisma.subscriberTicket.findFirst({
            where: {
              chitGroupId,
              ticketNumber,
              customerId: user.sub,
            },
            select: { id: true },
          });
          if (!ticket) {
            throw new ForbiddenException(
              'Access denied: You can only view passbooks for your own subscriber tickets',
            );
          }
        } else {
          throw new ForbiddenException(
            'Access denied: You can only view passbooks for your own subscriber tickets',
          );
        }
      } else if (user.roles.includes(Role.COLLECTION_AGENT)) {
        throw new ForbiddenException(
          'Access denied: Field agents cannot download raw passbooks via direct storage routes',
        );
      } else if (
        user.roles.includes(Role.BRANCH_MANAGER) &&
        !user.roles.includes(Role.SUPER_ADMIN)
      ) {
        if (!user.branchId || !prisma) {
          throw new ForbiddenException(
            'Access denied: Branch manager must have an assigned branch',
          );
        }
        const parts = key.split('/');
        const chitGroupId = parts[1];
        if (chitGroupId) {
          const chit = await prisma.chitGroup.findUnique({
            where: { id: chitGroupId },
            select: { branchId: true },
          });
          if (!chit || !chit.branchId || chit.branchId !== user.branchId) {
            throw new ForbiddenException(
              'Access denied: Chit scheme does not belong to your assigned branch',
            );
          }
        }
      }
      return;
    }

    if (
      key.startsWith('minutes/') ||
      key.startsWith('safety-proof/') ||
      key.startsWith('safety-proofs/')
    ) {
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
      if (
        user.roles.includes(Role.BRANCH_MANAGER) &&
        !user.roles.includes(Role.SUPER_ADMIN)
      ) {
        if (!user.branchId || !prisma) {
          throw new ForbiddenException(
            'Access denied: Branch manager must have an assigned branch',
          );
        }
        // Format: minutes/{auctionId}/... or safety-proof/{auctionId}/...
        const parts = key.split('/');
        const auctionId = parts[1];
        if (auctionId) {
          const auction = await prisma.auction.findUnique({
            where: { id: auctionId },
            select: { chitGroup: { select: { branchId: true } } },
          });
          if (!auction || !auction.chitGroup?.branchId || auction.chitGroup.branchId !== user.branchId) {
            throw new ForbiddenException(
              'Access denied: Auction minutes or safety proofs belong to another branch',
            );
          }
        }
      }
      return;
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
      if (
        user.roles.includes(Role.BRANCH_MANAGER) &&
        !user.roles.includes(Role.SUPER_ADMIN)
      ) {
        if (!user.branchId || !prisma) {
          throw new ForbiddenException(
            'Access denied: Branch manager must have an assigned branch',
          );
        }
        // Format: receipts/{receiptNumber}.pdf or receipts/branchCode/year/receipt.pdf
        const fileName = key.split('/').pop() || '';
        const receiptMatch = fileName.match(/^KC-REC-([A-Z0-9]+)-/);
        if (receiptMatch && receiptMatch[1]) {
          const branchCode = receiptMatch[1];
          const branch = await prisma.branch.findUnique({
            where: { id: user.branchId },
            select: { code: true },
          });
          if (!branch || branch.code !== branchCode) {
            throw new ForbiddenException(
              'Access denied: Receipt belongs to another branch',
            );
          }
        }
      }
      return;
    }

    // Strict Default-Deny on unapproved prefixes (F06)
    throw new ForbiddenException(
      'Access denied: Unknown or unauthorized storage category',
    );
  }

  /**
   * Validates write/upload permissions to a sanitized storage key during local-driver
   * presigned PUT fallback execution.
   */
  static async assertStorageUploadAccess(
    key: string,
    user: JwtPayload,
    prisma?: PrismaService,
  ): Promise<void> {
    const isStaffUploader = user.roles.some((r) =>
      ([Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT] as Role[]).includes(r),
    );

    if (key.startsWith('kyc/')) {
      if (
        user.roles.includes(Role.BRANCH_MANAGER) &&
        !user.roles.includes(Role.SUPER_ADMIN)
      ) {
        if (!user.branchId || !prisma) {
          throw new ForbiddenException(
            'Access denied: Branch manager must have an assigned branch',
          );
        }
        const customerId = key.split('/')[1];
        if (customerId) {
          const cust = await prisma.customer.findUnique({
            where: { id: customerId },
            select: { branchId: true },
          });
          if (!cust || !cust.branchId || cust.branchId !== user.branchId) {
            throw new ForbiddenException(
              'Access denied: Customer does not belong to your assigned branch',
            );
          }
        }
      }
      if (
        isStaffUploader ||
        user.roles.includes(Role.COLLECTION_AGENT)
      ) {
        return;
      }
      if (user.roles.includes(Role.CUSTOMER)) {
        const customerFolder = key.split('/')[1];
        if (customerFolder !== user.sub && !customerFolder?.includes(user.phone)) {
          throw new ForbiddenException(
            'Access denied: You can only upload KYC documents to your own folder',
          );
        }
        return;
      }
      throw new ForbiddenException(
        'Access denied: Your role cannot upload KYC documents',
      );
    }

    if (key.startsWith('safety-proof/')) {
      if (!isStaffUploader) {
        throw new ForbiddenException(
          'Access denied: Only Super Admin, Branch Manager, or Accountant can upload safety proofs',
        );
      }
      if (
        user.roles.includes(Role.BRANCH_MANAGER) &&
        !user.roles.includes(Role.SUPER_ADMIN)
      ) {
        if (!user.branchId || !prisma) {
          throw new ForbiddenException(
            'Access denied: Branch manager must have an assigned branch',
          );
        }
        const auctionId = key.split('/')[1];
        if (auctionId) {
          const auction = await prisma.auction.findUnique({
            where: { id: auctionId },
            select: { chitGroup: { select: { branchId: true } } },
          });
          if (!auction || !auction.chitGroup?.branchId || auction.chitGroup.branchId !== user.branchId) {
            throw new ForbiddenException(
              'Access denied: Auction belongs to another branch',
            );
          }
        }
      }
      return;
    }

    throw new BadRequestException(
      'Invalid storage upload key prefix: uploads must target kyc/ or safety-proof/',
    );
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
      user.roles.includes(Role.PARTNER) ||
      user.roles.includes(Role.AUDITOR) ||
      user.roles.includes(Role.ACCOUNTANT)
    ) {
      return; // Global access
    }

    if (
      user.roles.includes(Role.BRANCH_MANAGER) &&
      !user.roles.includes(Role.SUPER_ADMIN)
    ) {
      if (!user.branchId || customer.branchId !== user.branchId) {
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

    if (user.roles.includes(Role.COLLECTION_AGENT)) {
      if (!user.branchId || customer.branchId !== user.branchId) {
        throw new ForbiddenException(
          'BOLA_VIOLATION: Access denied. Customer profile and KYC documents belong to another branch office',
        );
      }
      return;
    }

    throw new ForbiddenException('BOLA_VIOLATION: Access denied. Unauthorized to access this customer record');
  }
}
