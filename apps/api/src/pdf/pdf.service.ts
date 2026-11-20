import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuctionStatus, DueStatus, PaymentStatus, Role } from '@prisma/client';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PRESIGNED_URL_EXPIRES_IN_SECONDS } from '../common/constants';
import {
  DAILY_MAINTENANCE_QUEUE,
  JOB_GENERATE_STATUTORY_PDF,
} from '../jobs/constants/queue-names.constant';
import { BullMqQueueProvider } from '../jobs/providers/bullmq-queue.provider';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentAccessHelper } from '../storage/helpers/document-access.helper';
import { StorageKeyHelper } from '../storage/helpers/storage-key.helper';
import { StorageService } from '../storage/storage.service';
import { FontResolverHelper } from './helpers/font-resolver.helper';
import { FormXviiMinutesTemplate } from './templates/form-xvii-minutes.template';
import { FormXxiPassbookTemplate } from './templates/form-xxi-passbook.template';
import { PayoutVoucherTemplate } from './templates/payout-voucher.template';
import { SubscriptionReceiptTemplate } from './templates/subscription-receipt.template';

/**
 * OWASP API3:2023 explicit customer allowlist for PDF generation —
 * prevents over-fetching sensitive fields (refreshTokenHash, fcmToken, panNumber, tokenRevokedBefore).
 */
const SAFE_PDF_CUSTOMER_SELECT = {
  id: true,
  customerCode: true,
  fullName: true,
  fullNameTamil: true,
  phone: true,
  addressLine1: true,
  city: true,
} as const;

export interface GeneratedPdfResult {
  buffer: Buffer;
  key: string;
  presignedUrl: string;
}

export interface AsyncPdfJobPayload {
  jobId: string;
  type: string;
  entityId: string;
  currentUser: JwtPayload;
  queuedAt?: string;
}

export interface AsyncPdfStatusResponse {
  jobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  type?: string;
  entityId?: string;
  key?: string;
  presignedUrl?: string;
  expiresInSeconds?: number;
  completedAt?: string;
  error?: string;
  failedAt?: string;
  queuedAt?: string;
  checkStatusUrl?: string;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly inMemoryStatusCache = new Map<
    string,
    { data: AsyncPdfStatusResponse; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    @Optional()
    @Inject(forwardRef(() => BullMqQueueProvider))
    private readonly bullMqProvider?: BullMqQueueProvider,
    @Optional()
    private readonly redisProvider?: RedisConnectionProvider,
  ) {}

