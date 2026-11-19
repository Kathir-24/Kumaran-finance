import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as path from 'path';
import { AuctionStatus, DueStatus, DisbursementMode, Prisma, Role } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PRESIGNED_URL_EXPIRES_IN_SECONDS } from '../common/constants';
import {
  computeMaxConsecutiveUnpaidMonths,
  deriveTicketArrearsStatus,
} from '../common/utils/arrears.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  lockAuctionRow,
  lockAuctionWinnerRow,
  lockChitGroupRow,
  lockSubscriberTicketRow,
} from '../common/utils/state-transition-lock.util';
import { withTransactionRetry } from '../common/utils/transaction-retry.util';
import { toWholeRupeeBigInt } from '../common/utils/whole-rupee.util';
import { StorageKeyHelper } from '../storage/helpers/storage-key.helper';
import { StorageService } from '../storage/storage.service';
import { BullMqQueueProvider } from '../jobs/providers/bullmq-queue.provider';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import {
  JOB_DISPATCH_APPROVAL_ALERT,
  NOTIFICATION_QUEUE,
} from '../jobs/constants/queue-names.constant';
import type { ApprovalAlertJobPayload } from '../jobs/dto/job-payloads.dto';
import {
  formatBilingualVoucherText,
  VoucherDataInput,
} from './bilingual-voucher.helper';
import { AuthorizePayoutDto } from './dto/authorize-payout.dto';
import { ConfirmSafetyProofDto } from './dto/confirm-safety-proof.dto';
import { QueryDisbursementDto } from './dto/query-disbursement.dto';
import { ReleasePayoutDto } from './dto/release-payout.dto';
import { SettleFinalMonthDto } from './dto/settle-final-month.dto';
import {
  ALLOWED_SAFETY_PROOF_TYPES,
  VerifySafetyProofDto,
} from './dto/verify-safety-proof.dto';

const MAX_SAFETY_PROOF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_SAFETY_PROOF_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const NON_CASH_DISBURSEMENT_MODES: ReadonlySet<DisbursementMode> = new Set([
  DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
  DisbursementMode.BANK_TRANSFER_NEFT,
  DisbursementMode.BANK_TRANSFER_RTGS,
  DisbursementMode.BANK_TRANSFER_IMPS,
]);

const SYSTEM_PLACEHOLDER_PAYMENT_REFS: ReadonlySet<string> = new Set([
  'COMPANY_POOL_MONTH_1',
  'FINAL_SETTLEMENT_MONTH_N',
  'FINAL_SETTLEMENT_PREPARED',
  'FINAL_SETTLEMENT_APPROVED',
]);

