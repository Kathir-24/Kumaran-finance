import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  lockAuctionWinnerRow,
  lockChitGroupRow,
  lockSubscriberTicketRow,
} from '../common/utils/state-transition-lock.util';
import { withTransactionRetry } from '../common/utils/transaction-retry.util';
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
import { QueryDisbursementDto } from './dto/query-disbursement.dto';
import { ReleasePayoutDto } from './dto/release-payout.dto';
import { SettleFinalMonthDto } from './dto/settle-final-month.dto';
import { VerifySafetyProofDto } from './dto/verify-safety-proof.dto';

const MAX_SAFETY_PROOF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_SAFETY_PROOF_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

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
                customer: true,
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

    // Branch scoping for branch manager
    if (
      requestingUser.roles.includes(Role.BRANCH_MANAGER) &&
      !requestingUser.roles.includes(Role.SUPER_ADMIN)
    ) {
      if (requestingUser.branchId) {
        where.auction = {
          ...where.auction,
          chitGroup: { branchId: requestingUser.branchId },
        };
      }
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
  ) {
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

      const updated = await tx.auctionWinner.update({
        where: { id: auction.winner!.id },
        data: {
          isSecurityRequired: dto.isSecurityRequired,
          securityType: dto.securityType || null,
          blankChequeDetails: dto.blankChequeDetails || null,
          agreementSigned: dto.agreementSigned,
          nomineeSigned: dto.nomineeSigned,
          securityDocS3Key: dto.securityDocS3Key || null,
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
            securityType: dto.securityType,
            agreementSigned: dto.agreementSigned,
            nomineeSigned: dto.nomineeSigned,
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
            jobId: `approval-alert:disbursement:${auctionId}`,
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

  /**
   * Uploads photos of signed blank cheques, promissory notes, or agreement to private S3 bucket.
   */
  async uploadSafetyProof(
    auctionId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    makerUserId: string,
  ) {
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

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { winner: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

    if (!auction.winner) {
      throw new BadRequestException('Cannot upload safety proof: No winner recorded for this auction');
    }

    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const s3Key = `safety-proofs/${auctionId}/${Date.now()}_${sanitizedFilename}`;

    await this.storageService.uploadFile(s3Key, file.buffer, file.mimetype);

    await this.prisma.auctionWinner.update({
      where: { id: auction.winner.id },
      data: {
        securityDocS3Key: s3Key,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: makerUserId,
        action: 'SAFETY_PROOF_DOCUMENT_UPLOADED',
        entityType: 'AuctionWinner',
        entityId: auction.winner.id,
        newValue: {
          s3Key,
          fileName: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
        },
      },
    });

    return {
      success: true,
      message: 'Safety proof collateral document uploaded and linked successfully.',
      auctionId,
      securityDocS3Key: s3Key,
      fileName: file.originalname,
      uploadedAt: new Date(),
    };
  }

  /**
   * Generates a 15-minute secure presigned viewing URL for Partner B (Checker) to inspect safety proof.
   */
  async getSafetyProofPresignedUrl(auctionId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { winner: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

    if (!auction.winner) {
      throw new BadRequestException('No winner recorded for this auction');
    }

    if (!auction.winner.securityDocS3Key) {
      throw new NotFoundException('No safety proof document uploaded for this auction winner');
    }

    const presignedUrl = await this.storageService.getPresignedUrl(
      auction.winner.securityDocS3Key,
      900, // 15 minutes
    );

    return {
      url: presignedUrl,
      expiresInSeconds: 900,
      securityDocS3Key: auction.winner.securityDocS3Key,
    };
  }

  /**
   * Checker: Authorizes Prize Payout Voucher.
   * Strictly enforces Maker != Checker (verifiedByUserId != checkerUserId).
   * Super Admin exclusively (Branch Manager strictly blocked per permissions-matrix §6).
   */
  async authorizePayout(
    auctionId: string,
    dto: AuthorizePayoutDto,
    checkerUserId: string,
    checkerRoles: Role[],
  ) {
    // 1. Enforce Super Admin Exclusivity
    if (!checkerRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'DISBURSEMENT_PERMISSION_DENIED: Only Super Admin (Partners) possess financial authority to authorize prize money disbursements',
      );
    }

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

    if (auction.winner.disbursementStatus !== 'VERIFIED_BY_MAKER') {
      throw new BadRequestException(
        `Invalid transition: Payout can only be authorized when status is VERIFIED_BY_MAKER (current: ${auction.winner.disbursementStatus})`,
      );
    }

    // 2. Hard Guard: Maker != Checker
    if (auction.winner.verifiedByUserId === checkerUserId) {
      throw new ForbiddenException(
        'MAKER_CHECKER_VIOLATION: The user who verified the safety proof checklist cannot authorize the prize payout. An independent Partner must review and authorize.',
      );
    }

    const amountToDisburse = dto.disbursedAmount
      ? BigInt(Math.floor(dto.disbursedAmount))
      : auction.prizeMoney || 0n;

    const result = await withTransactionRetry(this.prisma, async (tx) => {
      // 0. Pessimistic Row Lock (SELECT FOR UPDATE) to eliminate concurrent duplicate authorization
      const lockedWinner = await lockAuctionWinnerRow(tx, auction.winner!.id);
      if (lockedWinner && lockedWinner.disbursementStatus !== 'VERIFIED_BY_MAKER') {
        throw new BadRequestException(
          'PRIZE_ALREADY_AUTHORIZED: Prize payout has already been authorized or status has changed',
        );
      }

      const updated = await tx.auctionWinner.update({
        where: { id: auction.winner!.id },
        data: {
          disbursementMode: dto.disbursementMode,
          disbursedAmount: amountToDisburse,
          authorizedByUserId: checkerUserId,
          disbursementStatus: 'AUTHORIZED_BY_CHECKER',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: checkerUserId,
          action: 'PRIZE_PAYOUT_AUTHORIZED',
          entityType: 'AuctionWinner',
          entityId: auction.winner!.id,
          newValue: {
            disbursementMode: dto.disbursementMode,
            disbursedAmount: amountToDisburse.toString(),
            authorizedByUserId: checkerUserId,
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
   */
  async releasePayout(
    auctionId: string,
    dto: ReleasePayoutDto,
    releaseUserId: string,
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

    if (auction.winner.disbursementStatus !== 'AUTHORIZED_BY_CHECKER') {
      throw new BadRequestException(
        `Invalid transition: Payout must be authorized before release (current: ${auction.winner.disbursementStatus})`,
      );
    }

    const releaseDate = dto.disbursedAt ? new Date(dto.disbursedAt) : new Date();

    const result = await withTransactionRetry(this.prisma, async (tx) => {
      // 0. Pessimistic Row Lock (SELECT FOR UPDATE) to eliminate concurrent duplicate disbursement release
      const lockedWinner = await lockAuctionWinnerRow(tx, auction.winner!.id);
      if (
        lockedWinner &&
        (lockedWinner.disbursementStatus === 'DISBURSED' ||
          lockedWinner.disbursementStatus !== 'AUTHORIZED_BY_CHECKER')
      ) {
        throw new BadRequestException(
          'PRIZE_ALREADY_DISBURSED: Prize payout has already been released or status has changed',
        );
      }

      const updated = await tx.auctionWinner.update({
        where: { id: auction.winner!.id },
        data: {
          paymentReference: dto.paymentReference,
          disbursedAt: releaseDate,
          disbursementStatus: 'DISBURSED',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: releaseUserId,
          action: 'PRIZE_PAYOUT_DISBURSED',
          entityType: 'AuctionWinner',
          entityId: auction.winner!.id,
          newValue: {
            paymentReference: dto.paymentReference,
            disbursedAt: releaseDate,
            status: 'DISBURSED',
          },
        },
      });

      return {
        message: 'Prize payout released successfully. Voucher is ready for printing.',
        winner: updated,
      };
    });

    // Post-commit: Proactively invalidate report cache for disbursements
    await this.invalidateReportCaches(auction.chitGroup?.branchId, releaseDate);

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

    const branchCode = branch.code || 'PRD';
    const year = new Date().getFullYear();
    const sequence = String(auction.installmentMonth).padStart(5, '0');
    const voucherNumber = `KC-VOU-${branchCode}-${year}-${sequence}`;

    const voucherInput: VoucherDataInput = {
      voucherNumber,
      disbursedAt: winner.disbursedAt || new Date(),
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
      bidDiscount: auction.bidDiscount || 0n,
      prizeMoney: winner.disbursedAmount || auction.prizeMoney || 0n,
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
      data: voucherInput,
      formattedText,
    };
  }

  /**
   * Final Month (Month N) Maturity Settlement:
   * Direct settlement to the final remaining subscriber without auction.
   * Retains 4% Foreman Commission.
   * Marks subscriber ticket as prized and transitions chit scheme to COMPLETED.
   */
  async settleFinalMonth(
    chitGroupId: string,
    dto: SettleFinalMonthDto,
    checkerUserId: string,
    checkerRoles: Role[],
  ) {
    if (!checkerRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'DISBURSEMENT_PERMISSION_DENIED: Only Super Admin (Partners) possess financial authority to authorize final month settlements',
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

    const finalMonth = chit.durationMonths;
    const commissionAmount = (chit.chitValue * 4n) / 100n; // 4.00%
    const prizeMoney = chit.chitValue - commissionAmount;
    const releaseDate = dto.disbursedAt ? new Date(dto.disbursedAt) : new Date();

    const result = await withTransactionRetry(this.prisma, async (tx) => {
      const lockedGroup = await lockChitGroupRow(tx, chitGroupId);
      if (lockedGroup && lockedGroup.status !== 'ACTIVE') {
        throw new BadRequestException(
          `FINAL_SETTLEMENT_ALREADY_EXECUTED: Chit scheme is no longer ACTIVE (current: ${lockedGroup.status})`,
        );
      }

      const lockedTicket = await lockSubscriberTicketRow(tx, ticket.id);
      if (lockedTicket && lockedTicket.isPrized) {
        throw new BadRequestException(
          `FINAL_SETTLEMENT_ALREADY_EXECUTED: Ticket #${ticket.ticketNumber} is already prized`,
        );
      }

      // Create settlement auction record for Month N
      const settlementAuction = await tx.auction.create({
        data: {
          chitGroupId,
          installmentMonth: finalMonth,
          auctionDate: releaseDate,
          status: 'COMPLETED',
          isHistoricalEntry: false,
          bidDiscount: commissionAmount,
          foremanCommissionRate: new Prisma.Decimal(4.0),
          foremanCommissionAmount: commissionAmount,
          totalDividend: 0n,
          dividendPerTicket: 0n,
          prizeMoney,
          conductedByUserId: checkerUserId,
          finalizedByUserId: checkerUserId,
        },
      });

      // Create AuctionWinner record
      await tx.auctionWinner.create({
        data: {
          auctionId: settlementAuction.id,
          ticketId: ticket.id,
          wasTieBreakWinner: false,
          disbursementStatus: 'DISBURSED',
          disbursementMode: dto.disbursementMode,
          disbursedAmount: prizeMoney,
          authorizedByUserId: checkerUserId,
          disbursedAt: releaseDate,
          paymentReference: dto.paymentReference || 'FINAL_SETTLEMENT_MONTH_N',
          agreementSigned: true,
          nomineeSigned: true,
        },
      });

      // Update ticket to prized
      await tx.subscriberTicket.update({
        where: { id: ticket.id },
        data: {
          isPrized: true,
          prizedAuctionId: settlementAuction.id,
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
            grossPrize: chit.chitValue.toString(),
            foremanCommission: commissionAmount.toString(),
            netPrizeMoney: prizeMoney.toString(),
            disbursementMode: dto.disbursementMode,
            paymentReference: dto.paymentReference,
            status: 'COMPLETED',
          },
        },
      });

      return {
        message: `Final Month ${finalMonth} maturity settlement successfully executed for Ticket #${ticket.ticketNumber} (${ticket.customer.fullName}). Scheme marked as COMPLETED.`,
        settlement: {
          chitGroupId,
          installmentMonth: finalMonth,
          ticketNumber: ticket.ticketNumber,
          customerName: ticket.customer.fullName,
          grossPrize: chit.chitValue,
          foremanCommission: commissionAmount,
          netPrizeMoney: prizeMoney,
          disbursementMode: dto.disbursementMode,
          paymentReference: dto.paymentReference,
          disbursedAt: releaseDate,
          auctionId: settlementAuction.id,
        },
      };
    });

    // Post-commit: Proactively invalidate report cache for final settlement
    await this.invalidateReportCaches(chit.branchId, releaseDate);

    return result;
  }
}