  /**
   * Resolves and sanitizes the canonical Branch.code for storage paths & voucher numbers,
   * defaulting to 'PRD' when missing or stripped to empty.
   */
  private resolveBranchCode(branch?: { code?: string | null }): string {
    const cleaned = (branch?.code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');
    return cleaned || 'PRD';
  }

  private hasGlobalDocumentRole(user: JwtPayload): boolean {
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    return (
      roles.includes(Role.SUPER_ADMIN) ||
      roles.includes(Role.PARTNER) ||
      roles.includes(Role.ACCOUNTANT) ||
      roles.includes(Role.AUDITOR)
    );
  }

  /**
   * Pre-lookup caller eligibility & anti-oracle validation executed BEFORE `prisma.*.findUnique`.
   * Rejects empty roles, disallowed roles, missing/blank branchId (for BRANCH_MANAGER / COLLECTION_AGENT),
   * and missing/blank phone (for CUSTOMER) with 403 Forbidden before probing database UUIDs.
   */
  private assertPreLookupCallerEligibility(
    user: JwtPayload,
    options: {
      resourceLabel: string;
      allowCustomer: boolean;
      allowCollectionAgent: boolean;
    },
  ): void {
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    if (roles.length === 0) {
      throw new ForbiddenException(
        `Access denied: Unauthorized to view this ${options.resourceLabel}`,
      );
    }

    if (this.hasGlobalDocumentRole(user)) {
      return;
    }

    if (roles.includes(Role.BRANCH_MANAGER)) {
      if (!user.branchId?.trim()) {
        throw new ForbiddenException(
          `Access denied: Branch manager must have an assigned branch to access ${options.resourceLabel}`,
        );
      }
      return;
    }

    if (roles.includes(Role.COLLECTION_AGENT)) {
      if (!options.allowCollectionAgent) {
        throw new ForbiddenException(
          `Access denied: Field collection agents cannot access ${options.resourceLabel}`,
        );
      }
      if (!user.branchId?.trim()) {
        throw new ForbiddenException(
          `Access denied: Collection agents must have an assigned branch to access ${options.resourceLabel}`,
        );
      }
      return;
    }

    if (roles.includes(Role.CUSTOMER)) {
      if (!options.allowCustomer) {
        throw new ForbiddenException(
          `Access denied: Subscribers cannot access ${options.resourceLabel}`,
        );
      }
      if (!user.phone?.trim()) {
        throw new ForbiddenException(
          `Access denied: You can only download your own ${options.resourceLabel}`,
        );
      }
      return;
    }

    throw new ForbiddenException(
      `Access denied: Unauthorized to view this ${options.resourceLabel}`,
    );
  }

  /**
   * Defense-in-depth fail-closed branch & customer ownership verification on top of DocumentAccessHelper.
   * Ensures:
   * - Missing/empty roles always fail closed.
   * - BRANCH_MANAGER & COLLECTION_AGENT fail closed when user.branchId or resourceBranchId is null/undefined/blank or mismatches.
   * - CUSTOMER fails closed when user.phone or customer.phone is missing/mismatched (eliminating undefined === undefined bypass)
   *   and verifies customer.id === user.sub whenever customer.id is present.
   */
  private assertFailClosedBranchAndCustomer(
    user: JwtPayload,
    options: {
      resourceBranchId?: string | null;
      customer?: { id?: string | null; phone?: string | null } | null;
      resourceLabel: string;
      allowCollectionAgent?: boolean;
    },
  ): void {
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    if (roles.length === 0) {
      throw new ForbiddenException(`Access denied: Unauthorized to view this ${options.resourceLabel}`);
    }

    if (this.hasGlobalDocumentRole(user)) {
      return;
    }

    const userBranchId = user.branchId?.trim();
    const resourceBranchId = options.resourceBranchId?.trim();

    if (roles.includes(Role.BRANCH_MANAGER)) {
      if (!userBranchId || !resourceBranchId || resourceBranchId !== userBranchId) {
        throw new ForbiddenException(
          `Access denied: This ${options.resourceLabel} belongs to another branch office`,
        );
      }
      return;
    }

    if (roles.includes(Role.COLLECTION_AGENT)) {
      if (!options.allowCollectionAgent) {
        throw new ForbiddenException(
          `Access denied: Field collection agents cannot access ${options.resourceLabel}`,
        );
      }
      if (!userBranchId || !resourceBranchId || resourceBranchId !== userBranchId) {
        throw new ForbiddenException(
          `Access denied: Collection agents can only access ${options.resourceLabel} within their assigned branch`,
        );
      }
      return;
    }

    if (roles.includes(Role.CUSTOMER)) {
      const userPhone = user.phone?.trim();
      const custPhone = options.customer?.phone?.trim();
      const custId = options.customer?.id?.trim();
      if (!userPhone || !custPhone || custPhone !== userPhone) {
        throw new ForbiddenException(
          `Access denied: You can only download your own ${options.resourceLabel}`,
        );
      }
      if (custId && user.sub && custId !== user.sub) {
        throw new ForbiddenException(
          `Access denied: You can only download your own ${options.resourceLabel}`,
        );
      }
      return;
    }

    throw new ForbiddenException(`Access denied: Unauthorized to view this ${options.resourceLabel}`);
  }

  /**
   * Generates a bilingual subscription receipt PDF (A5 document), uploads to storage, and updates receipt.
   */
  async generateReceiptPdf(
    paymentId: string,
    requestingUser?: JwtPayload,
  ): Promise<GeneratedPdfResult> {
    if (requestingUser) {
      this.assertPreLookupCallerEligibility(requestingUser, {
        resourceLabel: 'subscription receipt',
        allowCustomer: true,
        allowCollectionAgent: true,
      });
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        receipt: true,
        reversal: true,
        recordedByUser: { select: { name: true } },
        allocations: {
          include: {
            due: true,
            ticket: {
              include: {
                chitGroup: {
                  include: {
                    branch: true,
                  },
                },
                customer: { select: SAFE_PDF_CUSTOMER_SELECT },
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment or receipt not found');
    }

    const firstAlloc = payment.allocations[0];

    // Enforce 6-persona ownership & fail-closed cross-branch scoping BEFORE receipt existence check
    // (eliminates 404 vs 403 receipt issuance status oracle)
    if (requestingUser) {
      DocumentAccessHelper.assertReceiptAccess(payment, requestingUser);
      this.assertFailClosedBranchAndCustomer(requestingUser, {
        resourceBranchId: payment.branchId || firstAlloc?.ticket?.chitGroup?.branchId,
        customer: firstAlloc?.ticket?.customer,
        resourceLabel: 'subscription receipt',
        allowCollectionAgent: true,
      });
    }

    if (!payment.receipt) {
      throw new NotFoundException('Payment or receipt not found');
    }

    // Never issue a receipt PDF for unverified INITIATED UPI claims or FAILED payments
    if (
      payment.paymentStatus &&
      payment.paymentStatus !== PaymentStatus.SUCCESS &&
      payment.paymentStatus !== PaymentStatus.REVERSED
    ) {
      throw new BadRequestException(
        `INVALID_PAYMENT_STATUS: Subscription receipt PDF can only be generated for SUCCESS or REVERSED payments (current: ${payment.paymentStatus})`,
      );
    }

    const isCancelled = payment.paymentStatus === PaymentStatus.REVERSED;
    const cachedKey = payment.receipt.pdfS3Key;
    const hasMatchingCache =
      Boolean(cachedKey) &&
      (isCancelled
        ? cachedKey!.endsWith('-cancelled.pdf')
        : !cachedKey!.endsWith('-cancelled.pdf'));

    // If receipt PDF has already been generated and persisted to S3/storage, return directly
    // KFC-PDF-001: Reversed payments must return watermarked cancelled PDF (bypass pre-reversal cache)
    if (hasMatchingCache && cachedKey) {
      try {
        const file = await this.storageService.getFile(cachedKey);
        const presignedUrl = await this.storageService.getPresignedUrl(
          cachedKey,
          PRESIGNED_URL_EXPIRES_IN_SECONDS,
        );
        return { buffer: file.buffer, key: cachedKey, presignedUrl };
      } catch {
        // Transparent fallback: if stored object was pruned or missing, regenerate dynamically below
      }
    }

    if (!firstAlloc) {
      throw new BadRequestException('Payment has no ticket allocations');
    }

    const ticket = firstAlloc.ticket;
    const chit = ticket.chitGroup;
    const due = firstAlloc.due;
    const customer = ticket.customer;
    const formattedAddress = [customer.addressLine1, customer.city]
      .filter((part) => typeof part === 'string' && part.trim().length > 0)
      .join(', ');

    const buffer = await SubscriptionReceiptTemplate.generate({
      receiptNumber: payment.receipt.receiptNumber,
      date: payment.createdAt,
      groupCode: chit.groupCode,
      installmentMonth: due.installmentMonth,
      durationMonths: chit.durationMonths,
      ticketNumber: ticket.ticketNumber,
      subscriberName: customer.fullName,
      subscriberNameTamil: customer.fullNameTamil,
      address: formattedAddress || undefined,
      phone: customer.phone,
      baseInstallment: due.grossAmount,
      dividendDeduction: due.dividendDeduction,
      netPayableAmount: due.netPayableAmount,
      amountPaid: payment.amount,
      paymentMethod: payment.paymentMethod,
      collectedByName: payment.recordedByUser?.name || 'Branch Staff',
      branchName: chit.branch?.name,
      branchAddress: chit.branch?.address,
      branchPhone: chit.branch?.phone,
      isCancelled,
      reversalReason: payment.reversal?.reason || null,
      reversedAt: payment.reversal?.reversedAt || null,
    });

    const year = FontResolverHelper.getIstYear(payment.createdAt);
    const branchCode = this.resolveBranchCode(chit.branch);
    const baseKey = StorageKeyHelper.receiptPdf(branchCode, year, payment.receipt.receiptNumber);
    const key = isCancelled ? baseKey.replace(/\.pdf$/i, '-cancelled.pdf') : baseKey;

    const upload = await this.storageService.uploadFile(key, buffer, 'application/pdf');

    // Update receipt with S3 storage key
    await this.prisma.receipt.update({
      where: { id: payment.receipt.id },
      data: { pdfS3Key: upload.key },
    });

    const presignedUrl = await this.storageService.getPresignedUrl(
      upload.key,
      PRESIGNED_URL_EXPIRES_IN_SECONDS,
    );

    return { buffer, key: upload.key, presignedUrl };
  }

  /**
   * Generates a bilingual prize payout voucher PDF, uploads to storage, and returns presigned URL.
   * Aligns strictly with Module 6 canonical voucher format: KC-VOU-{BRANCH}-{YEAR}-{GROUP}-{MMMMM}
   * and full arrears offset breakdown.
   */
  async generatePayoutVoucherPdf(
    auctionId: string,
    requestingUser: JwtPayload,
  ): Promise<GeneratedPdfResult> {
    // Pre-lookup caller & anti-oracle guard before probing DB
    this.assertPreLookupCallerEligibility(requestingUser, {
      resourceLabel: 'prize disbursement vouchers',
      allowCustomer: true,
      allowCollectionAgent: false,
    });

    const winner = await this.prisma.auctionWinner.findUnique({
      where: { auctionId },
      include: {
        auction: {
          include: {
            chitGroup: {
              include: { branch: true },
            },
          },
        },
        ticket: {
          include: { customer: { select: SAFE_PDF_CUSTOMER_SELECT } },
        },
      },
    });

    if (!winner) {
      throw new NotFoundException('Prize winner not found or prize payout not yet released');
    }

    // Enforce 6-persona ownership & fail-closed branch isolation BEFORE status check
    // (prevents unauthorized callers from probing disbursement status via 404 vs 403 oracle)
    DocumentAccessHelper.assertVoucherAccess(winner, requestingUser);
    this.assertFailClosedBranchAndCustomer(requestingUser, {
      resourceBranchId: winner.auction?.chitGroup?.branchId,
      customer: winner.ticket?.customer,
      resourceLabel: 'prize payout voucher',
      allowCollectionAgent: false,
    });

    if (winner.disbursementStatus !== 'DISBURSED') {
      throw new NotFoundException('Prize winner not found or prize payout not yet released');
    }

    const auction = winner.auction;
    const chit = auction.chitGroup;
    const ticket = winner.ticket;
    const customer = ticket.customer;

    const [verifiedUser, authorizedUser] = await Promise.all([
      winner.verifiedByUserId
        ? this.prisma.user.findUnique({ where: { id: winner.verifiedByUserId }, select: { name: true } })
        : null,
      winner.authorizedByUserId
        ? this.prisma.user.findUnique({ where: { id: winner.authorizedByUserId }, select: { name: true } })
        : null,
    ]);

    // Module 6 Voucher Parity (CR-DISB-08): Canonical KC-VOU-{BRANCH}-{YEAR}-{GROUP}-{MMMMM}
    const voucherDate = winner.disbursedAt ?? auction.auctionDate ?? new Date();
    const branchCode = this.resolveBranchCode(chit.branch);
    const year = FontResolverHelper.getIstYear(voucherDate);
    const sanitizedGroupCode =
      (chit.groupCode || 'CHIT')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '') || 'CHIT';
    const sequence = String(auction.installmentMonth).padStart(5, '0');
    const voucherNumber = `KC-VOU-${branchCode}-${year}-${sanitizedGroupCode}-${sequence}`;

    // Pure BigInt financial breakdown with arrears offset parity (FIN-A / FIN-B)
    const bidDiscount = auction.bidDiscount ?? 0n;
    const grossPrizeMoney = auction.prizeMoney ?? (chit.chitValue - bidDiscount);
    const netPrizeMoney = winner.disbursedAmount ?? grossPrizeMoney;
    const arrearsDeducted =
      grossPrizeMoney > netPrizeMoney ? grossPrizeMoney - netPrizeMoney : 0n;

    const buffer = await PayoutVoucherTemplate.generate({
      voucherNumber,
      disbursedAt: voucherDate,
      groupCode: chit.groupCode,
      chitValue: chit.chitValue,
      installmentMonth: auction.installmentMonth,
      auctionDate: auction.auctionDate,
      ticketNumber: ticket.ticketNumber,
      winnerCode: customer.customerCode,
      winnerName: customer.fullName,
      winnerNameTamil: customer.fullNameTamil,
      phone: customer.phone,
      bidDiscount,
      grossPrizeMoney,
      arrearsDeducted,
      foremanCommissionRate: auction.foremanCommissionRate ?? chit.foremanCommissionRate,
      foremanCommissionAmount: auction.foremanCommissionAmount ?? undefined,
      netPrizeMoney,
      disbursementMode: winner.disbursementMode || 'CASH',
      paymentReference: winner.paymentReference || 'N/A',
      agreementSigned: winner.agreementSigned,
      nomineeSigned: winner.nomineeSigned,
      isSecurityRequired: winner.isSecurityRequired,
      securityType: winner.securityType,
      blankChequeDetails: winner.blankChequeDetails,
      verifiedByUserName: verifiedUser?.name || 'Authorized Staff',
      authorizedByUserName: authorizedUser?.name || 'Managing Partner',
      branchName: chit.branch?.name,
      branchAddress: chit.branch?.address,
    });

    const key = StorageKeyHelper.voucherPdf(branchCode, year, voucherNumber);

    const upload = await this.storageService.uploadFile(key, buffer, 'application/pdf');
    const presignedUrl = await this.storageService.getPresignedUrl(
      upload.key,
      PRESIGNED_URL_EXPIRES_IN_SECONDS,
    );

    return { buffer, key: upload.key, presignedUrl };
  }

  /**
   * Generates Form XVII statutory auction minutes PDF and saves to storage.
   */
  async generateAuctionMinutesPdf(
    auctionId: string,
    requestingUser: JwtPayload,
  ): Promise<GeneratedPdfResult> {
    // Pre-lookup caller & anti-oracle guard before probing DB (internal statutory record)
    this.assertPreLookupCallerEligibility(requestingUser, {
      resourceLabel: 'internal statutory auction minutes',
      allowCustomer: false,
      allowCollectionAgent: false,
    });

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        chitGroup: { include: { branch: true } },
        winner: {
          include: { ticket: { include: { customer: { select: SAFE_PDF_CUSTOMER_SELECT } } } },
        },
        tieBidders: {
          include: { ticket: { include: { customer: { select: SAFE_PDF_CUSTOMER_SELECT } } } },
          orderBy: { tokenNumber: 'asc' },
        },
        minutes: true,
      },
    });

    if (!auction) {
      throw new NotFoundException('Finalized auction or winner not found');
    }

    // Enforce 6-persona ownership & fail-closed cross-branch isolation BEFORE status/winner checks
    // (eliminates cross-branch auction status oracle)
    DocumentAccessHelper.assertMinutesAccess(auction, requestingUser);
    this.assertFailClosedBranchAndCustomer(requestingUser, {
      resourceBranchId: auction.chitGroup?.branchId,
      resourceLabel: 'statutory auction minutes',
      allowCollectionAgent: false,
    });

    if (!auction.winner) {
      throw new NotFoundException('Finalized auction or winner not found');
    }

    // Fail closed if auction has not been finalized (SCHEDULED auctions may hold a tentative winner)
    if (
      auction.status !== AuctionStatus.COMPLETED &&
      auction.status !== AuctionStatus.MINUTES_FILED
    ) {
      throw new BadRequestException(
        'AUCTION_NOT_FINALIZED: Form XVII statutory minutes can only be generated for finalized auctions',
      );
    }

    // Guardrail 5: Auctions occur exclusively in Months 2 through N-1 (no auctions in Month 1 or Month N)
    if (
      auction.installmentMonth < 2 ||
      auction.installmentMonth >= auction.chitGroup.durationMonths
    ) {
      throw new BadRequestException(
        'STATUTORY_AUCTION_MONTH_INVALID: Form XVII auction minutes apply exclusively to auction months 2 through N-1',
      );
    }

    const chit = auction.chitGroup;
    const winnerTicket = auction.winner.ticket;
    const winnerCustomer = winnerTicket.customer;

    const buffer = await FormXviiMinutesTemplate.generate({
      groupCode: chit.groupCode,
      groupName: chit.groupName,
      chitValue: chit.chitValue,
      durationMonths: chit.durationMonths,
      baseInstallment: chit.baseInstallment,
      sanctionOrderNumber: chit.sanctionOrderNumber,
      installmentMonth: auction.installmentMonth,
      auctionDate: auction.auctionDate,
      bidDiscount: auction.bidDiscount ?? 0n,
      foremanCommissionRate: auction.foremanCommissionRate ?? chit.foremanCommissionRate,
      foremanCommissionAmount: auction.foremanCommissionAmount ?? 0n,
      totalDividend: auction.totalDividend ?? 0n,
      dividendPerTicket: auction.dividendPerTicket ?? 0n,
      nextMonthNetInstallment: chit.baseInstallment - (auction.dividendPerTicket ?? 0n),
      prizeMoney: auction.prizeMoney ?? (chit.chitValue - (auction.bidDiscount ?? 0n)),
      winnerTicketNumber: winnerTicket.ticketNumber,
      winnerName: winnerCustomer.fullName,
      winnerNameTamil: winnerCustomer.fullNameTamil,
      winnerCustomerCode: winnerCustomer.customerCode,
      winnerPhone: winnerCustomer.phone,
      wasTieBreakWinner: auction.winner.wasTieBreakWinner,
      tiedBidders: auction.tieBidders.map((tb) => ({
        ticketNumber: tb.ticket.ticketNumber,
        customerName: tb.ticket.customer.fullName,
        tokenNumberDrawn: tb.tokenNumber,
        isWinner: tb.isWinner,
      })),
      subscribersPresent: auction.minutes?.subscribersPresent || 0,
      minutesText: auction.minutes?.minutesText || 'Minutes pending entry',
      signedByForeman: auction.minutes?.signedByForeman || false,
      branchName: chit.branch?.name,
      branchAddress: chit.branch?.address,
    });

    const key = StorageKeyHelper.auctionMinutesPdf(chit.id, auction.installmentMonth);
    const upload = await this.storageService.uploadFile(key, buffer, 'application/pdf');
    const presignedUrl = await this.storageService.getPresignedUrl(
      upload.key,
      PRESIGNED_URL_EXPIRES_IN_SECONDS,
    );

    return { buffer, key: upload.key, presignedUrl };
  }

  /**
   * Generates Form XXI subscriber passbook ledger PDF and saves to storage.
   */
  async generatePassbookPdf(
    ticketId: string,
    requestingUser: JwtPayload,
  ): Promise<GeneratedPdfResult> {
    // Pre-lookup caller & anti-oracle guard before probing DB
    this.assertPreLookupCallerEligibility(requestingUser, {
      resourceLabel: 'member passbook statements',
      allowCustomer: true,
      allowCollectionAgent: false,
    });

    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: ticketId },
      include: {
        customer: { select: SAFE_PDF_CUSTOMER_SELECT },
        chitGroup: { include: { branch: true } },
        winningAuction: {
          select: {
            paymentReference: true,
            disbursedAt: true,
          },
        },
        dues: {
          orderBy: { installmentMonth: 'asc' },
          include: {
            allocations: {
              include: {
                payment: {
                  include: { receipt: true },
                },
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Subscriber ticket not found');
    }

    // Enforce 6-persona ownership & fail-closed cross-branch isolation
    DocumentAccessHelper.assertPassbookAccess(ticket, requestingUser);
    this.assertFailClosedBranchAndCustomer(requestingUser, {
      resourceBranchId: ticket.chitGroup?.branchId,
      customer: ticket.customer,
      resourceLabel: 'passbook statement',
      allowCollectionAgent: false,
    });

    // KC-09 parity: resolve verified Prize Arrears Offset provenance from immutable AuditLog
    // for PAID dues that have no direct SUCCESS payment allocation
    const paidDueIdsWithoutAlloc = ticket.dues
      .filter((d) => {
        if (d.status !== DueStatus.PAID || !d.id) return false;
        const hasSuccessAlloc = (d.allocations ?? []).some(
          (a) =>
            a.payment &&
            (a.payment.paymentStatus === PaymentStatus.SUCCESS ||
              a.payment.paymentStatus === undefined),
        );
        return !hasSuccessAlloc;
      })
      .map((d) => d.id);

    const offsetAuditLogs =
      paidDueIdsWithoutAlloc.length > 0 &&
      typeof this.prisma.auditLog?.findMany === 'function'
        ? (await this.prisma.auditLog.findMany({
            where: {
              entityType: 'InstallmentDue',
              action: 'PRIZE_ARREARS_OFFSET_ALLOCATED',
              entityId: { in: paidDueIdsWithoutAlloc },
            },
            select: {
              entityId: true,
              timestamp: true,
              newValue: true,
            },
          })) ?? []
        : [];
    const offsetLogByDueId = new Map(
      offsetAuditLogs.map((log) => [log.entityId, log]),
    );

    let totalGrossDue = 0n;
    let totalDividendCredit = 0n;
    let totalNetPayable = 0n;
    let totalPaid = 0n;
    let totalOutstandingArrears = 0n;

    const schedule = ticket.dues.map((d) => {
      totalGrossDue += d.grossAmount;
      totalDividendCredit += d.dividendDeduction;
      totalNetPayable += d.netPayableAmount;
      totalPaid += d.paidAmount;

      const unpaidDue = d.status !== 'PAID' ? d.netPayableAmount - d.paidAmount : 0n;
      if (unpaidDue > 0n) {
        totalOutstandingArrears += unpaidDue;
      }

      // Emit paymentDate & receiptNumber strictly when due is PAID and backed by a SUCCESS payment
      // or a verified PRIZE_ARREARS_OFFSET_ALLOCATED audit record (KC-09 parity)
      const activeAlloc =
        d.status === DueStatus.PAID
          ? (d.allocations ?? []).find(
              (a) =>
                a.payment?.paymentStatus === PaymentStatus.SUCCESS ||
                a.payment?.paymentStatus === undefined,
            )
          : undefined;
      const offsetLog = d.id ? offsetLogByDueId.get(d.id) : undefined;

      let paymentDate: Date | null = null;
      let receiptNumber: string | null = null;

      if (d.status === DueStatus.PAID && activeAlloc) {
        paymentDate = activeAlloc.payment?.createdAt || null;
        receiptNumber = activeAlloc.payment?.receipt?.receiptNumber || null;
      } else if (d.status === DueStatus.PAID && offsetLog) {
        paymentDate = offsetLog.timestamp;
        const voucherRef = (
          ticket as { winningAuction?: { paymentReference?: string | null } | null }
        ).winningAuction?.paymentReference;
        receiptNumber = voucherRef ? `OFFSET-${voucherRef}` : 'PRIZE-OFFSET';
      }

      return {
        installmentMonth: d.installmentMonth,
        dueDate: d.dueDate,
        grossAmount: d.grossAmount,
        dividendDeduction: d.dividendDeduction,
        netPayableAmount: d.netPayableAmount,
        paidAmount: d.paidAmount,
        status: d.status,
        paymentDate,
        receiptNumber,
      };
    });

    const chit = ticket.chitGroup;
    const customer = ticket.customer;

    const buffer = await FormXxiPassbookTemplate.generate({
      groupCode: chit.groupCode,
      groupName: chit.groupName,
      chitValue: chit.chitValue,
      durationMonths: chit.durationMonths,
      baseInstallment: chit.baseInstallment,
      ticketNumber: ticket.ticketNumber,
      isPrized: ticket.isPrized,
      customerCode: customer.customerCode,
      customerName: customer.fullName,
      customerNameTamil: customer.fullNameTamil,
      phone: customer.phone,
      totalGrossDue,
      totalDividendCredit,
      totalNetPayable,
      totalPaid,
      totalOutstandingArrears,
      schedule,
      branchAddress: (chit as { branch?: { address?: string | null } }).branch?.address,
    });

    const key = `passbooks/${chit.id}/ticket-${ticket.ticketNumber}.pdf`;
    const upload = await this.storageService.uploadFile(key, buffer, 'application/pdf');
    const presignedUrl = await this.storageService.getPresignedUrl(
      upload.key,
      PRESIGNED_URL_EXPIRES_IN_SECONDS,
    );

    return { buffer, key: upload.key, presignedUrl };
  }

  /**
   * Internal helper to persist PDF job status to Redis (TTL 3600s) with in-memory fallback.
   */
  private async saveStatus(
    jobId: string,
    data: AsyncPdfStatusResponse,
    ttlSeconds = 3600,
  ): Promise<void> {
    const redisKey = `pdf:status:${jobId}`;
    this.inMemoryStatusCache.set(jobId, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    try {
      const client = this.redisProvider?.getClient();
      if (client && this.redisProvider?.getIsConnected()) {
        await client.set(redisKey, JSON.stringify(data), 'EX', ttlSeconds);
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to persist PDF job status to Redis for ${jobId}: ${err.message}`,
      );
    }
  }

  /**
   * Internal helper to read PDF job status from Redis or in-memory fallback.
   */
  private async readStatus(jobId: string): Promise<AsyncPdfStatusResponse | null> {
    const redisKey = `pdf:status:${jobId}`;
    try {
      const client = this.redisProvider?.getClient();
      if (client && this.redisProvider?.getIsConnected()) {
        const raw = await client.get(redisKey);
        if (raw) {
          return JSON.parse(raw) as AsyncPdfStatusResponse;
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to read PDF job status from Redis for ${jobId}: ${err.message}`,
      );
    }

    const cached = this.inMemoryStatusCache.get(jobId);
    if (cached) {
      if (Date.now() <= cached.expiresAt) {
        return cached.data;
      }
      this.inMemoryStatusCache.delete(jobId);
    }

    return null;
  }

  /**
   * BullMQ background worker processor for asynchronous statutory PDF generation (PERF-01).
   * Renders the requested PDF off the main event loop, uploads to private storage,
   * and persists job completion status with 15-minute presigned URL to Redis (TTL 3600s).
   */
  async processAsyncPdfJob(payload: AsyncPdfJobPayload): Promise<AsyncPdfStatusResponse> {
    try {
      let result: GeneratedPdfResult;
      const normalizedType = (payload.type || '').toUpperCase();

      switch (normalizedType) {
        case 'PASSBOOK':
        case 'FORM_XXI':
          result = await this.generatePassbookPdf(payload.entityId, payload.currentUser);
          break;
        case 'MINUTES':
        case 'FORM_XVII':
          result = await this.generateAuctionMinutesPdf(payload.entityId, payload.currentUser);
          break;
        case 'RECEIPT':
          result = await this.generateReceiptPdf(payload.entityId, payload.currentUser);
          break;
        case 'VOUCHER':
          result = await this.generatePayoutVoucherPdf(payload.entityId, payload.currentUser);
          break;
        default:
          throw new BadRequestException(
            `Unsupported asynchronous PDF generation type: ${payload.type}`,
          );
      }

      const completedStatus: AsyncPdfStatusResponse = {
        jobId: payload.jobId,
        status: 'COMPLETED',
        key: result.key,
        presignedUrl: result.presignedUrl,
        expiresInSeconds: PRESIGNED_URL_EXPIRES_IN_SECONDS,
        completedAt: new Date().toISOString(),
      };

      await this.saveStatus(payload.jobId, completedStatus, 3600);
      return completedStatus;
    } catch (err: any) {
      const failedStatus: AsyncPdfStatusResponse = {
        jobId: payload.jobId,
        status: 'FAILED',
        error: err?.message || 'Unknown PDF generation error',
        failedAt: new Date().toISOString(),
      };

      await this.saveStatus(payload.jobId, failedStatus, 3600);
      throw err;
    }
  }

  /**
   * Enqueues an asynchronous statutory PDF generation task onto BullMQ (PERF-01).
   * Guards caller eligibility before enqueuing to prevent queue exhaustion by unauthorized requests.
   */
  async enqueueAsyncPdfGeneration(
    type: string,
    entityId: string,
    currentUser: JwtPayload,
  ): Promise<{ jobId: string; status: string; checkStatusUrl: string }> {
    const jobId = randomUUID();
    const checkStatusUrl = `/api/v1/pdf/async/status/${jobId}`;

    const normalizedType = (type || '').toUpperCase();
    if (normalizedType === 'PASSBOOK' || normalizedType === 'FORM_XXI') {
      this.assertPreLookupCallerEligibility(currentUser, {
        resourceLabel: 'member passbook statements',
        allowCustomer: true,
        allowCollectionAgent: false,
      });
    }

    const initialStatus: AsyncPdfStatusResponse = {
      jobId,
      status: 'QUEUED',
      type,
      entityId,
      queuedAt: new Date().toISOString(),
    };

    await this.saveStatus(jobId, initialStatus, 3600);

    const payload: AsyncPdfJobPayload = {
      jobId,
      type,
      entityId,
      currentUser,
      queuedAt: initialStatus.queuedAt,
    };

    if (this.bullMqProvider) {
      await this.bullMqProvider.addJob(
        DAILY_MAINTENANCE_QUEUE,
        JOB_GENERATE_STATUTORY_PDF,
        payload,
        { jobId },
      );
    } else {
      // In-process direct fallback if BullMQ provider is absent
      await this.processAsyncPdfJob(payload).catch((err) => {
        this.logger.warn(`In-process async PDF generation fallback error: ${err.message}`);
      });
    }

    const currentStatus = await this.readStatus(jobId);

    return {
      jobId,
      status: currentStatus?.status || 'QUEUED',
      checkStatusUrl,
    };
  }

  /**
   * Retrieves the current status (QUEUED, COMPLETED, FAILED) of an asynchronous PDF job from Redis.
   */
  async getAsyncPdfStatus(jobId: string): Promise<AsyncPdfStatusResponse> {
    const data = await this.readStatus(jobId);
    if (!data) {
      throw new NotFoundException(`PDF generation job ${jobId} not found or expired`);
    }
    return data;
  }
}