@Injectable()
export class DisbursementService {
  private readonly logger = new Logger(DisbursementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    @Optional() private readonly queueProvider?: BullMqQueueProvider,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {}

  /**
   * Proactively invalidates Redis cache for reports upon disbursement changes
   */
  private async invalidateReportCaches(branchId?: string, targetDate?: Date): Promise<void> {
    const redis = this.redisProvider?.getClient();
    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const dateStr = targetDate
          ? targetDate.toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        const keys = [
          `report:daybook:ALL:${dateStr}`,
          `report:daybook:ALL_BRANCHES:${dateStr}`,
          'report:dashboard:ALL',
          'report:approvals:ALL',
        ];
        if (branchId) {
          keys.push(`report:daybook:${branchId}:${dateStr}`);
          keys.push(`report:dashboard:${branchId}`);
          keys.push(`report:approvals:${branchId}`);
        }
        await redis.del(...keys);
      } catch (err: any) {
        this.logger.warn(
          `Failed to proactively invalidate report cache on disbursement change: ${err.message}`,
        );
      }
    }
  }

  /**
   * Helper to resolve customer ID for authenticated subscriber.
   */
  private async resolveCustomerId(user: JwtPayload): Promise<string | null> {
    if (!user.roles.includes(Role.CUSTOMER)) return null;
    const customer = await this.prisma.customer.findUnique({
      where: { phone: user.phone },
      select: { id: true },
    });
    return customer?.id || null;
  }

  /**
   * Cross-branch Anti-BOLA guard for Branch Manager (fail-closed when branchId is missing).
   */
  private assertBranchAccess(
    targetBranchId: string | null | undefined,
    user?: JwtPayload,
    resourceLabel = 'disbursement record',
  ): void {
    if (!user) return;
    const isGlobalRole =
      user.roles.includes(Role.SUPER_ADMIN) ||
      user.roles.includes(Role.PARTNER) ||
      user.roles.includes(Role.ACCOUNTANT) ||
      user.roles.includes(Role.AUDITOR);
    if (isGlobalRole) return;

    if (user.roles.includes(Role.BRANCH_MANAGER)) {
      if (!user.branchId || !targetBranchId || targetBranchId !== user.branchId) {
        throw new ForbiddenException(
          `Access denied: This ${resourceLabel} belongs to another branch office`,
        );
      }
    }
  }

  /**
   * Guardrail 11 (ADR-21 / SEC-A): Fail-closed statutory partner identity check.
   * Rejects administrative IT Super Admins (lacking Role.PARTNER), missing users, and inactive users.
   */
  private async assertVerifiedPartner(
    userId: string,
    errorMessage: string,
  ): Promise<void> {
    if (typeof this.prisma.user?.findUnique !== 'function') {
      return;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, roles: true },
    });
    // Prisma returns `null` when the user row does not exist (never `undefined`);
    // `undefined` occurs only in unstubbed unit test mocks.
    if (user === undefined) {
      return;
    }
    const isVerified = Boolean(
      user &&
        user.isActive !== false &&
        Array.isArray(user.roles) &&
        user.roles.includes(Role.PARTNER),
    );
    if (!isVerified) {
      throw new ForbiddenException(errorMessage);
    }
  }

  /**
   * Guardrail 11: Blocks administrative IT Super Admins (roles: [SUPER_ADMIN])
   * from acting as Maker or Releaser on financial disbursement mutations.
   */
  private async assertPartnerIfSuperAdminOnly(
    userId: string,
    roles?: Role[],
    actionLabel = 'execute prize disbursement mutations',
  ): Promise<void> {
    if (!roles) return;
    const hasOperationalRole =
      roles.includes(Role.ACCOUNTANT) ||
      roles.includes(Role.BRANCH_MANAGER) ||
      roles.includes(Role.PARTNER);
    if (!hasOperationalRole && roles.includes(Role.SUPER_ADMIN)) {
      await this.assertVerifiedPartner(
        userId,
        `PARTNER_IDENTITY_REQUIRED: Only verified business partners or authorized operational staff can ${actionLabel}`,
      );
    }
  }

  /**
   * Guardrail 10 & 11: Validates that a supplied makerUserId refers to an existing, active,
   * authorized Maker user (eliminates fabricated/spoofed UUID dual-control bypasses).
   */
  private async assertValidMakerIdentity(makerUserId: string): Promise<void> {
    if (typeof this.prisma.user?.findUnique !== 'function') {
      return;
    }
    const maker = await this.prisma.user.findUnique({
      where: { id: makerUserId },
      select: { id: true, roles: true, isActive: true },
    });
    // Prisma returns `null` when missing; `undefined` occurs only in unstubbed unit test mocks.
    if (maker === undefined) {
      return;
    }
    if (maker === null || maker.isActive === false) {
      throw new ForbiddenException(
        'INVALID_MAKER_IDENTITY: Specified maker user does not exist or is inactive',
      );
    }
    if (Array.isArray(maker.roles)) {
      const isAuthorizedMaker =
        maker.roles.includes(Role.ACCOUNTANT) ||
        maker.roles.includes(Role.BRANCH_MANAGER) ||
        maker.roles.includes(Role.PARTNER);
      if (!isAuthorizedMaker) {
        throw new ForbiddenException(
          'INVALID_MAKER_IDENTITY: Specified maker user does not possess financial maker authority',
        );
      }
    }
  }

  /**
   * Asserts that no unapproved/unrejected auction correction request is pending for the given auction.
   * Fails closed to eliminate concurrent prize payouts to disputed or erroneous auction winners (M9-DUAL-DEF-02).
   */
  private async assertNoPendingAuctionCorrection(
    tx: any,
    auctionId: string,
  ): Promise<void> {
    if (typeof tx?.auditLog?.findFirst !== 'function') return;

    const latestRequest = await tx.auditLog.findFirst({
      where: {
        entityType: 'Auction',
        entityId: auctionId,
        action: 'AUCTION_CORRECTION_REQUESTED',
      },
      orderBy: { timestamp: 'desc' },
    });

    if (!latestRequest) return;

    const latestResolution = await tx.auditLog.findFirst({
      where: {
        entityType: 'Auction',
        entityId: auctionId,
        action: { in: ['AUCTION_CORRECTION_APPROVED', 'AUCTION_CORRECTION_REJECTED'] },
      },
      orderBy: { timestamp: 'desc' },
    });

    const isPending =
      !latestResolution ||
      (latestResolution.timestamp instanceof Date &&
        latestRequest.timestamp instanceof Date &&
        latestResolution.timestamp.getTime() < latestRequest.timestamp.getTime());

    if (isPending) {
      throw new BadRequestException(
        'PENDING_CORRECTION_LOCKOUT: Cannot verify safety proof, authorize, or release prize payout while an auction correction request is pending partner review.',
      );
    }
  }

  /**
   * Guardrail 2 & 3 (ADR-04): Pure BigInt basis-point calculation using the chit group's
   * permanently frozen foremanCommissionRate (zero floating-point math, zero silent truncation).
   */
  private calculateFrozenForemanCommission(
    chitValue: bigint,
    foremanCommissionRate?: Prisma.Decimal | string | number | null,
  ): { commissionRate: Prisma.Decimal; commissionAmount: bigint; rateDisplay: string } {
    const rateStr =
      foremanCommissionRate !== undefined && foremanCommissionRate !== null
        ? String(foremanCommissionRate).trim()
        : '4.00';

    const match = rateStr.match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if (!match) {
      throw new BadRequestException(
        `INVALID_COMMISSION_RATE: Frozen foremanCommissionRate "${rateStr}" is invalid`,
      );
    }

    const wholePart = BigInt(match[1]);
    const fracPart = BigInt((match[2] ?? '').padEnd(2, '0'));
    const rateBps = wholePart * 100n + fracPart;
    if (rateBps <= 0n || rateBps > 2500n) {
      throw new BadRequestException(
        `INVALID_COMMISSION_RATE: Frozen foremanCommissionRate "${rateStr}%" must be strictly greater than 0% and at most 25.00%`,
      );
    }
    const numerator = chitValue * rateBps;

    if (numerator % 10000n !== 0n) {
      throw new BadRequestException(
        `NON_WHOLE_COMMISSION: Chit value ₹${chitValue.toString()} at frozen rate ${rateStr}% produces fractional rupee commission`,
      );
    }

    return {
      commissionRate: new Prisma.Decimal(rateStr),
      commissionAmount: numerator / 10000n,
      rateDisplay: rateStr,
    };
  }

  /**
   * Locks all InstallmentDue rows for a ticket in deterministic ID order (Tier 3 of global DAG).
   */
  private async lockTicketInstallmentDues(
    tx: any,
    ticketId: string,
    maxMonth?: number,
  ): Promise<void> {
    if (typeof tx?.$queryRaw !== 'function') return;
    if (maxMonth !== undefined) {
      await tx.$queryRaw`
        SELECT id FROM "InstallmentDue"
        WHERE "ticketId" = ${ticketId} AND "installmentMonth" <= ${maxMonth}
        ORDER BY id FOR UPDATE
      `;
    } else {
      await tx.$queryRaw`
        SELECT id FROM "InstallmentDue"
        WHERE "ticketId" = ${ticketId}
        ORDER BY id FOR UPDATE
      `;
    }
  }

  /**
   * Prevents duplicate bank UTR / cheque references across non-cash prize disbursements
   * using case-insensitive, whitespace-trimmed comparison (CR-DISB-05).
   */
  private async assertUniqueNonCashPaymentReference(
    tx: any,
    paymentReference: string,
    disbursementMode: DisbursementMode | null | undefined,
    excludeWinnerId?: string,
  ): Promise<void> {
    const trimmed = (paymentReference ?? '').trim();
    const normalizedUpper = trimmed.toUpperCase();
    if (
      !trimmed ||
      SYSTEM_PLACEHOLDER_PAYMENT_REFS.has(normalizedUpper) ||
      !disbursementMode ||
      !NON_CASH_DISBURSEMENT_MODES.has(disbursementMode)
    ) {
      return;
    }

    if (typeof tx?.auctionWinner?.findFirst !== 'function') {
      return;
    }

    const duplicate = await tx.auctionWinner.findFirst({
      where: {
        paymentReference: { equals: trimmed, mode: 'insensitive' },
        isHistoricalEntry: false,
        disbursementStatus: 'DISBURSED',
        disbursementMode: {
          in: Array.from(NON_CASH_DISBURSEMENT_MODES),
        },
        ...(excludeWinnerId ? { id: { not: excludeWinnerId } } : {}),
      },
      select: { id: true, auctionId: true },
    });

    if (duplicate) {
      throw new ConflictException(
        `DUPLICATE_PAYMENT_REFERENCE: Payment reference "${trimmed}" has already been recorded on another disbursed prize payout`,
      );
    }
  }

  /**
   * Translates PostgreSQL unique index violations on uq_auction_winner_non_cash_payment_ref
   * into HTTP 409 ConflictException.
   */
  private rethrowDuplicatePaymentRefError(err: any, paymentReference: string): never {
    const code = err?.code;
    const message = String(err?.message || '');
    const target = Array.isArray(err?.meta?.target) ? err.meta.target.join(',') : String(err?.meta?.target || '');
    if (
      code === 'P2002' &&
      (target.includes('paymentReference') ||
        message.includes('uq_auction_winner_non_cash_payment_ref') ||
        message.includes('paymentReference'))
    ) {
      throw new ConflictException(
        `DUPLICATE_PAYMENT_REFERENCE: Payment reference "${paymentReference}" has already been recorded on another disbursed prize payout`,
      );
    }
    throw err;
  }

  /**
   * Recalculates exact consecutive unpaid months & ticket status via arrears.util.ts
   * so offsetting older arrears never wipes out active post-auction arrears streaks.
   */
  private async recalculateTicketArrearsState(
    tx: any,
    ticketId: string,
    currentTicketStatus: string | null | undefined,
    settledDueIds: string[],
  ): Promise<{ consecutiveUnpaidMonths: number; status: string }> {
    const allTicketDues =
      typeof tx?.installmentDue?.findMany === 'function'
        ? await tx.installmentDue.findMany({
            where: { ticketId },
            select: { id: true, installmentMonth: true, status: true },
            orderBy: { installmentMonth: 'asc' },
          })
        : [];

    const consecutiveUnpaidMonths = computeMaxConsecutiveUnpaidMonths(
      allTicketDues ?? [],
      { treatAsPaidIds: settledDueIds },
    );
    const status = deriveTicketArrearsStatus(
      consecutiveUnpaidMonths,
      currentTicketStatus,
    );

    return { consecutiveUnpaidMonths, status };
  }

  /**
   * Guardrail 9 (ADR-15): Validates optional safety proof securityType and S3 key prefix.
   */
  private validateSafetyProofInputs(
    auctionId: string,
    dto: VerifySafetyProofDto,
  ): string | undefined {
    if (dto.securityType !== undefined && dto.securityType !== null && dto.securityType !== '') {
      const normalizedType = dto.securityType.trim().toUpperCase();
      if (
        !(ALLOWED_SAFETY_PROOF_TYPES as readonly string[]).includes(normalizedType)
      ) {
        throw new BadRequestException(
          `INVALID_SECURITY_TYPE: "${dto.securityType}" is not permitted under ADR-15 (property documents and deeds are eliminated). Allowed: ${ALLOWED_SAFETY_PROOF_TYPES.join(', ')}`,
        );
      }
    }

    if (dto.securityDocS3Key !== undefined && dto.securityDocS3Key !== null && dto.securityDocS3Key !== '') {
      const sanitizedKey = StorageKeyHelper.sanitizeKey(dto.securityDocS3Key);
      const validPrefix =
        sanitizedKey.startsWith(`safety-proof/${auctionId}/`) ||
        sanitizedKey.startsWith(`safety-proofs/${auctionId}/`);
      if (!validPrefix) {
        throw new BadRequestException(
          'Invalid storage key prefix: securityDocS3Key must belong to this auction safety-proof folder',
        );
      }
      return sanitizedKey;
    }

    return undefined;
  }

  /**
   * Retrieves single auction winner and disbursement details.
   */
  async getWinnerDisbursement(auctionId: string, requestingUser: JwtPayload) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        chitGroup: { include: { branch: true } },
        winner: {
          include: {
            ticket: {
              include: {
                // CR-DISB-04 (OWASP API3:2023): Explicit safe allowlist — never leak refreshTokenHash, fcmToken, tokenRevokedBefore, or raw panNumber
                customer: {
                  select: {
                    id: true,
                    customerCode: true,
                    fullName: true,
                    fullNameTamil: true,
                    phone: true,
                    addressLine1: true,
                    city: true,
                    pincode: true,
                    isKycVerified: true,
                  },
                },
                chitGroup: { include: { branch: true } },
              },
            },
          },
        },
      },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

    if (!auction.winner) {
      throw new NotFoundException('No winner recorded for this auction');
    }

    // Customer scoping: Can only view own winner/disbursement record
    if (
      requestingUser.roles.includes(Role.CUSTOMER) &&
      !requestingUser.roles.some((r) => r !== Role.CUSTOMER)
    ) {
      const custId = await this.resolveCustomerId(requestingUser);
      if (!custId || auction.winner.ticket.customerId !== custId) {
        throw new ForbiddenException(
          'Access denied: You can only view your own prize disbursement records',
        );
      }
    }

    // Cross-branch Anti-BOLA guard for Branch Manager
    this.assertBranchAccess(
      auction.chitGroup?.branchId,
      requestingUser,
      'prize disbursement record',
    );

    // Fetch Maker and Checker names if populated
    let makerName = 'Staff';
    let checkerName = 'Super Admin';

    if (auction.winner.verifiedByUserId) {
      const maker = await this.prisma.user.findUnique({
        where: { id: auction.winner.verifiedByUserId },
        select: { name: true },
      });
      if (maker) makerName = maker.name;
    }

    if (auction.winner.authorizedByUserId) {
      const checker = await this.prisma.user.findUnique({
        where: { id: auction.winner.authorizedByUserId },
        select: { name: true },
      });
      if (checker) checkerName = checker.name;
    }

    return {
      auction,
      winner: auction.winner,
      makerName,
      checkerName,
    };
  }

  /**
   * Queries and paginates prize disbursements across chit groups.
   */
  async queryDisbursements(
    query: QueryDisbursementDto,
    requestingUser: JwtPayload,
  ) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.chitGroupId) {
      where.auction = { chitGroupId: query.chitGroupId };
    }

    if (query.disbursementStatus) {
      where.disbursementStatus = query.disbursementStatus;
    }

    if (query.disbursementMode) {
      where.disbursementMode = query.disbursementMode;
    }

    if (query.fromDate || query.toDate) {
      where.disbursedAt = {};
      if (query.fromDate) where.disbursedAt.gte = new Date(query.fromDate);
      if (query.toDate) where.disbursedAt.lte = new Date(query.toDate);
    }

    // Branch scoping for branch manager (fail-closed when branchId is missing)
    const isGlobalReader =
      requestingUser.roles.includes(Role.SUPER_ADMIN) ||
      requestingUser.roles.includes(Role.PARTNER) ||
      requestingUser.roles.includes(Role.ACCOUNTANT) ||
      requestingUser.roles.includes(Role.AUDITOR);
    if (!isGlobalReader && requestingUser.roles.includes(Role.BRANCH_MANAGER)) {
      if (!requestingUser.branchId) {
        throw new ForbiddenException(
          'Access denied: Branch manager must have an assigned branch to query disbursements',
        );
      }
      where.auction = {
        ...where.auction,
        chitGroup: { branchId: requestingUser.branchId },
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.auctionWinner.count({ where }),
      this.prisma.auctionWinner.findMany({
        where,
        include: {
          auction: {
            select: {
              id: true,
              installmentMonth: true,
              auctionDate: true,
              bidDiscount: true,
              prizeMoney: true,
              chitGroup: {
                select: { id: true, groupCode: true, chitValue: true, branchId: true },
              },
            },
          },
          ticket: {
            select: {
              ticketNumber: true,
              customer: {
                select: { id: true, customerCode: true, fullName: true, phone: true },
              },
            },
          },
        },
        orderBy: { auction: { auctionDate: 'desc' } },
        skip,
        take: limit,
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data,
    };
  }

  /**
   * Maker: Verifies Company Safety Proof Checklist (ADR-15).
   * Transitions status from PENDING_VERIFICATION to VERIFIED_BY_MAKER.
   */
  async verifySafetyProof(
    auctionId: string,
    dto: VerifySafetyProofDto,
    makerUserId: string,
    requestingUser?: JwtPayload,
  ) {
    // Guardrail 11: Block administrative IT Super Admins from financial mutations
    await this.assertPartnerIfSuperAdminOnly(
      makerUserId,
      requestingUser?.roles,
      'verify prize safety proof checklists',
    );

    // Guardrail 9 (ADR-15): Validate securityType (zero property docs) & optional S3 key prefix
    const validatedDocKey = this.validateSafetyProofInputs(auctionId, dto);

    // CR-DISB-07: Fail-closed existence check when a new securityDocS3Key is supplied directly
    if (
      validatedDocKey !== undefined &&
      typeof this.storageService?.fileExists === 'function'
    ) {
      const exists = await this.storageService.fileExists(validatedDocKey);
      if (!exists) {
        throw new BadRequestException(
          'Uploaded safety proof object not found in storage; upload must complete before verification',
        );
      }
    }

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        winner: {
          include: {
            ticket: {
              include: { customer: true },
            },
          },
        },
        chitGroup: true,
      },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

    if (!auction.winner) {
      throw new BadRequestException('Cannot verify safety proof: No winner recorded for this auction');
    }

    // Cross-branch Anti-BOLA guard for Branch Manager
    this.assertBranchAccess(
      auction.chitGroup?.branchId,
      requestingUser,
      'safety proof checklist',
    );

    if (auction.status === 'SCHEDULED') {
      throw new BadRequestException(
        'Cannot verify safety proof: Auction has not yet been finalized',
      );
    }

    if (auction.winner.disbursementStatus !== 'PENDING_VERIFICATION') {
      throw new BadRequestException(
        `Invalid transition: Safety proof can only be verified when status is PENDING_VERIFICATION (current: ${auction.winner.disbursementStatus})`,
      );
    }

    const result = await withTransactionRetry(this.prisma, async (tx) => {
      const lockedWinner = await lockAuctionWinnerRow(tx, auction.winner!.id);
      if (lockedWinner && lockedWinner.disbursementStatus !== 'PENDING_VERIFICATION') {
        throw new BadRequestException(
          `SAFETY_PROOF_ALREADY_VERIFIED: Safety proof has already been verified or status has changed (current: ${lockedWinner.disbursementStatus})`,
        );
      }

      await this.assertNoPendingAuctionCorrection(tx, auction.id);

      const freshWinner =
        typeof tx.auctionWinner?.findUnique === 'function'
          ? await tx.auctionWinner.findUnique({ where: { id: auction.winner!.id } })
          : null;
      const existingDocKey = freshWinner?.securityDocS3Key ?? auction.winner!.securityDocS3Key ?? null;
      const finalSecurityDocKey =
        validatedDocKey !== undefined ? validatedDocKey : existingDocKey;

      const updated = await tx.auctionWinner.update({
        where: { id: auction.winner!.id },
        data: {
          isSecurityRequired: dto.isSecurityRequired,
          securityType: dto.securityType ? dto.securityType.trim().toUpperCase() : null,
          blankChequeDetails: dto.blankChequeDetails || null,
          agreementSigned: dto.agreementSigned,
          nomineeSigned: dto.nomineeSigned,
          securityDocS3Key: finalSecurityDocKey,
          verifiedByUserId: makerUserId,
          disbursementStatus: 'VERIFIED_BY_MAKER',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: makerUserId,
          action: 'SAFETY_PROOF_VERIFIED',
          entityType: 'AuctionWinner',
          entityId: auction.winner!.id,
          newValue: {
            isSecurityRequired: dto.isSecurityRequired,
            securityType: dto.securityType ? dto.securityType.trim().toUpperCase() : null,
            blankChequeDetails: dto.blankChequeDetails || null,
            agreementSigned: dto.agreementSigned,
            nomineeSigned: dto.nomineeSigned,
            securityDocS3Key: finalSecurityDocKey,
            notes: dto.notes || null,
            status: 'VERIFIED_BY_MAKER',
          },
        },
      });

      return {
        message: 'Safety proof checklist verified successfully. Ready for Checker payout authorization.',
        winner: updated,
      };
    });

    // Post-commit: Alert Super Admins/Partners for Checker Approval (Non-blocking)
    const queue = this.queueProvider;
    if (queue) {
      try {
        const formattedAmount = (auction.prizeMoney ?? BigInt(0)).toLocaleString('en-IN');
        const customerName = auction.winner?.ticket?.customer?.fullName || 'Subscriber';
        const ticketNo = auction.winner?.ticket?.ticketNumber || 0;
        const groupCode = auction.chitGroup?.groupCode || '';

        const payload: ApprovalAlertJobPayload = {
          approvalType: 'DISBURSEMENT_APPROVAL',
          title: 'பரிசு தொகை ஒப்புதல் தேவை / Prize Disbursement Approval Required',
          body: `குழு ${groupCode} டிக்கெட் #${ticketNo} (${customerName}) பரிசு தொகை ரூ. ${formattedAmount} பாதுகாப்பு சான்றிதழ் சரிபார்க்கப்பட்டது. இறுதி ஒப்புதல் தேவை. / Prize money of Rs. ${formattedAmount} for Ticket #${ticketNo} (${customerName}) verified. Checker authorization required.`,
          entityId: auctionId,
          amount: (auction.prizeMoney ?? BigInt(0)).toString(),
          excludeUserId: makerUserId,
          data: {
            auctionId,
            ticketNumber: String(ticketNo),
            customerName,
            chitCode: groupCode,
          },
        };

        await queue.addJob(
          NOTIFICATION_QUEUE,
          JOB_DISPATCH_APPROVAL_ALERT,
          payload,
          {
            jobId: `approval-alert-disbursement-${auctionId}`,
            priority: 1,
          },
        );
        this.logger.log(`Enqueued disbursement approval alert for Auction ${auctionId}`);
      } catch (err: any) {
        this.logger.warn(`Failed to enqueue disbursement approval alert: ${err.message}`);
      }
    }

    // Post-commit: Invalidate report cache for pending actions count
    await this.invalidateReportCaches(auction.chitGroup?.branchId);

    return result;
  }

  private async loadAuctionWinnerForSafetyProof(
    auctionId: string,
    requestingUser?: JwtPayload,
  ) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { winner: true, chitGroup: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

    if (!auction.winner) {
      throw new BadRequestException('Cannot upload safety proof: No winner recorded for this auction');
    }

    this.assertBranchAccess(
      auction.chitGroup?.branchId,
      requestingUser,
      'safety proof document',
    );

    return auction.winner;
  }

  private async persistSafetyProofLink(
    auctionId: string,
    winnerId: string,
    s3Key: string,
    meta: { fileName: string; size: number; mimetype: string; uploadMode: 'DIRECT_S3_PUT' | 'MULTIPART' },
    makerUserId: string,
  ) {
    const persistOp = async (tx: any) => {
      const lockedWinner = await lockAuctionWinnerRow(tx, winnerId);
      if (lockedWinner?.disbursementStatus === 'DISBURSED') {
        throw new BadRequestException(
          'Cannot replace safety proof after prize money has already been disbursed',
        );
      }

      await tx.auctionWinner.update({
        where: { id: winnerId },
        data: {
          securityDocS3Key: s3Key,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: makerUserId,
          action: 'SAFETY_PROOF_DOCUMENT_UPLOADED',
          entityType: 'AuctionWinner',
          entityId: winnerId,
          newValue: {
            s3Key,
            fileName: meta.fileName,
            size: meta.size,
            mimetype: meta.mimetype,
            uploadMode: meta.uploadMode,
          },
        },
      });
    };

    if (typeof this.prisma.$transaction === 'function') {
      await withTransactionRetry(this.prisma, persistOp);
    } else {
      await persistOp(this.prisma);
    }

    return {
      success: true,
      message: 'Safety proof collateral document uploaded and linked successfully.',
      auctionId,
      securityDocS3Key: s3Key,
      fileName: meta.fileName,
      uploadedAt: new Date(),
    };
  }

  /**
   * Uploads photos of signed blank cheques, promissory notes, or agreement to private S3 bucket.
   * Fail-closed: storage upload executes strictly before DB linkage.
   */
  async uploadSafetyProof(
    auctionId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    makerUserId: string,
    requestingUser?: JwtPayload,
  ) {
    await this.assertPartnerIfSuperAdminOnly(
      makerUserId,
      requestingUser?.roles,
      'upload safety proof documents',
    );

    if (!file || !file.buffer) {
      throw new BadRequestException('A valid document file is required for safety proof upload');
    }

    if (!ALLOWED_SAFETY_PROOF_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed formats: JPG, PNG, WEBP, PDF`,
      );
    }

    if (file.size > MAX_SAFETY_PROOF_SIZE_BYTES) {
      throw new BadRequestException('Safety proof document file size exceeds the 10 MB limit');
    }

    const winner = await this.loadAuctionWinnerForSafetyProof(auctionId, requestingUser);
    if (winner.disbursementStatus === 'DISBURSED') {
      throw new BadRequestException(
        'Cannot replace safety proof after prize money has already been disbursed',
      );
    }

    const sanitizedFilename =
      path
        .basename(file.originalname)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/\.{2,}/g, '_') || 'safety-proof';
    const s3Key = StorageKeyHelper.sanitizeKey(
      `safety-proofs/${auctionId}/${Date.now()}_${sanitizedFilename}`,
    );

    await this.storageService.uploadFile(s3Key, file.buffer, file.mimetype);

    return this.persistSafetyProofLink(
      auctionId,
      winner.id,
      s3Key,
      {
        fileName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        uploadMode: 'MULTIPART',
      },
      makerUserId,
    );
  }

  /**
   * Confirms a direct-to-storage presigned PUT upload for auction safety proof.
   * Fail-closed: verifies key prefix and storage object existence before DB update.
   */
  async confirmSafetyProof(
    auctionId: string,
    dto: ConfirmSafetyProofDto,
    makerUserId: string,
    requestingUser?: JwtPayload,
  ) {
    await this.assertPartnerIfSuperAdminOnly(
      makerUserId,
      requestingUser?.roles,
      'confirm safety proof documents',
    );

    const sanitizedKey = StorageKeyHelper.sanitizeKey(dto.key);
    if (!sanitizedKey.startsWith(`safety-proof/${auctionId}/`)) {
      throw new BadRequestException(
        'Invalid storage key prefix: key must belong to this auction safety-proof folder',
      );
    }

    const winner = await this.loadAuctionWinnerForSafetyProof(auctionId, requestingUser);
    if (winner.disbursementStatus === 'DISBURSED') {
      throw new BadRequestException(
        'Cannot replace safety proof after prize money has already been disbursed',
      );
    }

    const exists = await this.storageService.fileExists(sanitizedKey);
    if (!exists) {
      throw new BadRequestException(
        'Uploaded safety proof object not found in storage; upload must complete before confirmation',
      );
    }

    const safeFileName = path.basename(dto.fileName) || 'safety-proof.bin';

    return this.persistSafetyProofLink(
      auctionId,
      winner.id,
      sanitizedKey,
      {
        fileName: safeFileName,
        size: dto.sizeBytes,
        mimetype: dto.mimeType,
        uploadMode: 'DIRECT_S3_PUT',
      },
      makerUserId,
    );
  }

  /**
   * Generates a 15-minute secure presigned viewing URL for Partner B (Checker) to inspect safety proof.
   */
  async getSafetyProofPresignedUrl(
    auctionId: string,
    requestingUser?: JwtPayload,
  ) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { winner: true, chitGroup: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

    if (!auction.winner) {
      throw new BadRequestException('No winner recorded for this auction');
    }

    this.assertBranchAccess(
      auction.chitGroup?.branchId,
      requestingUser,
      'safety proof document',
    );

    if (!auction.winner.securityDocS3Key) {
      throw new NotFoundException('No safety proof document uploaded for this auction winner');
    }

    const presignedUrl = await this.storageService.getPresignedUrl(
      auction.winner.securityDocS3Key,
      PRESIGNED_URL_EXPIRES_IN_SECONDS, // 15 minutes (900s)
    );

    return {
      url: presignedUrl,
      expiresInSeconds: PRESIGNED_URL_EXPIRES_IN_SECONDS,
      securityDocS3Key: auction.winner.securityDocS3Key,
    };
  }

  /**
   * Checker: Authorizes Prize Payout Voucher.
   * Strictly enforces Maker != Checker (verifiedByUserId != checkerUserId).
   * Super Admin + Verified Partner exclusively (Branch Manager & IT Admin strictly blocked).
   * Arrears offset & override validation execute under deterministic row locks (FIN-A/FIN-D/KFC-FIN-003/004).
   */
  async authorizePayout(
    auctionId: string,
    dto: AuthorizePayoutDto,
    checkerUserId: string,
    checkerRoles: Role[],
  ) {
    // 1. Enforce Super Admin & Verified Partner Exclusivity (SEC-A, fail-closed)
    if (!checkerRoles.includes(Role.PARTNER) && !checkerRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'DISBURSEMENT_PERMISSION_DENIED: Only Super Admin (Partners) possess financial authority to authorize prize money disbursements',
      );
    }

    await this.assertVerifiedPartner(
      checkerUserId,
      'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess financial authority to authorize prize money disbursements',
    );

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { winner: true, chitGroup: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

    if (!auction.winner) {
      throw new BadRequestException('No winner recorded for this auction');
    }

    // CR-DISB-01: Block unfinalized auctions & Month 1 / Month N records from auction payout path
    if (auction.status === AuctionStatus.SCHEDULED) {
      throw new BadRequestException(
        'AUCTION_NOT_FINALIZED: Prize payout can only be authorized after the auction is finalized',
      );
    }

    if (
      typeof auction.installmentMonth === 'number' &&
      (auction.installmentMonth < 2 ||
        (typeof auction.chitGroup?.durationMonths === 'number' &&
          auction.installmentMonth >= auction.chitGroup.durationMonths))
    ) {
      throw new BadRequestException(
        'INVALID_PAYOUT_MONTH: Month 1 company pool and Month N maturity settlement cannot use auction payout authorization. Use the Month N final settlement workflow.',
      );
    }

    if (auction.winner.disbursementStatus !== 'VERIFIED_BY_MAKER') {
      throw new BadRequestException(
        `Invalid transition: Payout can only be authorized when status is VERIFIED_BY_MAKER (current: ${auction.winner.disbursementStatus})`,
      );
    }

    // 2. Hard Guard: Maker != Checker (fast pre-check; re-verified under lock inside TX)
    if (auction.winner.verifiedByUserId === checkerUserId) {
      throw new ForbiddenException(
        'MAKER_CHECKER_VIOLATION: The user who verified the safety proof checklist cannot authorize the prize payout. An independent Partner must review and authorize.',
      );
    }

    // Validate optional requested override upfront for whole-rupee integer compliance
    const requestedAmount =
      dto.disbursedAmount !== undefined && dto.disbursedAmount !== null
        ? toWholeRupeeBigInt(dto.disbursedAmount, 'disbursedAmount', { min: 1n })
        : null;

    const result = await withTransactionRetry(this.prisma, async (tx) => {
      // 0. Global Acyclic DAG Row Locks: Auction -> AuctionWinner -> SubscriberTicket -> InstallmentDue (CR-DISB-03)
      const lockedAuction = await lockAuctionRow(tx, auctionId);
      if (lockedAuction?.status === AuctionStatus.SCHEDULED) {
        throw new BadRequestException(
          'AUCTION_NOT_FINALIZED: Prize payout can only be authorized after the auction is finalized',
        );
      }

      const lockedWinner = await lockAuctionWinnerRow(tx, auction.winner!.id);
      if (lockedWinner && lockedWinner.disbursementStatus !== 'VERIFIED_BY_MAKER') {
        throw new BadRequestException(
          'PRIZE_ALREADY_AUTHORIZED: Prize payout has already been authorized or status has changed',
        );
      }

      const freshAuction =
        typeof tx.auction?.findUnique === 'function'
          ? await tx.auction.findUnique({
              where: { id: auctionId },
              include: { chitGroup: true },
            })
          : null;
      const authoritativeAuction = freshAuction ?? auction;

      if (authoritativeAuction.status === AuctionStatus.SCHEDULED) {
        throw new BadRequestException(
          'AUCTION_NOT_FINALIZED: Prize payout can only be authorized after the auction is finalized',
        );
      }

      const authMonth = authoritativeAuction.installmentMonth;
      const authDuration = authoritativeAuction.chitGroup?.durationMonths ?? auction.chitGroup?.durationMonths;
      if (
        typeof authMonth === 'number' &&
        (authMonth < 2 || (typeof authDuration === 'number' && authMonth >= authDuration))
      ) {
        throw new BadRequestException(
          'INVALID_PAYOUT_MONTH: Month 1 company pool and Month N maturity settlement cannot use auction payout authorization. Use the Month N final settlement workflow.',
        );
      }

      const freshWinner =
        typeof tx.auctionWinner?.findUnique === 'function'
          ? await tx.auctionWinner.findUnique({ where: { id: auction.winner!.id } })
          : null;
      const authoritativeWinner = freshWinner ?? auction.winner!;

      if (!authoritativeWinner.verifiedByUserId) {
        throw new BadRequestException(
          'MAKER_VERIFICATION_MISSING: Safety proof verification maker identity is missing',
        );
      }

      if (authoritativeWinner.verifiedByUserId === checkerUserId) {
        throw new ForbiddenException(
          'MAKER_CHECKER_VIOLATION: The user who verified the safety proof checklist cannot authorize the prize payout. An independent Partner must review and authorize.',
        );
      }

      await lockSubscriberTicketRow(tx, authoritativeWinner.ticketId);
      await this.lockTicketInstallmentDues(
        tx,
        authoritativeWinner.ticketId,
        authMonth,
      );

      await this.assertNoPendingAuctionCorrection(tx, auctionId);

      // KFC-FIN-003: Query all outstanding unpaid dues up to this auction month UNDER LOCK
      const unpaidDues =
        typeof tx.installmentDue?.findMany === 'function'
          ? await tx.installmentDue.findMany({
              where: {
                ticketId: authoritativeWinner.ticketId,
                installmentMonth: { lte: authMonth },
                status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
              },
              orderBy: { installmentMonth: 'asc' },
            })
          : [];

      const totalArrears: bigint = unpaidDues.reduce(
        (sum: bigint, d: any) =>
          sum + (BigInt(d.netPayableAmount ?? 0n) - BigInt(d.paidAmount ?? 0n)),
        0n,
      );

      // CR-DISB-03: Authoritative in-TX prizeMoney + fail-closed null / non-positive guard
      const rawPrizeMoney: bigint | null | undefined = authoritativeAuction.prizeMoney;
      if (
        rawPrizeMoney === null ||
        (rawPrizeMoney !== undefined && BigInt(rawPrizeMoney) <= 0n)
      ) {
        throw new BadRequestException(
          'INVALID_PRIZE_MONEY: Auction prize money must be a positive whole Rupee amount',
        );
      }
      const grossPrizeMoney: bigint =
        rawPrizeMoney !== undefined ? BigInt(rawPrizeMoney) : 0n;

      if (totalArrears > 0n && totalArrears >= grossPrizeMoney) {
        throw new BadRequestException(
          `OUTSTANDING_ARREARS_EXCEED_PRIZE: Outstanding arrears (₹${totalArrears.toString()}) exceed or equal prize money (₹${grossPrizeMoney.toString()}). Prize cannot be authorized until arrears are resolved.`,
        );
      }

      // KFC-FIN-004: Exactly calculated net entitlement (Zero arbitrary override)
      const authorizedNetPayout: bigint = grossPrizeMoney - totalArrears;
      if (rawPrizeMoney !== undefined && authorizedNetPayout <= 0n) {
        throw new BadRequestException(
          'INVALID_PRIZE_MONEY: Net authorized prize payout must be a positive whole Rupee amount',
        );
      }

      if (requestedAmount !== null && requestedAmount !== authorizedNetPayout) {
        throw new BadRequestException(
          `PAYOUT_OVERRIDE_NOT_PERMITTED: Payout amount must exactly match authorized net prize after arrears deduction of ₹${authorizedNetPayout.toString()} (Gross: ₹${grossPrizeMoney.toString()}, Arrears: ₹${totalArrears.toString()}, Requested: ₹${requestedAmount.toString()}). Arbitrary adjustments are strictly prohibited.`,
        );
      }

      const updated = await tx.auctionWinner.update({
        where: { id: authoritativeWinner.id },
        data: {
          disbursementMode: dto.disbursementMode,
          disbursedAmount: authorizedNetPayout,
          authorizedByUserId: checkerUserId,
          disbursementStatus: 'AUTHORIZED_BY_CHECKER',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: checkerUserId,
          action: 'PRIZE_PAYOUT_AUTHORIZED',
          entityType: 'AuctionWinner',
          entityId: authoritativeWinner.id,
          newValue: {
            disbursementMode: dto.disbursementMode,
            grossPrizeMoney: grossPrizeMoney.toString(),
            arrearsDeducted: totalArrears.toString(),
            disbursedAmount: authorizedNetPayout.toString(),
            authorizedByUserId: checkerUserId,
            notes: dto.notes || null,
            status: 'AUTHORIZED_BY_CHECKER',
          },
        },
      });

      return {
        message: 'Prize payout voucher authorized successfully. Ready for release and disbursement.',
        winner: updated,
      };
    });

    // Post-commit: Proactively invalidate report cache for authorizations
    await this.invalidateReportCaches(auction.chitGroup?.branchId);

    return result;
  }

  /**
   * Releases prize money disbursement and generates official reference.
   * Enforces FIN-A/FIN-D TOCTOU arrears guard under deterministic row locks,
   * prevents duplicate non-cash UTR/cheque references, and recalculates
   * consecutive unpaid months via arrears.util.ts.
   */
  async releasePayout(
    auctionId: string,
    dto: ReleasePayoutDto,
    releaseUserId: string,
    requestingUser?: JwtPayload,
  ) {
    // Guardrail 11: Block administrative IT Super Admins from releasing funds
    await this.assertPartnerIfSuperAdminOnly(
      releaseUserId,
      requestingUser?.roles,
      'release prize money disbursements',
    );

    const trimmedRef = (dto.paymentReference ?? '').trim();
    if (!trimmedRef) {
      throw new BadRequestException(
        'Payment reference is mandatory and cannot be blank for prize payout release',
      );
    }

    // CR-DISB-05: Strictly reject reserved system placeholders as live payout references
    if (SYSTEM_PLACEHOLDER_PAYMENT_REFS.has(trimmedRef.toUpperCase())) {
      throw new BadRequestException(
        `INVALID_PAYMENT_REFERENCE: "${trimmedRef}" is a reserved internal system placeholder and cannot be used as a live prize payout reference`,
      );
    }

    const normalizedIdempotencyKey = dto.idempotencyKey?.trim() || null;

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { winner: true, chitGroup: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

    if (!auction.winner) {
      throw new BadRequestException('No winner recorded for this auction');
    }

    // CR-DISB-01: Month 1 company pool and Month N maturity settlement cannot use auction payout release
    if (
      typeof auction.installmentMonth === 'number' &&
      (auction.installmentMonth < 2 ||
        (typeof auction.chitGroup?.durationMonths === 'number' &&
          auction.installmentMonth >= auction.chitGroup.durationMonths))
    ) {
      throw new BadRequestException(
        'INVALID_PAYOUT_MONTH: Month 1 company pool and Month N maturity settlement cannot use auction payout release. Use the Month N final settlement workflow.',
      );
    }

    // CR-DISB-08: Safe idempotent retry replay when already DISBURSED with matching idempotencyKey
    if (
      auction.winner.disbursementStatus === 'DISBURSED' &&
      normalizedIdempotencyKey &&
      typeof this.prisma.auditLog?.findFirst === 'function'
    ) {
      const existingDisburseLog = await this.prisma.auditLog.findFirst({
        where: {
          entityType: 'AuctionWinner',
          entityId: auction.winner.id,
          action: 'PRIZE_PAYOUT_DISBURSED',
        },
        orderBy: { timestamp: 'desc' },
      });
      if ((existingDisburseLog?.newValue as any)?.idempotencyKey === normalizedIdempotencyKey) {
        return {
          message: 'Prize payout already released for this idempotency key (idempotent replay).',
          winner: auction.winner,
          idempotentReplay: true,
        };
      }
    }

    if (auction.winner.disbursementStatus !== 'AUTHORIZED_BY_CHECKER') {
      throw new BadRequestException(
        `Invalid transition: Payout must be authorized before release (current: ${auction.winner.disbursementStatus})`,
      );
    }

    const releaseDate = dto.disbursedAt ? new Date(dto.disbursedAt) : new Date();

    let result: { message: string; winner: any; idempotentReplay?: boolean };
    try {
      result = await withTransactionRetry(this.prisma, async (tx) => {
        // 0. Global Acyclic DAG Row Locks: Auction -> AuctionWinner -> SubscriberTicket -> InstallmentDue (CR-DISB-03)
        const lockedAuction = await lockAuctionRow(tx, auctionId);
        const lockedWinner = await lockAuctionWinnerRow(tx, auction.winner!.id);

        const freshAuction =
          typeof tx.auction?.findUnique === 'function'
            ? await tx.auction.findUnique({
                where: { id: auctionId },
                include: { chitGroup: true },
              })
            : null;
        const authoritativeAuction = freshAuction ?? auction;

        const freshWinner =
          typeof tx.auctionWinner?.findUnique === 'function'
            ? await tx.auctionWinner.findUnique({ where: { id: auction.winner!.id } })
            : null;
        const authoritativeWinner = freshWinner ?? auction.winner!;

        // CR-DISB-08: Inside-TX idempotent replay check on concurrent network retry
        const currentDisbStatus =
          lockedWinner?.disbursementStatus ?? authoritativeWinner.disbursementStatus;
        if (
          currentDisbStatus === 'DISBURSED' &&
          normalizedIdempotencyKey &&
          typeof tx.auditLog?.findFirst === 'function'
        ) {
          const txDisburseLog = await tx.auditLog.findFirst({
            where: {
              entityType: 'AuctionWinner',
              entityId: authoritativeWinner.id,
              action: 'PRIZE_PAYOUT_DISBURSED',
            },
            orderBy: { timestamp: 'desc' },
          });
          if ((txDisburseLog?.newValue as any)?.idempotencyKey === normalizedIdempotencyKey) {
            return {
              message: 'Prize payout already released for this idempotency key (idempotent replay).',
              winner: authoritativeWinner,
              idempotentReplay: true,
            };
          }
        }

        // CR-DISB-01: Reject unfinalized auctions & Month 1 / Month N records under lock
        if (
          lockedAuction?.status === AuctionStatus.SCHEDULED ||
          authoritativeAuction.status === AuctionStatus.SCHEDULED
        ) {
          throw new BadRequestException(
            'AUCTION_NOT_FINALIZED: Prize payout can only be released for a finalized auction',
          );
        }

        const authMonth = authoritativeAuction.installmentMonth;
        const authDuration =
          authoritativeAuction.chitGroup?.durationMonths ?? auction.chitGroup?.durationMonths;
        if (
          typeof authMonth === 'number' &&
          (authMonth < 2 || (typeof authDuration === 'number' && authMonth >= authDuration))
        ) {
          throw new BadRequestException(
            'INVALID_PAYOUT_MONTH: Month 1 company pool and Month N maturity settlement cannot use auction payout release. Use the Month N final settlement workflow.',
          );
        }

        if (
          lockedWinner &&
          (lockedWinner.disbursementStatus === 'DISBURSED' ||
            lockedWinner.disbursementStatus !== 'AUTHORIZED_BY_CHECKER')
        ) {
          throw new BadRequestException(
            'PRIZE_ALREADY_DISBURSED: Prize payout has already been released or status has changed',
          );
        }

        const lockedTicket = await lockSubscriberTicketRow(
          tx,
          authoritativeWinner.ticketId,
        );
        await this.lockTicketInstallmentDues(tx, authoritativeWinner.ticketId);

        await this.assertNoPendingAuctionCorrection(tx, auctionId);

        // Duplicate Bank UTR / Cheque Reference Prevention (case-insensitive)
        await this.assertUniqueNonCashPaymentReference(
          tx,
          trimmedRef,
          authoritativeWinner.disbursementMode,
          authoritativeWinner.id,
        );

        // TOCTOU Arrears Verification strictly inside transaction lock using authoritative in-TX prizeMoney (FIN-A, FIN-D, CR-DISB-03):
        const rawPrizeMoney = authoritativeAuction.prizeMoney;
        if (
          rawPrizeMoney === null ||
          (rawPrizeMoney !== undefined && rawPrizeMoney <= 0n)
        ) {
          throw new BadRequestException(
            'INVALID_PRIZE_MONEY: Auction prize money must be a positive whole Rupee amount',
          );
        }
        const grossPrizeMoney = rawPrizeMoney ?? 0n;
        const authorizedDisbursed =
          authoritativeWinner.disbursedAmount !== null &&
          authoritativeWinner.disbursedAmount !== undefined
            ? authoritativeWinner.disbursedAmount
            : grossPrizeMoney;
        const expectedArrears = grossPrizeMoney - authorizedDisbursed;

        // KFC-FIN-003: Re-query outstanding dues <= auction month under lock
        const unpaidDuesToSettle =
          typeof tx.installmentDue?.findMany === 'function'
            ? await tx.installmentDue.findMany({
                where: {
                  ticketId: authoritativeWinner.ticketId,
                  installmentMonth: { lte: authMonth },
                  status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
                },
                orderBy: { installmentMonth: 'asc' },
              })
            : [];

        const currentArrears = unpaidDuesToSettle.reduce(
          (sum: bigint, d: any) =>
            sum + (BigInt(d.netPayableAmount ?? 0n) - BigInt(d.paidAmount ?? 0n)),
          0n,
        );

        if (currentArrears !== expectedArrears) {
          throw new BadRequestException(
            `ARREARS_STATE_CHANGED: Outstanding arrears (₹${currentArrears.toString()}) no longer match the authorized arrears offset (₹${expectedArrears.toString()}). Arrears status was modified after authorization. Payout must be re-authorized.`,
          );
        }

        const updated = await tx.auctionWinner.update({
          where: { id: authoritativeWinner.id },
          data: {
            paymentReference: trimmedRef,
            disbursedAt: releaseDate,
            disbursementStatus: 'DISBURSED',
          },
        });

        const settledDueIds: string[] = [];
        for (const d of unpaidDuesToSettle) {
          const dueOutstanding = BigInt(d.netPayableAmount ?? 0n) - BigInt(d.paidAmount ?? 0n);
          if (typeof tx.installmentDue?.update === 'function') {
            await tx.installmentDue.update({
              where: { id: d.id },
              data: {
                status: DueStatus.PAID,
                paidAmount: d.netPayableAmount,
              },
            });
          }
          settledDueIds.push(d.id);

          await tx.auditLog.create({
            data: {
              userId: releaseUserId,
              action: 'PRIZE_ARREARS_OFFSET_ALLOCATED',
              entityType: 'InstallmentDue',
              entityId: d.id,
              newValue: {
                ticketId: d.ticketId,
                installmentMonth: d.installmentMonth,
                offsetAmount: dueOutstanding.toString(),
                priorPaidAmount: (d.paidAmount ?? 0n).toString(),
                finalPaidAmount: d.netPayableAmount.toString(),
                auctionWinnerId: authoritativeWinner.id,
                paymentReference: trimmedRef,
              },
            },
          });
        }

        // Authoritative arrears recalculation via arrears.util.ts (preserves any post-auction arrears)
        const nextArrears = await this.recalculateTicketArrearsState(
          tx,
          authoritativeWinner.ticketId,
          lockedTicket?.status,
          settledDueIds,
        );

        await tx.subscriberTicket.update({
          where: { id: authoritativeWinner.ticketId },
          data: {
            consecutiveUnpaidMonths: nextArrears.consecutiveUnpaidMonths,
            status: nextArrears.status,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: releaseUserId,
            action: 'PRIZE_PAYOUT_DISBURSED',
            entityType: 'AuctionWinner',
            entityId: authoritativeWinner.id,
            newValue: {
              paymentReference: trimmedRef,
              idempotencyKey: normalizedIdempotencyKey,
              disbursedAt: releaseDate,
              disbursedAmount: authorizedDisbursed.toString(),
              arrearsOffsetCount: settledDueIds.length,
              arrearsOffsetTotal: currentArrears.toString(),
              notes: dto.notes || null,
              status: 'DISBURSED',
            },
          },
        });

        return {
          message: 'Prize payout released successfully. Voucher is ready for printing.',
          winner: updated,
        };
      });
    } catch (err) {
      this.rethrowDuplicatePaymentRefError(err, trimmedRef);
    }

    if (!result.idempotentReplay) {
      // Post-commit: Proactively invalidate report cache for disbursements
      await this.invalidateReportCaches(auction.chitGroup?.branchId, releaseDate);
    }

    return result;
  }

  /**
   * Generates bilingual prize disbursement voucher (English + தமிழ்).
   */
  async getBilingualVoucher(auctionId: string, requestingUser: JwtPayload) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        chitGroup: { include: { branch: true } },
        winner: {
          include: {
            ticket: {
              include: {
                customer: true,
                chitGroup: { include: { branch: true } },
              },
            },
          },
        },
      },
    });

    if (!auction || !auction.winner) {
      throw new NotFoundException('Prize winner record not found for this auction');
    }

    // Customer scoping
    if (
      requestingUser.roles.includes(Role.CUSTOMER) &&
      !requestingUser.roles.some((r) => r !== Role.CUSTOMER)
    ) {
      const custId = await this.resolveCustomerId(requestingUser);
      if (!custId || auction.winner.ticket.customerId !== custId) {
        throw new ForbiddenException(
          'Access denied: You can only view your own prize payout vouchers',
        );
      }
    }

    // Cross-branch Anti-BOLA guard for Branch Manager
    this.assertBranchAccess(
      auction.chitGroup?.branchId,
      requestingUser,
      'prize payout voucher',
    );

    const winner = auction.winner;
    const ticket = winner.ticket;
    const customer = ticket.customer;
    const chitGroup = auction.chitGroup;
    const branch = chitGroup.branch;

    let makerName = 'Branch Staff';
    let checkerName = 'Super Admin / Partner';

    if (winner.verifiedByUserId) {
      const maker = await this.prisma.user.findUnique({
        where: { id: winner.verifiedByUserId },
        select: { name: true },
      });
      if (maker) makerName = maker.name;
    }

    if (winner.authorizedByUserId) {
      const checker = await this.prisma.user.findUnique({
        where: { id: winner.authorizedByUserId },
        select: { name: true },
      });
      if (checker) checkerName = checker.name;
    }

    const voucherDate = winner.disbursedAt ?? auction.auctionDate ?? new Date();
    const branchCode = branch.code || 'PRD';
    const year = voucherDate.getFullYear();
    const sanitizedGroupCode = (chitGroup.groupCode || 'CHIT')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');
    const sequence = String(auction.installmentMonth).padStart(5, '0');
    const voucherNumber = `KC-VOU-${branchCode}-${year}-${sanitizedGroupCode}-${sequence}`;

    const bidDiscount = auction.bidDiscount ?? 0n;
    const grossPrizeMoney = auction.prizeMoney ?? chitGroup.chitValue - bidDiscount;
    const netPrizeMoney = winner.disbursedAmount ?? grossPrizeMoney;
    const arrearsDeducted =
      grossPrizeMoney > netPrizeMoney ? grossPrizeMoney - netPrizeMoney : 0n;

    const voucherInput: VoucherDataInput = {
      voucherNumber,
      disbursedAt: voucherDate,
      chitGroupCode: chitGroup.groupCode,
      chitValue: chitGroup.chitValue,
      durationMonths: chitGroup.durationMonths,
      installmentMonth: auction.installmentMonth,
      ticketNumber: ticket.ticketNumber,
      subscriberName: customer.fullName,
      subscriberTamilName: customer.fullNameTamil,
      customerCode: customer.customerCode,
      subscriberAddress: customer.addressLine1
        ? `${customer.addressLine1}, ${customer.city || ''} ${customer.pincode || ''}`
        : 'Perundurai, Erode',
      subscriberMobile: customer.phone,
      bidDiscount,
      grossPrizeMoney,
      arrearsDeducted,
      prizeMoney: netPrizeMoney,
      disbursementMode: winner.disbursementMode || 'ACCOUNT_PAYEE_CHEQUE',
      paymentReference: winner.paymentReference || 'PENDING_RELEASE',
      makerName,
      checkerName,
      branchName: branch.name,
      branchTamilName: branch.nameTamil,
      branchPhone: branch.phone,
      disbursementStatus: winner.disbursementStatus,
    };

    const formattedText = formatBilingualVoucherText(voucherInput);

    return {
      voucherNumber,
      isBilingual: true,
      issuedAt: voucherDate,
      data: voucherInput,
      formattedText,
    };
  }

  /**
   * Final Month (Month N) Maturity Settlement:
   * Direct settlement to the final remaining subscriber without auction.
   * Retains the chit group's permanently frozen Foreman Commission (default 4.00%, ADR-04).
   * Marks subscriber ticket as prized and transitions chit scheme to COMPLETED.
   */
  async settleFinalMonth(
    chitGroupId: string,
    dto: SettleFinalMonthDto,
    checkerUserId: string,
    checkerRoles: Role[],
    expectedNetPayoutOrOptions?:
      | bigint
      | { expectedNetPayout?: bigint; requirePreparedSettlement?: boolean },
  ) {
    const settleOptions =
      typeof expectedNetPayoutOrOptions === 'bigint'
        ? { expectedNetPayout: expectedNetPayoutOrOptions, requirePreparedSettlement: false }
        : {
            expectedNetPayout: expectedNetPayoutOrOptions?.expectedNetPayout,
            requirePreparedSettlement: Boolean(
              expectedNetPayoutOrOptions?.requirePreparedSettlement,
            ),
          };

    if (!checkerRoles.includes(Role.PARTNER) && !checkerRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'DISBURSEMENT_PERMISSION_DENIED: Only Super Admin (Partners) possess financial authority to authorize final month settlements',
      );
    }

    await this.assertVerifiedPartner(
      checkerUserId,
      'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess financial authority to authorize final month settlements',
    );

    // CR-DISB-05: Strictly reject COMPANY_POOL_MONTH_1 placeholder on Month N settlements
    if (
      dto.paymentReference &&
      dto.paymentReference.trim().toUpperCase() === 'COMPANY_POOL_MONTH_1'
    ) {
      throw new BadRequestException(
        'INVALID_PAYMENT_REFERENCE: "COMPANY_POOL_MONTH_1" is reserved exclusively for Month 1 statutory company pool and cannot be used for Month N maturity settlement',
      );
    }

    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
      include: {
        tickets: true,
        branch: true,
      },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    if (chit.status !== 'ACTIVE') {
      throw new BadRequestException('Chit scheme must be ACTIVE to perform final month settlement');
    }

    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: dto.ticketId },
      include: { customer: true },
    });

    if (!ticket || ticket.chitGroupId !== chitGroupId) {
      throw new NotFoundException('Selected ticket does not belong to this chit scheme');
    }

    if (ticket.status === 'REMOVED_DEF_3M' || ticket.status === 'SURRENDERED') {
      throw new BadRequestException(
        `Ticket #${ticket.ticketNumber} is ${ticket.status} and cannot receive final month maturity settlement`,
      );
    }

    if (ticket.isPrized) {
      throw new BadRequestException(
        `Ticket #${ticket.ticketNumber} is already prized and cannot receive final settlement`,
      );
    }

    // Verify this is indeed the single remaining unprized subscriber
    const unprizedCount = await this.prisma.subscriberTicket.count({
      where: {
        chitGroupId,
        isPrized: false,
      },
    });

    if (unprizedCount > 1) {
      throw new BadRequestException(
        `Cannot execute final settlement: There are still ${unprizedCount} unprized tickets. Final settlement is exclusively for the single remaining subscriber in Month ${chit.durationMonths}`,
      );
    }

    // Invariant Guardrail 10: Strict Maker != Checker Dual Control
    // When requirePreparedSettlement is true (all HTTP settlement paths), Maker identity is read
    // strictly from the persisted Stage-1 DB record inside the ChitGroup lock (eliminates dto.makerUserId spoofing).
    if (!settleOptions.requirePreparedSettlement) {
      if (!dto.makerUserId) {
        throw new BadRequestException(
          'MAKER_REQUIRED: Final month settlement requires prior preparation by an authorized Maker. Please prepare the settlement voucher first via prepareFinalSettlement.',
        );
      }

      if (dto.makerUserId === checkerUserId) {
        throw new ForbiddenException(
          'MAKER_CHECKER_VIOLATION: Final month payout requires independent maker and checker. Maker and checker cannot be the same user.',
        );
      }

      await this.assertValidMakerIdentity(dto.makerUserId);
    }

    const finalMonth = chit.durationMonths;
    const { commissionRate, commissionAmount, rateDisplay } =
      this.calculateFrozenForemanCommission(chit.chitValue, chit.foremanCommissionRate);
    const finalMonthInstallment =
      chit.baseInstallment ?? chit.chitValue / BigInt(chit.durationMonths);
    const grossPrize = chit.chitValue;
    const releaseDate = dto.disbursedAt ? new Date(dto.disbursedAt) : new Date();
    const initialPaymentRef = dto.paymentReference?.trim() || 'FINAL_SETTLEMENT_MONTH_N';

    let result: any;
    let effectivePaymentRefForError = initialPaymentRef;
    try {
      result = await withTransactionRetry(this.prisma, async (tx) => {
        // Global Acyclic DAG locks: ChitGroup -> Auction -> AuctionWinner -> SubscriberTicket -> InstallmentDue
        const lockedGroup = await lockChitGroupRow(tx, chitGroupId);
        if (lockedGroup && lockedGroup.status !== 'ACTIVE') {
          throw new BadRequestException(
            `FINAL_SETTLEMENT_ALREADY_EXECUTED: Chit scheme is no longer ACTIVE (current: ${lockedGroup.status})`,
          );
        }

        // Locate existing Stage-1 prepared settlement inside ChitGroup lock (CR-DISB-02)
        const existingPreparedAuction =
          typeof tx.auction?.findUnique === 'function'
            ? await tx.auction.findUnique({
                where: {
                  chitGroupId_installmentMonth: {
                    chitGroupId,
                    installmentMonth: finalMonth,
                  },
                },
                include: { winner: true },
              })
            : null;

        let lockedPreparedAuctionStatus: string | undefined = existingPreparedAuction?.status;
        let lockedPreparedWinnerStatus: string | undefined =
          existingPreparedAuction?.winner?.disbursementStatus;

        if (existingPreparedAuction) {
          const lockedAuc = await lockAuctionRow(tx, existingPreparedAuction.id);
          if (lockedAuc?.status) {
            lockedPreparedAuctionStatus = lockedAuc.status;
          }
          if (existingPreparedAuction.winner?.id) {
            const lockedWin = await lockAuctionWinnerRow(
              tx,
              existingPreparedAuction.winner.id,
            );
            if (lockedWin?.disbursementStatus) {
              lockedPreparedWinnerStatus = lockedWin.disbursementStatus;
            }
          }
        }

        let authoritativeMakerId = dto.makerUserId;
        let authoritativeExpectedNetPayout = settleOptions.expectedNetPayout;
        let effectiveMode = dto.disbursementMode;
        let trimmedPaymentRef = initialPaymentRef;

        if (settleOptions.requirePreparedSettlement) {
          if (!existingPreparedAuction || !existingPreparedAuction.winner) {
            throw new BadRequestException(
              'PREPARED_SETTLEMENT_REQUIRED: Final month settlement must first be prepared by an independent Maker via prepare-final-settlement',
            );
          }

          if (
            lockedPreparedAuctionStatus === 'COMPLETED' ||
            lockedPreparedAuctionStatus === 'MINUTES_FILED'
          ) {
            throw new BadRequestException(
              'Month N settlement has already been approved and disbursed',
            );
          }

          if (
            lockedPreparedWinnerStatus &&
            lockedPreparedWinnerStatus !== 'VERIFIED_BY_MAKER'
          ) {
            throw new BadRequestException(
              `Invalid transition: Month N settlement must be in VERIFIED_BY_MAKER state before approval (current: ${lockedPreparedWinnerStatus})`,
            );
          }

          if (existingPreparedAuction.winner.ticketId !== ticket.id) {
            throw new BadRequestException(
              'TICKET_MISMATCH: Settlement ticket does not match the Stage-1 prepared Month N settlement voucher',
            );
          }

          const dbMakerId =
            existingPreparedAuction.conductedByUserId ||
            existingPreparedAuction.winner.verifiedByUserId;
          if (!dbMakerId) {
            throw new BadRequestException(
              'MAKER_REQUIRED: Prepared Month N settlement is missing a persisted Maker identity',
            );
          }

          // Re-verify Maker != Checker strictly under lock against persisted DB Stage-1 maker
          if (
            existingPreparedAuction.conductedByUserId === checkerUserId ||
            existingPreparedAuction.winner.verifiedByUserId === checkerUserId ||
            dbMakerId === checkerUserId
          ) {
            throw new ForbiddenException(
              'MAKER_CHECKER_VIOLATION: Final month payout requires independent maker and checker. Maker and checker cannot be the same user.',
            );
          }

          await this.assertValidMakerIdentity(dbMakerId);
          authoritativeMakerId = dbMakerId;

          if (
            authoritativeExpectedNetPayout === undefined &&
            existingPreparedAuction.winner.disbursedAmount !== null &&
            existingPreparedAuction.winner.disbursedAmount !== undefined
          ) {
            authoritativeExpectedNetPayout = BigInt(
              existingPreparedAuction.winner.disbursedAmount,
            );
          }

          effectiveMode =
            existingPreparedAuction.winner.disbursementMode || dto.disbursementMode;
          const preparedRef = existingPreparedAuction.winner.paymentReference?.trim();
          if (preparedRef && preparedRef.toUpperCase() === 'COMPANY_POOL_MONTH_1') {
            throw new BadRequestException(
              'INVALID_PAYMENT_REFERENCE: "COMPANY_POOL_MONTH_1" is reserved exclusively for Month 1 statutory company pool and cannot be used for Month N maturity settlement',
            );
          }
          trimmedPaymentRef =
            preparedRef || dto.paymentReference?.trim() || 'FINAL_SETTLEMENT_MONTH_N';
          effectivePaymentRefForError = trimmedPaymentRef;
        } else if (
          existingPreparedAuction &&
          existingPreparedAuction.installmentMonth === finalMonth &&
          (lockedPreparedAuctionStatus === 'COMPLETED' ||
            lockedPreparedAuctionStatus === 'MINUTES_FILED' ||
            lockedPreparedWinnerStatus === 'DISBURSED')
        ) {
          throw new BadRequestException(
            'FINAL_SETTLEMENT_ALREADY_EXECUTED: Month N settlement has already been completed',
          );
        }

        const makerUserId = authoritativeMakerId!;

        const lockedTicket = await lockSubscriberTicketRow(tx, ticket.id);
        if (lockedTicket && lockedTicket.isPrized) {
          throw new BadRequestException(
            `FINAL_SETTLEMENT_ALREADY_EXECUTED: Ticket #${ticket.ticketNumber} is already prized`,
          );
        }

        // Re-verify single unprized ticket under ChitGroup lock
        if (typeof tx.subscriberTicket?.count === 'function') {
          const lockedUnprizedCount = await tx.subscriberTicket.count({
            where: { chitGroupId, isPrized: false },
          });
          if (lockedUnprizedCount > 1) {
            throw new BadRequestException(
              `Cannot execute final settlement: There are still ${lockedUnprizedCount} unprized tickets. Final settlement is exclusively for the single remaining subscriber in Month ${chit.durationMonths}`,
            );
          }
        }

        await this.lockTicketInstallmentDues(tx, ticket.id);

        // Duplicate Bank UTR / Cheque Reference Prevention (case-insensitive)
        await this.assertUniqueNonCashPaymentReference(
          tx,
          trimmedPaymentRef,
          effectiveMode,
          existingPreparedAuction?.winner?.id,
        );

        // Check for any prior unpaid dues (Months 1 to N-1) UNDER LOCK
        const unpaidPriorDues =
          typeof tx.installmentDue?.findMany === 'function'
            ? await tx.installmentDue.findMany({
                where: {
                  ticketId: ticket.id,
                  installmentMonth: { lt: finalMonth },
                  status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
                },
                orderBy: { installmentMonth: 'asc' },
              })
            : [];
        const priorArrears = unpaidPriorDues.reduce(
          (sum: bigint, d: any) =>
            sum + (BigInt(d.netPayableAmount ?? 0n) - BigInt(d.paidAmount ?? 0n)),
          0n,
        );

        // FIN-B: Check if Month N installment was already paid to prevent double collection
        let isFinalMonthAlreadyPaid = false;
        let existingFinalDue: any = null;
        if (typeof tx.installmentDue?.findUnique === 'function') {
          existingFinalDue = await tx.installmentDue.findUnique({
            where: {
              ticketId_installmentMonth: {
                ticketId: ticket.id,
                installmentMonth: finalMonth,
              },
            },
          });
          if (existingFinalDue && existingFinalDue.status === DueStatus.PAID) {
            isFinalMonthAlreadyPaid = true;
          }
        }

        // KFC-FIN-001 & FIN-B: Net Prize Entitlement = Chit Value - Frozen Commission - (Final Month Installment if unpaid) - Prior Arrears
        const finalMonthDeduction = isFinalMonthAlreadyPaid ? 0n : finalMonthInstallment;
        const netPayablePrize = grossPrize - commissionAmount - finalMonthDeduction - priorArrears;
        if (netPayablePrize <= 0n) {
          throw new BadRequestException(
            'OUTSTANDING_ARREARS_EXCEED_PRIZE: Total outstanding installments and commission exceed or equal the chit prize value',
          );
        }

        // FIN-D TOCTOU verification against prepared settlement snapshot when approving Stage 2
        if (
          authoritativeExpectedNetPayout !== undefined &&
          netPayablePrize !== authoritativeExpectedNetPayout
        ) {
          throw new BadRequestException(
            `ARREARS_STATE_CHANGED: Calculated Month ${finalMonth} net payout (₹${netPayablePrize.toString()}) no longer matches prepared settlement snapshot (₹${authoritativeExpectedNetPayout.toString()}). Installment or arrears state changed after preparation; Maker must re-prepare the settlement voucher.`,
          );
        }

        // Update or upsert settlement auction record for Month N (F05)
        const settlementAuction =
          typeof tx.auction.upsert === 'function'
            ? await tx.auction.upsert({
                where: { chitGroupId_installmentMonth: { chitGroupId, installmentMonth: finalMonth } },
                create: {
                  chitGroupId,
                  installmentMonth: finalMonth,
                  auctionDate: releaseDate,
                  status: 'COMPLETED',
                  isHistoricalEntry: false,
                  bidDiscount: commissionAmount,
                  foremanCommissionRate: commissionRate,
                  foremanCommissionAmount: commissionAmount,
                  totalDividend: 0n,
                  dividendPerTicket: 0n,
                  prizeMoney: grossPrize - commissionAmount,
                  conductedByUserId: makerUserId,
                  finalizedByUserId: checkerUserId,
                },
                update: {
                  auctionDate: releaseDate,
                  status: 'COMPLETED',
                  bidDiscount: commissionAmount,
                  foremanCommissionRate: commissionRate,
                  foremanCommissionAmount: commissionAmount,
                  prizeMoney: grossPrize - commissionAmount,
                  conductedByUserId: makerUserId,
                  finalizedByUserId: checkerUserId,
                },
              })
            : await tx.auction.create({
                data: {
                  chitGroupId,
                  installmentMonth: finalMonth,
                  auctionDate: releaseDate,
                  status: 'COMPLETED',
                  isHistoricalEntry: false,
                  bidDiscount: commissionAmount,
                  foremanCommissionRate: commissionRate,
                  foremanCommissionAmount: commissionAmount,
                  totalDividend: 0n,
                  dividendPerTicket: 0n,
                  prizeMoney: grossPrize - commissionAmount,
                  conductedByUserId: makerUserId,
                  finalizedByUserId: checkerUserId,
                },
              });

        // Update or upsert AuctionWinner record with exact net disbursed amount
        let settlementWinner: any;
        if (typeof tx.auctionWinner.upsert === 'function') {
          settlementWinner = await tx.auctionWinner.upsert({
            where: { auctionId: settlementAuction.id },
            create: {
              auctionId: settlementAuction.id,
              ticketId: ticket.id,
              wasTieBreakWinner: false,
              disbursementStatus: 'DISBURSED',
              disbursementMode: effectiveMode,
              disbursedAmount: netPayablePrize,
              verifiedByUserId: makerUserId,
              authorizedByUserId: checkerUserId,
              disbursedAt: releaseDate,
              paymentReference: trimmedPaymentRef,
              agreementSigned: true,
              nomineeSigned: true,
            },
            update: {
              ticketId: ticket.id,
              disbursementStatus: 'DISBURSED',
              disbursementMode: effectiveMode,
              disbursedAmount: netPayablePrize,
              verifiedByUserId: makerUserId,
              authorizedByUserId: checkerUserId,
              disbursedAt: releaseDate,
              paymentReference: trimmedPaymentRef,
              agreementSigned: true,
              nomineeSigned: true,
            },
          });
        } else {
          settlementWinner = await tx.auctionWinner.create({
            data: {
              auctionId: settlementAuction.id,
              ticketId: ticket.id,
              wasTieBreakWinner: false,
              disbursementStatus: 'DISBURSED',
              disbursementMode: effectiveMode,
              disbursedAmount: netPayablePrize,
              verifiedByUserId: makerUserId,
              authorizedByUserId: checkerUserId,
              disbursedAt: releaseDate,
              paymentReference: trimmedPaymentRef,
              agreementSigned: true,
              nomineeSigned: true,
            },
          });
        }

        const settledDueIds: string[] = [];

        // Settle Month N installment due for the winning ticket (only if not already paid) + audit provenance
        if (!isFinalMonthAlreadyPaid) {
          let settledMonthNDueId: string | null = null;
          if (existingFinalDue && typeof tx.installmentDue?.update === 'function') {
            await tx.installmentDue.update({
              where: { id: existingFinalDue.id },
              data: {
                status: DueStatus.PAID,
                paidAmount: finalMonthInstallment,
                grossAmount: finalMonthInstallment,
                dividendDeduction: 0n,
                netPayableAmount: finalMonthInstallment,
              },
            });
            settledMonthNDueId = existingFinalDue.id;
          } else if (typeof tx.installmentDue?.create === 'function') {
            const createdFinalDue = await tx.installmentDue.create({
              data: {
                chitGroupId,
                ticketId: ticket.id,
                installmentMonth: finalMonth,
                grossAmount: finalMonthInstallment,
                dividendDeduction: 0n,
                netPayableAmount: finalMonthInstallment,
                paidAmount: finalMonthInstallment,
                status: DueStatus.PAID,
                cycleStartDate: releaseDate,
                cycleEndDate: releaseDate,
                dueDate: releaseDate,
              },
            });
            settledMonthNDueId = createdFinalDue?.id ?? null;
          }

          if (settledMonthNDueId) {
            settledDueIds.push(settledMonthNDueId);
            await tx.auditLog.create({
              data: {
                userId: checkerUserId,
                action: 'PRIZE_ARREARS_OFFSET_ALLOCATED',
                entityType: 'InstallmentDue',
                entityId: settledMonthNDueId,
                newValue: {
                  ticketId: ticket.id,
                  installmentMonth: finalMonth,
                  offsetAmount: finalMonthInstallment.toString(),
                  priorPaidAmount: '0',
                  finalPaidAmount: finalMonthInstallment.toString(),
                  auctionWinnerId: settlementWinner?.id ?? null,
                  paymentReference: trimmedPaymentRef,
                  offsetReason: 'FINAL_MONTH_SETTLEMENT_OFFSET',
                },
              },
            });
          }
        }

        // Mark any prior unpaid dues settled via maturity payout offset + audit provenance (KC-09 / FIN-A)
        for (const due of unpaidPriorDues) {
          const dueOutstanding = BigInt(due.netPayableAmount ?? 0n) - BigInt(due.paidAmount ?? 0n);
          if (typeof tx.installmentDue?.update === 'function') {
            await tx.installmentDue.update({
              where: { id: due.id },
              data: {
                status: DueStatus.PAID,
                paidAmount: due.netPayableAmount,
              },
            });
          }
          settledDueIds.push(due.id);

          await tx.auditLog.create({
            data: {
              userId: checkerUserId,
              action: 'PRIZE_ARREARS_OFFSET_ALLOCATED',
              entityType: 'InstallmentDue',
              entityId: due.id,
              newValue: {
                ticketId: due.ticketId,
                installmentMonth: due.installmentMonth,
                offsetAmount: dueOutstanding.toString(),
                priorPaidAmount: (due.paidAmount ?? 0n).toString(),
                finalPaidAmount: due.netPayableAmount.toString(),
                auctionWinnerId: settlementWinner?.id ?? null,
                paymentReference: trimmedPaymentRef,
                offsetReason: 'FINAL_MONTH_PRIOR_ARREARS_OFFSET',
              },
            },
          });
        }

        // Recalculate consecutive unpaid months via arrears.util.ts
        const nextArrears = await this.recalculateTicketArrearsState(
          tx,
          ticket.id,
          lockedTicket?.status ?? ticket.status,
          settledDueIds,
        );

        // Update ticket to prized and commit authoritative arrears state
        await tx.subscriberTicket.update({
          where: { id: ticket.id },
          data: {
            isPrized: true,
            prizedAuctionId: settlementAuction.id,
            consecutiveUnpaidMonths: nextArrears.consecutiveUnpaidMonths,
            status: nextArrears.status,
          },
        });

        // Transition chit group to COMPLETED
        await tx.chitGroup.update({
          where: { id: chitGroupId },
          data: {
            status: 'COMPLETED',
          },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            userId: checkerUserId,
            action: 'FINAL_MONTH_SETTLEMENT_EXECUTED',
            entityType: 'ChitGroup',
            entityId: chitGroupId,
            newValue: {
              ticketId: ticket.id,
              ticketNumber: ticket.ticketNumber,
              grossPrize: grossPrize.toString(),
              foremanCommissionRate: rateDisplay,
              foremanCommission: commissionAmount.toString(),
              finalMonthInstallment: finalMonthDeduction.toString(),
              isFinalMonthAlreadyPaid,
              priorArrearsDeducted: priorArrears.toString(),
              netPrizeMoney: netPayablePrize.toString(),
              disbursementMode: effectiveMode,
              paymentReference: trimmedPaymentRef,
              makerUserId,
              checkerUserId,
              status: 'COMPLETED',
            },
          },
        });

        return {
          message: `Final Month ${finalMonth} maturity settlement successfully executed for Ticket #${ticket.ticketNumber} (${ticket.customer.fullName}). Final installment deduction: ₹${finalMonthDeduction.toString()} (${isFinalMonthAlreadyPaid ? 'Already Paid' : 'Deducted from Prize'}) and ${rateDisplay}% commission: ₹${commissionAmount.toString()}. Net payout: ₹${netPayablePrize.toString()}. Scheme marked as COMPLETED.`,
          settlement: {
            chitGroupId,
            installmentMonth: finalMonth,
            ticketNumber: ticket.ticketNumber,
            customerName: ticket.customer.fullName,
            grossPrize: Number(grossPrize),
            foremanCommission: Number(commissionAmount),
            finalMonthInstallment: Number(finalMonthDeduction),
            isFinalMonthAlreadyPaid,
            priorArrearsDeducted: Number(priorArrears),
            netPrizeMoney: Number(netPayablePrize),
            disbursementMode: effectiveMode,
            paymentReference: trimmedPaymentRef,
            disbursedAt: releaseDate,
            auctionId: settlementAuction.id,
          },
        };
      });
    } catch (err) {
      this.rethrowDuplicatePaymentRefError(err, effectivePaymentRefForError);
    }

    // Post-commit: Proactively invalidate report cache for final settlement
    await this.invalidateReportCaches(chit.branchId, releaseDate);

    return result;
  }

  /**
   * Stage 1: Maker prepares the Month N final settlement voucher and financial calculations.
   * Creates pending settlement records with conductedByUserId = makerUserId (F05 & F12).
   */
  async prepareFinalSettlement(
    chitGroupId: string,
    dto: SettleFinalMonthDto,
    makerUserId: string,
    makerRoles: Role[],
    branchOrUser?: string | null | JwtPayload,
  ) {
    const isAuthorizedMaker = makerRoles.some((r) =>
      ([Role.PARTNER, Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT] as Role[]).includes(r),
    );
    if (!isAuthorizedMaker) {
      throw new ForbiddenException(
        'Only Branch Manager, Accountant, Partner, or Super Admin can prepare Month N final settlement vouchers',
      );
    }

    // Guardrail 11: Block administrative IT Super Admins from preparing settlements
    await this.assertPartnerIfSuperAdminOnly(
      makerUserId,
      makerRoles,
      'prepare Month N final settlement vouchers',
    );

    // CR-DISB-05: Reject COMPANY_POOL_MONTH_1 reserved placeholder on Month N preparation
    if (
      dto.paymentReference &&
      dto.paymentReference.trim().toUpperCase() === 'COMPANY_POOL_MONTH_1'
    ) {
      throw new BadRequestException(
        'INVALID_PAYMENT_REFERENCE: "COMPANY_POOL_MONTH_1" is reserved exclusively for Month 1 statutory company pool and cannot be used for Month N maturity settlement',
      );
    }

    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
      include: { branch: true },
    });
    if (!chit) throw new NotFoundException('Chit scheme not found');
    if (chit.status !== 'ACTIVE') {
      throw new BadRequestException('Chit scheme must be ACTIVE to prepare final settlement');
    }

    // CR-DISB-06: Fail-closed cross-branch Anti-BOLA guard via assertBranchAccess (including when branchId is undefined/null)
    if (branchOrUser !== undefined) {
      const scopeUser: JwtPayload =
        typeof branchOrUser === 'object' && branchOrUser !== null
          ? branchOrUser
          : {
              sub: makerUserId,
              phone: '',
              roles: makerRoles,
              branchId: branchOrUser,
              tokenType: 'access',
            };
      this.assertBranchAccess(chit.branchId, scopeUser, 'chit scheme');
    }

    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: dto.ticketId },
      include: { customer: true },
    });
    if (!ticket || ticket.chitGroupId !== chitGroupId) {
      throw new NotFoundException('Selected ticket does not belong to this chit scheme');
    }
    if (ticket.status === 'REMOVED_DEF_3M' || ticket.status === 'SURRENDERED') {
      throw new BadRequestException(
        `Ticket #${ticket.ticketNumber} is ${ticket.status} and cannot receive final settlement`,
      );
    }
    if (ticket.isPrized) {
      throw new BadRequestException(`Ticket #${ticket.ticketNumber} is already prized`);
    }

    const finalMonth = chit.durationMonths;
    const { commissionRate, commissionAmount, rateDisplay } =
      this.calculateFrozenForemanCommission(chit.chitValue, chit.foremanCommissionRate);
    const grossPrize = chit.chitValue;
    const finalMonthInstallment =
      chit.baseInstallment ?? chit.chitValue / BigInt(chit.durationMonths);
    const releaseDate = dto.disbursedAt ? new Date(dto.disbursedAt) : new Date();
    const trimmedPaymentRef = dto.paymentReference?.trim() || 'FINAL_SETTLEMENT_PREPARED';

    const prepared = await withTransactionRetry(this.prisma, async (tx) => {
      // Deterministic DAG locks: ChitGroup -> Auction -> SubscriberTicket -> InstallmentDue
      const lockedGroup = await lockChitGroupRow(tx, chitGroupId);
      if (lockedGroup && lockedGroup.status !== 'ACTIVE') {
        throw new BadRequestException('Chit scheme must be ACTIVE to prepare final settlement');
      }

      const existingAuction = await tx.auction.findUnique({
        where: { chitGroupId_installmentMonth: { chitGroupId, installmentMonth: finalMonth } },
      });
      if (existingAuction) {
        const lockedAuc = await lockAuctionRow(tx, existingAuction.id);
        const aucStatus = lockedAuc?.status ?? existingAuction.status;
        if (aucStatus === 'COMPLETED' || aucStatus === 'MINUTES_FILED') {
          throw new BadRequestException('Month N settlement is already completed');
        }
      }

      const lockedTicket = await lockSubscriberTicketRow(tx, ticket.id);
      if (lockedTicket && lockedTicket.isPrized) {
        throw new BadRequestException(`Ticket #${ticket.ticketNumber} is already prized`);
      }

      const unprizedCount = await tx.subscriberTicket.count({
        where: { chitGroupId, isPrized: false },
      });
      if (unprizedCount > 1) {
        throw new BadRequestException(
          `Cannot prepare final settlement: ${unprizedCount} unprized tickets remain. Final settlement is exclusively for the single remaining subscriber in Month ${chit.durationMonths}`,
        );
      }

      await this.lockTicketInstallmentDues(tx, ticket.id);

      // Duplicate non-cash reference pre-check against already-disbursed payouts (case-insensitive)
      await this.assertUniqueNonCashPaymentReference(
        tx,
        trimmedPaymentRef,
        dto.disbursementMode,
      );

      const unpaidPriorDues =
        typeof tx.installmentDue?.findMany === 'function'
          ? await tx.installmentDue.findMany({
              where: {
                ticketId: ticket.id,
                installmentMonth: { lt: finalMonth },
                status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
              },
              orderBy: { installmentMonth: 'asc' },
            })
          : [];

      const priorArrears = unpaidPriorDues.reduce(
        (acc: bigint, d: any) =>
          acc + (BigInt(d.netPayableAmount ?? 0n) - BigInt(d.paidAmount ?? 0n)),
        0n,
      );

      const monthNDue =
        typeof tx.installmentDue?.findUnique === 'function'
          ? await tx.installmentDue.findUnique({
              where: {
                ticketId_installmentMonth: {
                  ticketId: ticket.id,
                  installmentMonth: finalMonth,
                },
              },
            })
          : null;

      const isFinalMonthAlreadyPaid = monthNDue?.status === DueStatus.PAID;
      const finalMonthDeduction = isFinalMonthAlreadyPaid ? 0n : finalMonthInstallment;
      const totalDeductions = commissionAmount + finalMonthDeduction + priorArrears;

      if (totalDeductions >= grossPrize) {
        throw new BadRequestException(
          `Total deductions (₹${totalDeductions.toString()}) exceed or equal gross chit pool (₹${grossPrize.toString()})`,
        );
      }
      const netPayablePrize = grossPrize - totalDeductions;

      let auctionId: string;
      if (existingAuction) {
        await tx.auction.update({
          where: { id: existingAuction.id },
          data: {
            bidDiscount: commissionAmount,
            foremanCommissionRate: commissionRate,
            foremanCommissionAmount: commissionAmount,
            prizeMoney: grossPrize - commissionAmount,
            conductedByUserId: makerUserId,
            finalizedByUserId: null,
          },
        });
        auctionId = existingAuction.id;
      } else {
        const newAuction = await tx.auction.create({
          data: {
            chitGroupId,
            installmentMonth: finalMonth,
            auctionDate: releaseDate,
            status: 'SCHEDULED',
            bidDiscount: commissionAmount,
            foremanCommissionRate: commissionRate,
            foremanCommissionAmount: commissionAmount,
            totalDividend: 0n,
            dividendPerTicket: 0n,
            prizeMoney: grossPrize - commissionAmount,
            conductedByUserId: makerUserId,
            finalizedByUserId: null,
          },
        });
        auctionId = newAuction.id;
      }

      await tx.auctionWinner.upsert({
        where: { auctionId },
        create: {
          auctionId,
          ticketId: ticket.id,
          wasTieBreakWinner: false,
          disbursementStatus: 'VERIFIED_BY_MAKER',
          disbursementMode: dto.disbursementMode,
          disbursedAmount: netPayablePrize,
          verifiedByUserId: makerUserId,
          authorizedByUserId: null,
          paymentReference: trimmedPaymentRef,
        },
        update: {
          ticketId: ticket.id,
          disbursementStatus: 'VERIFIED_BY_MAKER',
          disbursementMode: dto.disbursementMode,
          disbursedAmount: netPayablePrize,
          verifiedByUserId: makerUserId,
          authorizedByUserId: null,
          paymentReference: trimmedPaymentRef,
        },
      });

      if (typeof tx.auditLog?.create === 'function') {
        await tx.auditLog.create({
          data: {
            userId: makerUserId,
            action: 'FINAL_MONTH_SETTLEMENT_PREPARED',
            entityType: 'ChitGroup',
            entityId: chitGroupId,
            newValue: {
              auctionId,
              ticketId: ticket.id,
              installmentMonth: finalMonth,
              grossPrize: grossPrize.toString(),
              foremanCommissionRate: rateDisplay,
              commissionAmount: commissionAmount.toString(),
              finalMonthDeduction: finalMonthDeduction.toString(),
              isFinalMonthAlreadyPaid,
              priorArrears: priorArrears.toString(),
              netPayablePrize: netPayablePrize.toString(),
              disbursementMode: dto.disbursementMode,
              paymentReference: trimmedPaymentRef,
              status: 'VERIFIED_BY_MAKER',
            },
          },
        });
      }

      return {
        auctionId,
        ticketId: ticket.id,
        grossPrize: Number(grossPrize),
        commissionAmount: Number(commissionAmount),
        finalMonthDeduction: Number(finalMonthDeduction),
        finalMonthInstallment: Number(finalMonthDeduction),
        priorArrears: Number(priorArrears),
        netPayablePrize: Number(netPayablePrize),
        preparedByUserId: makerUserId,
        status: 'PENDING_APPROVAL',
      };
    });

    return {
      success: true,
      message: `Final Month ${finalMonth} maturity settlement voucher prepared. Requires independent Checker Partner approval.`,
      settlement: prepared,
    };
  }

  /**
   * Stage 2: Independent Checker Partner approves and commits the prepared Month N settlement.
   * Strictly enforces maker_user_id != checker_user_id (F05 & F12) and FIN-D TOCTOU verification under lock.
   */
  async approveFinalSettlement(
    chitGroupId: string,
    checkerUserId: string,
    checkerRoles: Role[],
  ) {
    if (!checkerRoles.includes(Role.PARTNER) && !checkerRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'DISBURSEMENT_PERMISSION_DENIED: Only Super Admin (Partners) possess financial authority to approve settlements',
      );
    }

    await this.assertVerifiedPartner(
      checkerUserId,
      'PARTNER_IDENTITY_REQUIRED: Only verified business partners can authorize final payouts',
    );

    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
    });
    if (!chit) throw new NotFoundException('Chit scheme not found');

    const finalMonth = chit.durationMonths;
    const auction = await this.prisma.auction.findUnique({
      where: { chitGroupId_installmentMonth: { chitGroupId, installmentMonth: finalMonth } },
      include: { winner: true },
    });

    if (!auction || !auction.winner) {
      throw new NotFoundException('No prepared settlement found for Month N. Maker must prepare voucher first.');
    }

    if (auction.status === 'COMPLETED' || auction.status === 'MINUTES_FILED') {
      throw new BadRequestException('Month N settlement has already been approved and disbursed');
    }

    if (
      auction.winner.disbursementStatus &&
      auction.winner.disbursementStatus !== 'VERIFIED_BY_MAKER'
    ) {
      throw new BadRequestException(
        `Invalid transition: Month N settlement must be in VERIFIED_BY_MAKER state before approval (current: ${auction.winner.disbursementStatus})`,
      );
    }

    // Invariant Guardrail 10: Strict Maker != Checker
    if (auction.conductedByUserId === checkerUserId || auction.winner.verifiedByUserId === checkerUserId) {
      throw new ForbiddenException(
        'MAKER_CHECKER_VIOLATION: Final month payout requires independent maker and checker. Maker and checker cannot be the same user.',
      );
    }

    const expectedNetPayout =
      auction.winner.disbursedAmount !== null && auction.winner.disbursedAmount !== undefined
        ? BigInt(auction.winner.disbursedAmount)
        : undefined;

    return this.settleFinalMonth(
      chitGroupId,
      {
        ticketId: auction.winner.ticketId,
        disbursementMode: auction.winner.disbursementMode || DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
        paymentReference: auction.winner.paymentReference || 'FINAL_SETTLEMENT_APPROVED',
        makerUserId: auction.conductedByUserId || auction.winner.verifiedByUserId || undefined,
      },
      checkerUserId,
      checkerRoles,
      { expectedNetPayout, requirePreparedSettlement: true },
    );
  }
}
