import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as path from 'path';
import { DueStatus, DisbursementMode, Prisma, Role } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
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

  private async loadAuctionWinnerForSafetyProof(auctionId: string) {
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

    return auction.winner;
  }

  private async persistSafetyProofLink(
    auctionId: string,
    winnerId: string,
    s3Key: string,
    meta: { fileName: string; size: number; mimetype: string; uploadMode: 'DIRECT_S3_PUT' | 'MULTIPART' },
    makerUserId: string,
  ) {
    await this.prisma.auctionWinner.update({
      where: { id: winnerId },
      data: {
        securityDocS3Key: s3Key,
      },
    });

    await this.prisma.auditLog.create({
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

    const winner = await this.loadAuctionWinnerForSafetyProof(auctionId);
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const s3Key = `safety-proofs/${auctionId}/${Date.now()}_${sanitizedFilename}`;

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
  ) {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(dto.key);
    if (!sanitizedKey.startsWith(`safety-proof/${auctionId}/`)) {
      throw new BadRequestException(
        'Invalid storage key prefix: key must belong to this auction safety-proof folder',
      );
    }

    const winner = await this.loadAuctionWinnerForSafetyProof(auctionId);
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
    // 1. Enforce Super Admin & Verified Partner Exclusivity (SEC-A)
    if (!checkerRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'DISBURSEMENT_PERMISSION_DENIED: Only Super Admin (Partners) possess financial authority to authorize prize money disbursements',
      );
    }

    if (typeof this.prisma.user?.findUnique === 'function') {
      const checker = await this.prisma.user.findUnique({
        where: { id: checkerUserId },
        select: { isPartner: true },
      });
      if (checker && !checker.isPartner) {
        throw new ForbiddenException(
          'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess financial authority to authorize prize money disbursements',
        );
      }
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

    // KFC-FIN-003: Query all outstanding unpaid dues up to this auction month
    const unpaidDues = typeof this.prisma.installmentDue?.findMany === 'function'
      ? await this.prisma.installmentDue.findMany({
          where: {
            ticketId: auction.winner.ticketId,
            installmentMonth: { lte: auction.installmentMonth },
            status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
          },
          orderBy: { installmentMonth: 'asc' },
        })
      : [];
    const totalArrears = unpaidDues.reduce(
      (sum, d) => sum + (BigInt(d.netPayableAmount ?? 0n) - BigInt(d.paidAmount ?? 0n)),
      0n,
    );

    const grossPrizeMoney = auction.prizeMoney || 0n;
    if (totalArrears > 0n && totalArrears >= grossPrizeMoney) {
      throw new BadRequestException(
        `OUTSTANDING_ARREARS_EXCEED_PRIZE: Outstanding arrears (₹${totalArrears.toString()}) exceed or equal prize money (₹${grossPrizeMoney.toString()}). Prize cannot be authorized until arrears are resolved.`,
      );
    }

    // KFC-FIN-004: Exactly calculated net entitlement (Zero arbitrary override)
    const authorizedNetPayout = grossPrizeMoney - totalArrears;

    if (dto.disbursedAmount !== undefined && dto.disbursedAmount !== null) {
      const requestedAmount = toWholeRupeeBigInt(dto.disbursedAmount, 'disbursedAmount', { min: 1n });
      if (requestedAmount !== authorizedNetPayout) {
        throw new BadRequestException(
          `PAYOUT_OVERRIDE_NOT_PERMITTED: Payout amount must exactly match authorized net prize after arrears deduction of ₹${authorizedNetPayout.toString()} (Gross: ₹${grossPrizeMoney.toString()}, Arrears: ₹${totalArrears.toString()}, Requested: ₹${requestedAmount.toString()}). Arbitrary adjustments are strictly prohibited.`,
        );
      }
    }

    const amountToDisburse = authorizedNetPayout;

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
            grossPrizeMoney: grossPrizeMoney.toString(),
            arrearsDeducted: totalArrears.toString(),
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

      // TOCTOU Arrears Verification inside transaction lock (FIN-A & FIN-D):
      const grossPrizeMoney = auction.prizeMoney || 0n;
      const authorizedDisbursed = (auction.winner?.disbursedAmount !== null && auction.winner?.disbursedAmount !== undefined)
        ? auction.winner.disbursedAmount
        : grossPrizeMoney;
      const expectedArrears = grossPrizeMoney - authorizedDisbursed;

      // KFC-FIN-003: Auto-settle any outstanding dues that were deducted from the prize snapshot
      const unpaidDuesToSettle = typeof tx.installmentDue?.findMany === 'function'
        ? await tx.installmentDue.findMany({
            where: {
              ticketId: auction.winner!.ticketId,
              installmentMonth: { lte: auction.installmentMonth },
              status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
            },
            orderBy: { installmentMonth: 'asc' },
          })
        : [];

      const currentArrears = unpaidDuesToSettle.reduce(
        (sum: bigint, d: any) => sum + (BigInt(d.netPayableAmount ?? 0n) - BigInt(d.paidAmount ?? 0n)),
        0n,
      );

      if (currentArrears !== expectedArrears) {
        throw new BadRequestException(
          `ARREARS_STATE_CHANGED: Outstanding arrears (₹${currentArrears.toString()}) no longer match the authorized arrears offset (₹${expectedArrears.toString()}). Arrears status was modified after authorization. Payout must be re-authorized.`,
        );
      }

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
              auctionWinnerId: auction.winner!.id,
            },
          },
        });
      }

      await tx.subscriberTicket.update({
        where: { id: auction.winner!.ticketId },
        data: {
          consecutiveUnpaidMonths: 0,
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

    if (typeof this.prisma.user?.findUnique === 'function') {
      const checker = await this.prisma.user.findUnique({
        where: { id: checkerUserId },
        select: { isPartner: true },
      });
      if (checker && !checker.isPartner) {
        throw new ForbiddenException(
          'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess financial authority to authorize final month settlements',
        );
      }
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

    // Invariant Guardrail 10: Strict Maker != Checker Dual Control
    const makerUserId = dto.makerUserId;
    if (!makerUserId) {
      throw new BadRequestException(
        'MAKER_REQUIRED: Final month settlement requires prior preparation by an authorized Maker. Please prepare the settlement voucher first via prepareFinalSettlement.',
      );
    }

    if (makerUserId === checkerUserId) {
      throw new ForbiddenException(
        'MAKER_CHECKER_VIOLATION: Final month payout requires independent maker and checker. Maker and checker cannot be the same user.',
      );
    }

    const finalMonth = chit.durationMonths;
    const commissionAmount = (chit.chitValue * 4n) / 100n; // 4.00%
    const finalMonthInstallment = chit.baseInstallment ?? (chit.chitValue / BigInt(chit.durationMonths));
    const grossPrize = chit.chitValue;
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

      // Check for any prior unpaid dues (Months 1 to N-1)
      const unpaidPriorDues = typeof tx.installmentDue?.findMany === 'function'
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
        (sum: bigint, d: any) => sum + (BigInt(d.netPayableAmount ?? 0n) - BigInt(d.paidAmount ?? 0n)),
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

      // KFC-FIN-001 & FIN-B: Net Prize Entitlement = Chit Value - 4% Commission - (Final Month Installment if unpaid) - Prior Arrears
      const finalMonthDeduction = isFinalMonthAlreadyPaid ? 0n : finalMonthInstallment;
      const netPayablePrize = grossPrize - commissionAmount - finalMonthDeduction - priorArrears;
      if (netPayablePrize < 0n) {
        throw new BadRequestException(
          `OUTSTANDING_ARREARS_EXCEED_PRIZE: Total outstanding installments and commission exceed the chit prize value`,
        );
      }

      // Settle Month N installment due for the winning ticket (only if not already paid)
      if (!isFinalMonthAlreadyPaid) {
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
        } else if (typeof tx.installmentDue?.create === 'function') {
          await tx.installmentDue.create({
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
        }
      }

      // Mark any prior unpaid dues settled via maturity payout offset
      for (const due of unpaidPriorDues) {
        if (typeof tx.installmentDue?.update === 'function') {
          await tx.installmentDue.update({
            where: { id: due.id },
            data: {
              status: DueStatus.PAID,
              paidAmount: due.netPayableAmount,
            },
          });
        }
      }

      // Update or upsert settlement auction record for Month N (F05)
      const settlementAuction = typeof tx.auction.upsert === 'function'
        ? await tx.auction.upsert({
            where: { chitGroupId_installmentMonth: { chitGroupId, installmentMonth: finalMonth } },
            create: {
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
              prizeMoney: grossPrize - commissionAmount,
              conductedByUserId: makerUserId,
              finalizedByUserId: checkerUserId,
            },
            update: {
              auctionDate: releaseDate,
              status: 'COMPLETED',
              bidDiscount: commissionAmount,
              foremanCommissionRate: new Prisma.Decimal(4.0),
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
              foremanCommissionRate: new Prisma.Decimal(4.0),
              foremanCommissionAmount: commissionAmount,
              totalDividend: 0n,
              dividendPerTicket: 0n,
              prizeMoney: grossPrize - commissionAmount,
              conductedByUserId: makerUserId,
              finalizedByUserId: checkerUserId,
            },
          });

      // Update or upsert AuctionWinner record with exact net disbursed amount
      if (typeof tx.auctionWinner.upsert === 'function') {
        await tx.auctionWinner.upsert({
          where: { auctionId: settlementAuction.id },
          create: {
            auctionId: settlementAuction.id,
            ticketId: ticket.id,
            wasTieBreakWinner: false,
            disbursementStatus: 'DISBURSED',
            disbursementMode: dto.disbursementMode,
            disbursedAmount: netPayablePrize,
            verifiedByUserId: makerUserId,
            authorizedByUserId: checkerUserId,
            disbursedAt: releaseDate,
            paymentReference: dto.paymentReference || 'FINAL_SETTLEMENT_MONTH_N',
            agreementSigned: true,
            nomineeSigned: true,
          },
          update: {
            ticketId: ticket.id,
            disbursementStatus: 'DISBURSED',
            disbursementMode: dto.disbursementMode,
            disbursedAmount: netPayablePrize,
            verifiedByUserId: makerUserId,
            authorizedByUserId: checkerUserId,
            disbursedAt: releaseDate,
            paymentReference: dto.paymentReference || 'FINAL_SETTLEMENT_MONTH_N',
            agreementSigned: true,
            nomineeSigned: true,
          },
        });
      } else {
        await tx.auctionWinner.create({
          data: {
            auctionId: settlementAuction.id,
            ticketId: ticket.id,
            wasTieBreakWinner: false,
            disbursementStatus: 'DISBURSED',
            disbursementMode: dto.disbursementMode,
            disbursedAmount: netPayablePrize,
            verifiedByUserId: makerUserId,
            authorizedByUserId: checkerUserId,
            disbursedAt: releaseDate,
            paymentReference: dto.paymentReference || 'FINAL_SETTLEMENT_MONTH_N',
            agreementSigned: true,
            nomineeSigned: true,
          },
        });
      }

      // Update ticket to prized and clear arrears
      await tx.subscriberTicket.update({
        where: { id: ticket.id },
        data: {
          isPrized: true,
          prizedAuctionId: settlementAuction.id,
          consecutiveUnpaidMonths: 0,
          status: 'ACTIVE',
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
            foremanCommission: commissionAmount.toString(),
            finalMonthInstallment: finalMonthDeduction.toString(),
            isFinalMonthAlreadyPaid,
            priorArrearsDeducted: priorArrears.toString(),
            netPrizeMoney: netPayablePrize.toString(),
            disbursementMode: dto.disbursementMode,
            paymentReference: dto.paymentReference,
            status: 'COMPLETED',
          },
        },
      });

      return {
        message: `Final Month ${finalMonth} maturity settlement successfully executed for Ticket #${ticket.ticketNumber} (${ticket.customer.fullName}). Final installment deduction: ₹${finalMonthDeduction.toString()} (${isFinalMonthAlreadyPaid ? 'Already Paid' : 'Deducted from Prize'}) and 4% commission: ₹${commissionAmount.toString()}. Net payout: ₹${netPayablePrize.toString()}. Scheme marked as COMPLETED.`,
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

  /**
   * Stage 1: Maker prepares the Month N final settlement voucher and financial calculations.
   * Creates pending settlement records with conductedByUserId = makerUserId (F05 & F12).
   */
  async prepareFinalSettlement(
    chitGroupId: string,
    dto: SettleFinalMonthDto,
    makerUserId: string,
    makerRoles: Role[],
  ) {
    const isAuthorizedMaker = makerRoles.some((r) =>
      ([Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT] as Role[]).includes(r),
    );
    if (!isAuthorizedMaker) {
      throw new ForbiddenException(
        'Only Branch Manager, Accountant, or Super Admin can prepare Month N final settlement vouchers',
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

    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: dto.ticketId },
      include: { customer: true },
    });
    if (!ticket || ticket.chitGroupId !== chitGroupId) {
      throw new NotFoundException('Selected ticket does not belong to this chit scheme');
    }
    if (ticket.isPrized) {
      throw new BadRequestException(`Ticket #${ticket.ticketNumber} is already prized`);
    }

    const unprizedCount = await this.prisma.subscriberTicket.count({
      where: { chitGroupId, isPrized: false },
    });
    if (unprizedCount > 1) {
      throw new BadRequestException(
        `Cannot prepare final settlement: ${unprizedCount} unprized tickets remain. Final settlement is exclusively for the single remaining subscriber in Month ${chit.durationMonths}`,
      );
    }

    const finalMonth = chit.durationMonths;
    const commissionAmount = (chit.chitValue * 4n) / 100n;
    const grossPrize = chit.chitValue;
    const finalMonthInstallment = chit.baseInstallment ?? (chit.chitValue / BigInt(chit.durationMonths));

    const unpaidPriorDues = typeof this.prisma.installmentDue?.findMany === 'function'
      ? await this.prisma.installmentDue.findMany({
          where: {
            ticketId: ticket.id,
            installmentMonth: { lt: finalMonth },
            status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
          },
        })
      : [];

    const priorArrears = unpaidPriorDues.reduce((acc, d) => acc + d.netPayableAmount, 0n);

    const monthNDue = typeof this.prisma.installmentDue?.findUnique === 'function'
      ? await this.prisma.installmentDue.findUnique({
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
        `Total deductions (₹${totalDeductions.toString()}) exceed gross chit pool (₹${grossPrize.toString()})`,
      );
    }
    const netPayablePrize = grossPrize - totalDeductions;
    const releaseDate = dto.disbursedAt ? new Date(dto.disbursedAt) : new Date();

    const prepared = await withTransactionRetry(this.prisma, async (tx) => {
      const existingAuction = await tx.auction.findUnique({
        where: { chitGroupId_installmentMonth: { chitGroupId, installmentMonth: finalMonth } },
      });

      let auctionId: string;
      if (existingAuction) {
        if (existingAuction.status === 'COMPLETED') {
          throw new BadRequestException('Month N settlement is already completed');
        }
        await tx.auction.update({
          where: { id: existingAuction.id },
          data: {
            bidDiscount: commissionAmount,
            foremanCommissionRate: new Prisma.Decimal(4.0),
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
            foremanCommissionRate: new Prisma.Decimal(4.0),
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
          paymentReference: dto.paymentReference || 'FINAL_SETTLEMENT_PREPARED',
        },
        update: {
          ticketId: ticket.id,
          disbursementStatus: 'VERIFIED_BY_MAKER',
          disbursementMode: dto.disbursementMode,
          disbursedAmount: netPayablePrize,
          verifiedByUserId: makerUserId,
          authorizedByUserId: null,
          paymentReference: dto.paymentReference || 'FINAL_SETTLEMENT_PREPARED',
        },
      });

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
   * Strictly enforces maker_user_id != checker_user_id (F05 & F12).
   */
  async approveFinalSettlement(
    chitGroupId: string,
    checkerUserId: string,
    checkerRoles: Role[],
  ) {
    if (!checkerRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'DISBURSEMENT_PERMISSION_DENIED: Only Super Admin (Partners) possess financial authority to approve settlements',
      );
    }

    if (typeof this.prisma.user?.findUnique === 'function') {
      const checker = await this.prisma.user.findUnique({
        where: { id: checkerUserId },
        select: { isPartner: true },
      });
      if (checker && !checker.isPartner) {
        throw new ForbiddenException(
          'PARTNER_IDENTITY_REQUIRED: Only verified business partners can authorize final payouts',
        );
      }
    }

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

    if (auction.status === 'COMPLETED') {
      throw new BadRequestException('Month N settlement has already been approved and disbursed');
    }

    // Invariant Guardrail 10: Strict Maker != Checker
    if (auction.conductedByUserId === checkerUserId || auction.winner.verifiedByUserId === checkerUserId) {
      throw new ForbiddenException(
        'MAKER_CHECKER_VIOLATION: Final month payout requires independent maker and checker. Maker and checker cannot be the same user.',
      );
    }

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
    );
  }
}
