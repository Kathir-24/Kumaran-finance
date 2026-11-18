import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DueStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { BullMqQueueProvider } from '../jobs/providers/bullmq-queue.provider';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import {
  JOB_DISPATCH_APPROVAL_ALERT,
  JOB_DISPATCH_PAYMENT_RECEIPT,
  NOTIFICATION_QUEUE,
} from '../jobs/constants/queue-names.constant';
import type { ApprovalAlertJobPayload } from '../jobs/dto/job-payloads.dto';
import { formatBilingualReceiptText, ReceiptDataInput } from './bilingual-receipt.helper';
import {
  computeMaxConsecutiveUnpaidMonths,
  deriveTicketArrearsStatus,
} from '../common/utils/arrears.util';
import { assertVerifiedPartner } from '../common/utils/partner-identity.util';
import {
  acquirePaymentConcurrencyLocks,
  generateNextReceiptNumber,
  PAYMENT_TRANSACTION_OPTIONS,
} from '../common/utils/receipt-sequence.util';
import { lockPaymentAndReversalRows } from '../common/utils/state-transition-lock.util';
import { withTransactionRetry } from '../common/utils/transaction-retry.util';
import { toWholeRupeeBigInt } from '../common/utils/whole-rupee.util';
import { ApproveReversalDto } from './dto/approve-reversal.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { RejectReversalDto } from './dto/reject-reversal.dto';
import { RequestReversalDto } from './dto/request-reversal.dto';
import { SubmitUpiClaimDto, VerifyUpiClaimDto } from './dto/submit-upi-claim.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly queueProvider?: BullMqQueueProvider,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {}

  private async invalidateDaybookCache(branchId?: string, paymentDate?: Date): Promise<void> {
    const redis = this.redisProvider?.getClient();
    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const dateStr = paymentDate
          ? paymentDate.toISOString().split('T')[0]
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
        this.logger.warn(`Failed to invalidate daybook cache: ${err.message}`);
      }
    }
  }

  /**
   * Helper to resolve customer ID for a authenticated user by phone.
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
   * Records office-counter or direct customer payment.
   * Enforces ADR-07: Single discrete payment matching exact net installment (Inet).
   * Generates sequential bilingual receipt and updates dues.
   */
  async recordPayment(
    dto: CreatePaymentDto,
    recordedByUserId: string,
    staffBranchId?: string | null,
  ) {
    // 1. Idempotency Check (Pre-Authorization Guard F09)
    if (dto.idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: {
          allocations: { include: { due: true, ticket: true } },
          receipt: true,
          reversal: true,
        },
      });

      if (existing) {
        if (
          staffBranchId &&
          existing.branchId &&
          staffBranchId !== existing.branchId
        ) {
          throw new ForbiddenException('Access denied: Unauthorized idempotency replay from another branch');
        }

        if (existing.recordedByUserId !== recordedByUserId) {
          throw new ForbiddenException(
            'Access denied: You can only query or replay your own payment records',
          );
        }

        return {
          duplicateIgnored: true,
          message: 'Payment already recorded with this idempotency key',
          payment: existing,
        };
      }
    }

    // 2. Validate Subscriber Ticket and Scheme State
    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: dto.ticketId },
      include: {
        customer: true,
        chitGroup: { include: { branch: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Subscriber ticket not found');
    }

    if (ticket.chitGroup.status !== 'ACTIVE') {
      throw new BadRequestException('Chit scheme is not active');
    }

    if (ticket.status === 'REMOVED_DEF_3M') {
      throw new BadRequestException(
        'Subscriber ticket has been removed from this chit scheme due to consecutive arrears',
      );
    }

    // Cross-Branch Invariant (F09): Ensure caller does not record payments in another branch
    if (staffBranchId && ticket.chitGroup.branchId && staffBranchId !== ticket.chitGroup.branchId) {
      throw new ForbiddenException(
        'CROSS_BRANCH_FORBIDDEN: You cannot record payments for chit groups belonging to another branch',
      );
    }

    // 3. Find Target Installment Due
    const due = await this.prisma.installmentDue.findUnique({
      where: {
        ticketId_installmentMonth: {
          ticketId: dto.ticketId,
          installmentMonth: dto.installmentMonth,
        },
      },
    });

    if (!due) {
      throw new NotFoundException(
        `Installment due for Month ${dto.installmentMonth} has not been generated for this ticket`,
      );
    }

    // 4. ADR-07 Invariant Guard: Zero Double Payments
    if (due.status === DueStatus.PAID) {
      throw new BadRequestException(
        `INSTALLMENT_ALREADY_PAID: Month ${dto.installmentMonth} installment has already been paid in full`,
      );
    }

    // 5. ADR-07 Invariant Guard: Zero Partial Payments (Exact Inet Matching)
    const paymentAmount = toWholeRupeeBigInt(dto.amount, 'Payment amount', { min: 1n });
    if (paymentAmount !== due.netPayableAmount) {
      throw new BadRequestException(
        `PARTIAL_PAYMENTS_NOT_ALLOWED: Payment must exactly match the net installment due of ₹${due.netPayableAmount.toString()} (received: ₹${paymentAmount.toString()})`,
      );
    }

    // 5a. Sequential Installment Payment Guard (ADR-07): Prevent Out-of-Order Payments
    if (typeof this.prisma.installmentDue?.findFirst === 'function') {
      const priorUnpaidDuePre = await this.prisma.installmentDue.findFirst({
        where: {
          ticketId: ticket.id,
          installmentMonth: { lt: due.installmentMonth },
          status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
        },
        orderBy: { installmentMonth: 'asc' },
      });
      if (priorUnpaidDuePre) {
        throw new BadRequestException(
          `PRIOR_INSTALLMENT_UNPAID: Month ${priorUnpaidDuePre.installmentMonth} installment must be settled before paying Month ${due.installmentMonth}.`,
        );
      }
    }

    // Accounting Branch (F09): Strictly derived from authorized domain record
    const branchId = ticket.chitGroup.branchId;
    const lockBranchId = ticket.chitGroup.branchId;
    const branchCode = ticket.chitGroup.branch?.code || 'PRD';
    const year = new Date().getFullYear();

    // 6. Prefix for Sequential Bilingual Receipt Number: KC-REC-PRD-YYYY-XXXXX
    const prefix = `KC-REC-${branchCode}-${year}-`;

    const cashHandoverStatus =
      dto.paymentMethod === PaymentMethod.CASH
        ? 'PENDING_HANDOVER'
        : 'ACKNOWLEDGED';

    const paymentDate = dto.collectedAt ? new Date(dto.collectedAt) : new Date();

    let result: any;
    try {
      result = await withTransactionRetry(this.prisma, async (tx) => {
        // 0. Pessimistic Row Lock (Branch -> SubscriberTicket -> InstallmentDue) to serialize receipt/arrears & block duplicates
        const { lockedDues } = await acquirePaymentConcurrencyLocks(tx, {
          branchId: lockBranchId,
          ticketIds: [ticket.id],
          dueIds: [due.id],
        });
        const lockedDue = lockedDues[0];
        if (lockedDue && lockedDue.status === DueStatus.PAID) {
          throw new BadRequestException(
            `INSTALLMENT_ALREADY_PAID: Month ${dto.installmentMonth} installment has already been paid in full`,
          );
        }

        // Sequential Installment Payment Guard under transaction lock
        if (typeof tx.installmentDue?.findFirst === 'function') {
          const priorUnpaidDue = await tx.installmentDue.findFirst({
            where: {
              ticketId: ticket.id,
              installmentMonth: { lt: due.installmentMonth },
              status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
            },
            orderBy: { installmentMonth: 'asc' },
          });
          if (priorUnpaidDue) {
            throw new BadRequestException(
              `PRIOR_INSTALLMENT_UNPAID: Month ${priorUnpaidDue.installmentMonth} installment must be settled before paying Month ${due.installmentMonth}.`,
            );
          }
        }

        // 1. Create Payment
        const payment = await tx.payment.create({
          data: {
            branchId,
            recordedByUserId,
            customerId: ticket.customerId,
            amount: paymentAmount,
            paymentMethod: dto.paymentMethod,
            paymentStatus: PaymentStatus.SUCCESS,
            idempotencyKey: dto.idempotencyKey || null,
            transactionRef: dto.transactionRef || null,
            cashHandoverStatus,
            notes: dto.notes?.trim() || null,
            createdAt: paymentDate,
          },
        });

        // 2. Create PaymentAllocation (Maps Payment to discrete InstallmentDue)
        const allocation = await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            ticketId: ticket.id,
            installmentDueId: due.id,
            amountAllocated: paymentAmount,
          },
        });

        // 3. Create Bilingual Receipt strictly inside the locked Branch transaction
        const finalReceiptNumber = await generateNextReceiptNumber(tx, prefix);

        const receipt = await tx.receipt.create({
          data: {
            branchId,
            paymentId: payment.id,
            receiptNumber: finalReceiptNumber,
            isBilingual: true,
            issuedAt: paymentDate,
          },
        });

        // 4. Update InstallmentDue to PAID
        await tx.installmentDue.update({
          where: { id: due.id },
          data: {
            status: DueStatus.PAID,
            paidAmount: paymentAmount,
          },
        });

      // 5. Recalculate Consecutive Arrears (ADR-07 canonical longest contiguous unpaid streak)
      const allDues = await tx.installmentDue.findMany({
        where: {
          ticketId: ticket.id,
        },
        orderBy: { installmentMonth: 'desc' },
      });

      const consecutiveUnpaid = computeMaxConsecutiveUnpaidMonths(allDues, {
        treatAsPaidIds: [due.id],
      });

      await tx.subscriberTicket.update({
        where: { id: ticket.id },
        data: {
          consecutiveUnpaidMonths: consecutiveUnpaid,
          status: deriveTicketArrearsStatus(consecutiveUnpaid, ticket.status),
        },
      });

      return {
        payment,
        allocation,
        receipt,
        dueStatus: DueStatus.PAID,
        paidAmount: paymentAmount,
        netPayableAmount: due.netPayableAmount,
      };
    }, undefined, PAYMENT_TRANSACTION_OPTIONS);
    } catch (err: any) {
      if (err.code === 'P2002') {
        const targetStr = String(err.meta?.target || '');
        if (targetStr.includes('transactionRef')) {
          throw new ConflictException(
            `DUPLICATE_TRANSACTION_REF: The bank UTR / transaction reference "${dto.transactionRef}" has already been recorded in another payment.`,
          );
        }
        if (dto.idempotencyKey && targetStr.includes('idempotencyKey')) {
          const existing = await this.prisma.payment.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: {
              allocations: { include: { due: true, ticket: true } },
              receipt: true,
              reversal: true,
            },
          });
          if (existing) {
            return {
              duplicateIgnored: true,
              message: 'Payment already recorded with this idempotency key',
              payment: existing,
            };
          }
        }
      }
      throw err;
    }

    if (this.queueProvider) {
      try {
        await this.queueProvider.addJob(
          NOTIFICATION_QUEUE,
          JOB_DISPATCH_PAYMENT_RECEIPT,
          {
            recipientPhone: ticket.customer.phone,
            fcmToken: ticket.customer.fcmToken || undefined,
            amountPaid: paymentAmount.toString(),
            chitCode: ticket.chitGroup.groupCode,
            ticketNumber: ticket.ticketNumber,
            receiptNumber: result.receipt.receiptNumber,
            transactionTimestamp: paymentDate.toISOString(),
            passbookAppUrl: `https://app.kumaranfinance.in/passbook/${ticket.id}`,
          },
          {
            jobId: `receipt-${result.receipt.receiptNumber}`,
            priority: 1,
          },
        );
      } catch (queueErr: any) {
        this.logger.warn(
          `Failed to enqueue payment receipt job for receipt ${result.receipt.receiptNumber}: ${queueErr.message}`,
        );
      }
    }

    this.invalidateDaybookCache(branchId, paymentDate).catch(() => {});

    return result;
  }

  /**
   * Retrieves single payment by ID with role-based scoping.
   */
  async getPaymentById(id: string, requestingUser: JwtPayload) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        allocations: {
          include: {
            due: true,
            ticket: {
              include: {
                chitGroup: { include: { branch: true } },
                customer: true,
              },
            },
          },
        },
        receipt: true,
        reversal: true,
        recordedByUser: {
          select: { id: true, name: true, phone: true, roles: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    // Customer scoping: Can only view own payments
    if (
      requestingUser.roles.includes(Role.CUSTOMER) &&
      !requestingUser.roles.some((r) => r !== Role.CUSTOMER)
    ) {
      const custId = await this.resolveCustomerId(requestingUser);
      if (!custId || payment.customerId !== custId) {
        throw new ForbiddenException(
          'Access denied: You can only view your own payment records',
        );
      }
    }

    return payment;
  }

  /**
   * Queries and paginates payments list with filters and persona-based boundaries.
   */
  async queryPayments(query: QueryPaymentDto, requestingUser: JwtPayload) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Customer scoping: force own customerId
    if (
      requestingUser.roles.includes(Role.CUSTOMER) &&
      !requestingUser.roles.some((r) => r !== Role.CUSTOMER)
    ) {
      const custId = await this.resolveCustomerId(requestingUser);
      where.customerId = custId || 'NO_MATCH';
    } else if (query.customerId) {
      where.customerId = query.customerId;
    }

    // Branch scoping for branch manager
    if (
      requestingUser.roles.includes(Role.BRANCH_MANAGER) &&
      !requestingUser.roles.includes(Role.SUPER_ADMIN)
    ) {
      if (requestingUser.branchId) {
        where.branchId = requestingUser.branchId;
      }
    }

    if (query.ticketId) {
      where.allocations = { some: { ticketId: query.ticketId } };
    }

    if (query.chitGroupId) {
      where.allocations = {
        some: { ticket: { chitGroupId: query.chitGroupId } },
      };
    }

    if (query.paymentMethod) {
      where.paymentMethod = query.paymentMethod;
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) {
        where.createdAt.gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        where.createdAt.lte = new Date(query.toDate);
      }
    }

    const [total, data] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          allocations: {
            include: {
              due: true,
              ticket: {
                select: {
                  ticketNumber: true,
                  chitGroup: { select: { groupCode: true, chitValue: true } },
                  customer: { select: { customerCode: true, fullName: true } },
                },
              },
            },
          },
          receipt: true,
          reversal: true,
          recordedByUser: {
            select: { id: true, name: true, phone: true },
          },
        },
        orderBy: { createdAt: 'desc' },
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
   * Generates bilingual receipt layout (English + தமிழ்) matching confirmed template.
   */
  async getBilingualReceipt(paymentId: string, requestingUser: JwtPayload) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        receipt: true,
        reversal: true,
        recordedByUser: true,
        allocations: {
          include: {
            due: true,
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

    if (!payment || !payment.receipt) {
      throw new NotFoundException('Receipt not found for this payment');
    }

    // Customer scoping: Can only view own receipts
    if (
      requestingUser.roles.includes(Role.CUSTOMER) &&
      !requestingUser.roles.some((r) => r !== Role.CUSTOMER)
    ) {
      const custId = await this.resolveCustomerId(requestingUser);
      if (!custId || payment.customerId !== custId) {
        throw new ForbiddenException(
          'Access denied: You can only view your own receipts',
        );
      }
    }

    const allocation = payment.allocations[0];
    const ticket = allocation?.ticket;
    const due = allocation?.due;
    const chitGroup = ticket?.chitGroup;
    const branch = chitGroup?.branch;
    const customer = ticket?.customer;

    const receiptInput: ReceiptDataInput = {
      receiptNumber: payment.receipt.receiptNumber,
      issuedAt: payment.receipt.issuedAt,
      chitGroupCode: chitGroup?.groupCode || 'KCA',
      chitValue: chitGroup?.chitValue || 0n,
      durationMonths: chitGroup?.durationMonths || 20,
      installmentMonth: due?.installmentMonth || 1,
      ticketNumber: ticket?.ticketNumber || 0,
      subscriberName: customer?.fullName || '',
      subscriberTamilName: customer?.fullNameTamil,
      subscriberAddress: customer?.addressLine1
        ? `${customer.addressLine1}, ${customer.city || ''} ${customer.pincode || ''}`
        : 'Perundurai, Erode',
      subscriberMobile: customer?.phone || '',
      baseInstallment: due?.grossAmount || 0n,
      dividendDeduction: due?.dividendDeduction || 0n,
      netPayableAmount: due?.netPayableAmount || 0n,
      amountPaid: payment.amount,
      paymentMethod: payment.paymentMethod,
      transactionRef: payment.transactionRef,
      collectorName: payment.recordedByUser?.name || 'Cashier',
      collectorPhone: payment.recordedByUser?.phone,
      branchName: branch?.name || 'Head Office - Perundurai',
      branchTamilName: branch?.nameTamil || 'தலைமை கிளை, பெருந்துறை',
      branchAddress: branch?.address || 'Main Road, Perundurai, Erode',
      branchPhone: branch?.phone || '+91 98765 43210',
      isReversed: payment.paymentStatus === PaymentStatus.REVERSED,
    };

    const textReceipt = formatBilingualReceiptText(receiptInput);

    return {
      receiptNumber: payment.receipt.receiptNumber,
      isBilingual: true,
      issuedAt: payment.receipt.issuedAt,
      isReversed: payment.paymentStatus === PaymentStatus.REVERSED,
      data: receiptInput,
      formattedText: textReceipt,
    };
  }

  /**
   * Maker: Requests a payment reversal with documented reason code.
   */
  async requestReversal(
    paymentId: string,
    dto: RequestReversalDto,
    makerUserId: string,
  ) {
    await assertVerifiedPartner(
      this.prisma,
      makerUserId,
      'request payment reversals',
      'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess financial authority to request payment reversals',
    );

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { reversal: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    if (payment.paymentStatus === PaymentStatus.REVERSED) {
      throw new BadRequestException('Payment has already been reversed');
    }

    if (payment.paymentStatus !== PaymentStatus.SUCCESS) {
      throw new BadRequestException('Only successful payments can be reversed');
    }

    if (payment.reversal && payment.reversal.status === 'REQUESTED') {
      throw new BadRequestException(
        'A reversal request is already pending for this payment',
      );
    }

    const result = await withTransactionRetry(this.prisma, async (tx) => {
      const { lockedPayment, lockedReversal } = await lockPaymentAndReversalRows(tx, paymentId);
      if (lockedPayment && lockedPayment.paymentStatus !== PaymentStatus.SUCCESS) {
        throw new BadRequestException('Only successful payments can be reversed');
      }
      if (lockedReversal && lockedReversal.status === 'REQUESTED') {
        throw new BadRequestException(
          'A reversal request is already pending for this payment',
        );
      }

      const activeReversal = lockedReversal || payment.reversal;
      let reversal;
      if (activeReversal) {
        reversal = await tx.paymentReversal.update({
          where: { paymentId },
          data: {
            reason: dto.reason,
            notes: dto.notes || null,
            status: 'REQUESTED',
            initiatedByUserId: makerUserId,
            approvedByUserId: null,
            reversedAt: null,
          },
        });
      } else {
        reversal = await tx.paymentReversal.create({
          data: {
            paymentId,
            reason: dto.reason,
            notes: dto.notes || null,
            status: 'REQUESTED',
            initiatedByUserId: makerUserId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: makerUserId,
          action: 'PAYMENT_REVERSAL_REQUESTED',
          entityType: 'Payment',
          entityId: paymentId,
          newValue: { reason: dto.reason, notes: dto.notes },
        },
      });

      return {
        message:
          'Payment reversal requested successfully. Pending Checker approval by Super Admin.',
        reversal,
      };
    });

    // Post-commit: Alert Super Admins/Partners for Checker Approval (Non-blocking)
    const queue = this.queueProvider;
    if (queue && payment) {
      try {
        const formattedAmount = payment.amount.toLocaleString('en-IN');
        const payload: ApprovalAlertJobPayload = {
          approvalType: 'REVERSAL_APPROVAL',
          title: 'திருப்புதல் ஒப்புதல் தேவை / Reversal Approval Required',
          body: `ரூ. ${formattedAmount} கட்டண திருப்புதல் ஒப்புதலுக்கு காத்திருக்கிறது. காரணம்: ${dto.reason}. / Payment reversal of Rs. ${formattedAmount} pending checker approval. Reason: ${dto.reason}.`,
          entityId: paymentId,
          amount: payment.amount.toString(),
          excludeUserId: makerUserId,
          data: {
            paymentId,
            reason: dto.reason,
            reversalId: result.reversal.id,
          },
        };

        await queue.addJob(
          NOTIFICATION_QUEUE,
          JOB_DISPATCH_APPROVAL_ALERT,
          payload,
          {
            jobId: `approval-alert-reversal-${result.reversal.id}`,
            priority: 1,
          },
        );
        this.logger.log(`Enqueued reversal approval alert for Payment ${paymentId}`);
      } catch (err: any) {
        this.logger.warn(`Failed to enqueue reversal approval alert: ${err.message}`);
      }
    }

    return result;
  }

  /**
   * Checker: Authorizes and commits the payment reversal.
   * Strictly enforces Maker != Checker (maker_user_id != checker_user_id).
   * Super Admin exclusively (Branch Manager strictly blocked per permissions-matrix §6).
   */
  async approveReversal(
    paymentId: string,
    dto: ApproveReversalDto,
    checkerUserId: string,
    checkerRoles: Role[],
  ) {
    // 1. Enforce Super Admin & Verified Partner Exclusivity (SEC-A)
    if (!checkerRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'REVERSAL_PERMISSION_DENIED: Only Super Admin (Partners) possess financial authority to approve payment reversals',
      );
    }

    await assertVerifiedPartner(
      this.prisma,
      checkerUserId,
      'approve payment reversals',
      'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess financial authority to approve payment reversals',
    );

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        reversal: true,
        allocations: { include: { due: true, ticket: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    if (!payment.reversal || payment.reversal.status !== 'REQUESTED') {
      throw new BadRequestException(
        'No pending reversal request found for this payment',
      );
    }

    // 2. Hard Guard: Maker != Checker
    if (payment.reversal.initiatedByUserId === checkerUserId) {
      throw new ForbiddenException(
        'MAKER_CHECKER_VIOLATION: The user who requested the reversal cannot approve it. An independent Partner must review and commit.',
      );
    }

    const now = new Date();

    const result = await withTransactionRetry(this.prisma, async (tx) => {
      // 0. Pessimistic Row Lock on SubscriberTicket(s) (Tier 2) then Payment/PaymentReversal (Tier 4 -> 5)
      if (typeof tx.$queryRaw === 'function') {
        const ticketIds = [...new Set(payment.allocations.map((a) => a.ticketId))].sort();
        if (ticketIds.length > 0) {
          await tx.$queryRaw`
            SELECT id FROM "SubscriberTicket" WHERE id = ANY(${ticketIds}::text[]) ORDER BY id FOR UPDATE
          `;
        }
        const { lockedPayment, lockedReversal } = await lockPaymentAndReversalRows(tx, paymentId);
        if (lockedPayment && lockedPayment.paymentStatus === PaymentStatus.REVERSED) {
          throw new BadRequestException('Payment has already been reversed');
        }
        if (lockedReversal && lockedReversal.status !== 'REQUESTED') {
          throw new BadRequestException(
            'No pending reversal request found for this payment',
          );
        }
      }

      // 1. Update Reversal Record
      const notesCombined = dto.notes
        ? `${payment.reversal?.notes || ''} | Checker: ${dto.notes}`
        : payment.reversal?.notes;

      const reversal = await tx.paymentReversal.update({
        where: { paymentId },
        data: {
          status: 'APPROVED',
          approvedByUserId: checkerUserId,
          notes: notesCombined,
          reversedAt: now,
        },
      });

      // 2. Update Payment Status to REVERSED
      await tx.payment.update({
        where: { id: paymentId },
        data: { paymentStatus: PaymentStatus.REVERSED },
      });

      // 3. Restore InstallmentDue to UNPAID
      for (const alloc of payment.allocations) {
        await tx.installmentDue.update({
          where: { id: alloc.installmentDueId },
          data: {
            status: DueStatus.UNPAID,
            paidAmount: 0n,
          },
        });

        // 4. Recalculate Consecutive Arrears for ticket (ADR-07 canonical longest contiguous unpaid streak)
        const allDues = await tx.installmentDue.findMany({
          where: { ticketId: alloc.ticketId },
          orderBy: { installmentMonth: 'desc' },
        });

        const consecutiveUnpaid = computeMaxConsecutiveUnpaidMonths(allDues, {
          treatAsUnpaidIds: [alloc.installmentDueId],
        });

        await tx.subscriberTicket.update({
          where: { id: alloc.ticketId },
          data: {
            consecutiveUnpaidMonths: consecutiveUnpaid,
            status: deriveTicketArrearsStatus(consecutiveUnpaid, alloc.ticket?.status),
          },
        });
      }

      // 5. Create Immutable Audit Log
      await tx.auditLog.create({
        data: {
          userId: checkerUserId,
          action: 'PAYMENT_REVERSED',
          entityType: 'Payment',
          entityId: paymentId,
          oldValue: { paymentStatus: 'SUCCESS', dueStatus: 'PAID' },
          newValue: {
            paymentStatus: 'REVERSED',
            dueStatus: 'UNPAID',
            makerUserId: payment.reversal?.initiatedByUserId,
            checkerUserId,
            reason: payment.reversal?.reason,
          },
        },
      });

      return {
        message:
          'Payment reversal approved and committed successfully. Installment due restored to UNPAID.',
        reversal,
        paymentStatus: PaymentStatus.REVERSED,
        dueStatus: DueStatus.UNPAID,
      };
    });

    this.invalidateDaybookCache(payment.branchId, payment.createdAt).catch(() => {});

    return result;
  }

  /**
   * Checker: Rejects a payment reversal request, retaining payment in SUCCESS status.
   */
  async rejectReversal(
    paymentId: string,
    dto: RejectReversalDto,
    checkerUserId: string,
    checkerRoles: Role[],
  ) {
    if (!checkerRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'REVERSAL_PERMISSION_DENIED: Only Super Admin (Partners) possess financial authority to reject payment reversals',
      );
    }

    await assertVerifiedPartner(
      this.prisma,
      checkerUserId,
      'reject payment reversals',
      'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess financial authority to reject payment reversals',
    );

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { reversal: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    if (!payment.reversal || payment.reversal.status !== 'REQUESTED') {
      throw new BadRequestException(
        'No pending reversal request found for this payment',
      );
    }

    // Maker != Checker
    if (payment.reversal.initiatedByUserId === checkerUserId) {
      throw new ForbiddenException(
        'MAKER_CHECKER_VIOLATION: The user who requested the reversal cannot reject it. An independent Partner must decide.',
      );
    }

    const rejectionNotes = `${payment.reversal.notes || ''} | Rejection: ${dto.rejectionReason}`;

    return withTransactionRetry(this.prisma, async (tx) => {
      const { lockedReversal } = await lockPaymentAndReversalRows(tx, paymentId);
      if (lockedReversal && lockedReversal.status !== 'REQUESTED') {
        throw new BadRequestException(
          'No pending reversal request found for this payment',
        );
      }

      const reversal = await tx.paymentReversal.update({
        where: { paymentId },
        data: {
          status: 'REJECTED',
          approvedByUserId: checkerUserId,
          notes: rejectionNotes,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: checkerUserId,
          action: 'PAYMENT_REVERSAL_REJECTED',
          entityType: 'Payment',
          entityId: paymentId,
          newValue: { rejectionReason: dto.rejectionReason, checkerUserId },
        },
      });

      return {
        message:
          'Payment reversal request rejected successfully. Payment remains in SUCCESS status.',
        reversal,
      };
    });
  }

  /**
   * Customer submits bank UTR after making UPI payment via deep-link.
   * Records payment in INITIATED status pending staff verification against bank statement.
   * Does NOT issue receipt or mark due PAID until staff approves.
   */
  async submitUpiClaim(dto: SubmitUpiClaimDto, requestingUser: JwtPayload) {
    const due = await this.prisma.installmentDue.findUnique({
      where: { id: dto.dueId },
      include: {
        ticket: {
          include: {
            customer: true,
            chitGroup: { include: { branch: true } },
          },
        },
      },
    });

    if (!due) {
      throw new NotFoundException(`Installment due with ID ${dto.dueId} not found`);
    }

    if (due.status === DueStatus.PAID) {
      throw new BadRequestException(
        `INSTALLMENT_ALREADY_PAID: Month ${due.installmentMonth} installment has already been settled`,
      );
    }

    if (due.ticket.chitGroup.status !== 'ACTIVE') {
      throw new BadRequestException('Chit scheme is not active');
    }

    if (due.ticket.status === 'REMOVED_DEF_3M') {
      throw new BadRequestException('Subscriber ticket has been removed from this chit scheme');
    }

    // Sequential Installment Payment Guard (ADR-07): Prevent Out-of-Order UPI Claims
    if (typeof this.prisma.installmentDue?.findFirst === 'function') {
      const priorUnpaidDue = await this.prisma.installmentDue.findFirst({
        where: {
          ticketId: due.ticketId,
          installmentMonth: { lt: due.installmentMonth },
          status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
        },
        orderBy: { installmentMonth: 'asc' },
      });
      if (priorUnpaidDue) {
        throw new BadRequestException(
          `PRIOR_INSTALLMENT_UNPAID: Month ${priorUnpaidDue.installmentMonth} installment must be settled before paying Month ${due.installmentMonth}.`,
        );
      }
    }

    // Role-based authorization & Anti-BOLA guard:
    // If requesting user is CUSTOMER, ensure it's their ticket
    if (requestingUser.roles.includes(Role.CUSTOMER)) {
      const isPrivilegedStaff = requestingUser.roles.some((r) =>
        ([Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT] as Role[]).includes(r),
      );
      if (!isPrivilegedStaff) {
        const customer = await this.prisma.customer.findUnique({
          where: { phone: requestingUser.phone },
          select: { id: true },
        });
        if (!customer || customer.id !== due.ticket.customerId) {
          throw new ForbiddenException(
            'BOLA_VIOLATION: You are not authorized to claim payments for another customer ticket',
          );
        }
      }
    }

    const cleanUtr = dto.utrNumber.trim();

    // Check if this UTR already exists in Payment table
    const existingPaymentWithUtr = await this.prisma.payment.findFirst({
      where: { transactionRef: cleanUtr },
    });
    if (existingPaymentWithUtr) {
      throw new ConflictException(
        `DUPLICATE_TRANSACTION_REF: The bank UTR / transaction reference "${cleanUtr}" has already been recorded in another payment.`,
      );
    }

    // Check if there is already an active pending claim for this exact due
    const existingClaim = await this.prisma.paymentAllocation.findFirst({
      where: {
        installmentDueId: due.id,
        payment: {
          paymentStatus: PaymentStatus.INITIATED,
          paymentMethod: PaymentMethod.UPI,
        },
      },
      include: { payment: true },
    });

    if (existingClaim) {
      throw new ConflictException(
        `CLAIM_ALREADY_PENDING: A UPI payment claim is already pending verification for Month ${due.installmentMonth} (UTR: ${existingClaim.payment.transactionRef})`,
      );
    }

    const branchId = due.ticket.chitGroup.branchId;
    const paymentAmount = due.netPayableAmount;

    try {
      const result = await withTransactionRetry(
        this.prisma,
        async (tx) => {
          // Sequential Installment Payment Guard under transaction lock
          if (typeof tx.installmentDue?.findFirst === 'function') {
            const priorUnpaidDueTx = await tx.installmentDue.findFirst({
              where: {
                ticketId: due.ticketId,
                installmentMonth: { lt: due.installmentMonth },
                status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
              },
              orderBy: { installmentMonth: 'asc' },
            });
            if (priorUnpaidDueTx) {
              throw new BadRequestException(
                `PRIOR_INSTALLMENT_UNPAID: Month ${priorUnpaidDueTx.installmentMonth} installment must be settled before paying Month ${due.installmentMonth}.`,
              );
            }
          }

          const payment = await tx.payment.create({
            data: {
              branchId,
              recordedByUserId: requestingUser.sub,
              customerId: due.ticket.customerId,
              amount: paymentAmount,
              paymentMethod: PaymentMethod.UPI,
              paymentStatus: PaymentStatus.INITIATED,
              transactionRef: cleanUtr,
              cashHandoverStatus: 'ACKNOWLEDGED',
              notes: dto.notes ? `Customer UPI Claim: ${dto.notes.trim()}` : 'Customer UPI Claim (Self-Reported)',
            },
          });

          const allocation = await tx.paymentAllocation.create({
            data: {
              paymentId: payment.id,
              ticketId: due.ticketId,
              installmentDueId: due.id,
              amountAllocated: paymentAmount,
            },
          });

          return { payment, allocation };
        },
        undefined,
        PAYMENT_TRANSACTION_OPTIONS,
      );

      return {
        success: true,
        message:
          'UPI payment claim submitted successfully. The accounting desk will verify your bank credit and issue the official receipt.',
        claimId: result.payment.id,
        dueId: due.id,
        ticketId: due.ticketId,
        groupCode: due.ticket.chitGroup.groupCode,
        ticketNumber: due.ticket.ticketNumber,
        installmentMonth: due.installmentMonth,
        utrNumber: cleanUtr,
        amount: Number(paymentAmount),
        status: PaymentStatus.INITIATED,
        submittedAt: result.payment.createdAt,
      };
    } catch (err: any) {
      if (err.code === 'P2002' && String(err.meta?.target).includes('transactionRef')) {
        throw new ConflictException(
          `DUPLICATE_TRANSACTION_REF: The bank UTR / transaction reference "${cleanUtr}" has already been recorded in another payment.`,
        );
      }
      throw err;
    }
  }

  /**
   * Desk Accountant or Partner verifies the customer's UPI credit in bank statement.
   * Enforces Maker != Checker: The user who submitted the claim cannot verify it.
   * Transitions payment INITIATED -> SUCCESS, issues official sequential receipt, marks due PAID.
   */
  async verifyUpiClaim(
    paymentId: string,
    checkerUserId: string,
    checkerRoles: Role[],
    dto?: VerifyUpiClaimDto,
  ) {
    if (
      !checkerRoles.some((r) =>
        ([Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT] as Role[]).includes(r),
      )
    ) {
      throw new ForbiddenException(
        'CLAIM_VERIFY_FORBIDDEN: Only Accounting Desk and Partners possess authority to verify UPI claims',
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        allocations: {
          include: {
            due: true,
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

    if (!payment) {
      throw new NotFoundException('Payment claim record not found');
    }

    if (payment.paymentStatus !== PaymentStatus.INITIATED || payment.paymentMethod !== PaymentMethod.UPI) {
      throw new BadRequestException(
        `INVALID_CLAIM_STATE: Payment ${paymentId} is not a pending UPI claim (current status: ${payment.paymentStatus})`,
      );
    }

    // Maker != Checker: The person who submitted the claim cannot self-verify/approve it
    if (payment.recordedByUserId === checkerUserId) {
      throw new ForbiddenException(
        'MAKER_CHECKER_VIOLATION: The user who submitted the UPI claim cannot verify it. A separate staff member must verify bank credit.',
      );
    }

    const allocation = payment.allocations[0];
    if (!allocation) {
      throw new BadRequestException('Payment claim has no associated installment allocation');
    }

    const due = allocation.due;
    const ticket = allocation.ticket;

    if (ticket.status === 'REMOVED_DEF_3M') {
      throw new BadRequestException(
        'Subscriber ticket has been removed from this chit scheme due to consecutive arrears',
      );
    }

    if (due.status === DueStatus.PAID) {
      throw new BadRequestException('Installment due has already been settled by another payment');
    }

    const branchId = ticket.chitGroup.branchId;
    const lockBranchId = ticket.chitGroup.branchId || branchId;
    const branchCode = ticket.chitGroup.branch?.code || 'PRD';
    const year = new Date().getFullYear();

    const prefix = `KC-REC-${branchCode}-${year}-`;
    const ticketIds = payment.allocations.map((a) => a.ticketId || ticket.id);
    const dueIds = payment.allocations.map((a) => a.installmentDueId || due.id);

    const verificationDate = new Date();
    const updatedNotes = dto?.verificationNotes
      ? `${payment.notes || ''} | Verified by ${checkerUserId}: ${dto.verificationNotes.trim()}`
      : `${payment.notes || ''} | Verified by ${checkerUserId}`;

    const result = await withTransactionRetry(this.prisma, async (tx) => {
      // 0. Pessimistic 4-tier DAG Locks (Branch -> SubscriberTicket -> InstallmentDue -> Payment)
      const { lockedDues, lockedPayments } = await acquirePaymentConcurrencyLocks(tx, {
        branchId: lockBranchId,
        ticketIds,
        dueIds,
        paymentIds: [payment.id],
      });

      const lockedPayment = lockedPayments[0];
      if (lockedPayment && lockedPayment.paymentStatus !== PaymentStatus.INITIATED) {
        throw new BadRequestException(
          `PAYMENT_ALREADY_PROCESSED: Payment claim has already been processed (status: ${lockedPayment.paymentStatus})`,
        );
      }

      const settledDue = lockedDues.find((d) => d.status === DueStatus.PAID);
      if (settledDue) {
        throw new BadRequestException(
          'INSTALLMENT_ALREADY_PAID: Target installment due has already been settled in full by another payment',
        );
      }

      // Sequential Installment Payment Guard under transaction lock
      if (typeof tx.installmentDue?.findFirst === 'function') {
        const priorUnpaidDue = await tx.installmentDue.findFirst({
          where: {
            ticketId: ticket.id,
            installmentMonth: { lt: due.installmentMonth },
            status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
          },
          orderBy: { installmentMonth: 'asc' },
        });
        if (priorUnpaidDue) {
          throw new BadRequestException(
            `PRIOR_INSTALLMENT_UNPAID: Month ${priorUnpaidDue.installmentMonth} installment must be settled before paying Month ${due.installmentMonth}.`,
          );
        }
      }

      // 1. Update Payment to SUCCESS
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          paymentStatus: PaymentStatus.SUCCESS,
          notes: updatedNotes,
        },
      });

      // 2. Generate Sequential Bilingual Receipt strictly inside the locked Branch transaction
      const finalReceiptNumber = await generateNextReceiptNumber(tx, prefix);

      const receipt = await tx.receipt.create({
        data: {
          branchId,
          paymentId: payment.id,
          receiptNumber: finalReceiptNumber,
          isBilingual: true,
          issuedAt: verificationDate,
        },
      });

      // 3. Mark Installment Due as PAID
      await tx.installmentDue.update({
        where: { id: due.id },
        data: {
          status: DueStatus.PAID,
          paidAmount: payment.amount,
        },
      });

      // 4. Recalculate Consecutive Arrears (ADR-07 canonical longest contiguous unpaid streak)
      const allDues = await tx.installmentDue.findMany({
        where: {
          ticketId: ticket.id,
        },
        orderBy: { installmentMonth: 'desc' },
      });

      const consecutiveUnpaid = computeMaxConsecutiveUnpaidMonths(allDues, {
        treatAsPaidIds: [due.id],
      });

      await tx.subscriberTicket.update({
        where: { id: ticket.id },
        data: {
          consecutiveUnpaidMonths: consecutiveUnpaid,
          status: deriveTicketArrearsStatus(consecutiveUnpaid, ticket.status),
        },
      });

      // 5. Audit Log
      await tx.auditLog.create({
        data: {
          userId: checkerUserId,
          action: 'UPI_CLAIM_VERIFIED',
          entityType: 'Payment',
          entityId: payment.id,
          newValue: {
            receiptNumber: finalReceiptNumber,
            utrNumber: payment.transactionRef,
            amount: payment.amount.toString(),
            verifiedByUserId: checkerUserId,
            dueId: due.id,
          },
        },
      });

      return {
        payment: updatedPayment,
        receipt,
        dueStatus: DueStatus.PAID,
        paidAmount: payment.amount,
        netPayableAmount: due.netPayableAmount,
      };
    }, undefined, PAYMENT_TRANSACTION_OPTIONS);

    if (this.queueProvider) {
      try {
        await this.queueProvider.addJob(
          NOTIFICATION_QUEUE,
          JOB_DISPATCH_PAYMENT_RECEIPT,
          {
            recipientPhone: ticket.customer.phone,
            fcmToken: ticket.customer.fcmToken || undefined,
            amountPaid: payment.amount.toString(),
            chitCode: ticket.chitGroup.groupCode,
            ticketNumber: ticket.ticketNumber,
            receiptNumber: result.receipt.receiptNumber,
            transactionTimestamp: verificationDate.toISOString(),
            passbookAppUrl: `https://app.kumaranfinance.in/passbook/${ticket.id}`,
          },
          {
            jobId: `receipt-${result.receipt.receiptNumber}`,
            priority: 1,
          },
        );
      } catch (queueErr: any) {
        this.logger.warn(
          `Failed to enqueue receipt job for verified UPI claim ${result.receipt.receiptNumber}: ${queueErr.message}`,
        );
      }
    }

    return {
      success: true,
      message: 'UPI payment claim verified successfully. Official receipt generated and sent to customer.',
      payment: result.payment,
      receipt: result.receipt,
      dueStatus: result.dueStatus,
    };
  }

  /**
   * Retrieves pending UPI claims for Accounting Desk verification with optional pagination.
   */
  async getPendingUpiClaims(
    branchId?: string,
    pagination?: { page: number; limit: number },
  ) {
    const where: any = {
      paymentMethod: PaymentMethod.UPI,
      paymentStatus: PaymentStatus.INITIATED,
    };
    if (branchId) {
      where.branchId = branchId;
    }

    const skip = pagination ? (pagination.page - 1) * pagination.limit : undefined;
    const take = pagination ? pagination.limit : undefined;

    const [claims, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          recordedByUser: {
            select: { id: true, name: true, phone: true, roles: true },
          },
          allocations: {
            include: {
              due: true,
              ticket: {
                include: {
                  customer: true,
                  chitGroup: true,
                },
              },
            },
          },
        },
      }),
      pagination ? this.prisma.payment.count({ where }) : Promise.resolve(0),
    ]);

    const mapped = claims.map((c) => {
      const alloc = c.allocations[0];
      return {
        claimId: c.id,
        amount: Number(c.amount),
        utrNumber: c.transactionRef,
        notes: c.notes,
        createdAt: c.createdAt,
        submittedByUser: c.recordedByUser,
        customer: alloc?.ticket?.customer
          ? {
              id: alloc.ticket.customer.id,
              customerCode: alloc.ticket.customer.customerCode,
              fullName: alloc.ticket.customer.fullName,
              phone: alloc.ticket.customer.phone,
            }
          : null,
        ticket: alloc?.ticket
          ? {
              id: alloc.ticket.id,
              ticketNumber: alloc.ticket.ticketNumber,
              groupCode: alloc.ticket.chitGroup.groupCode,
            }
          : null,
        due: alloc?.due
          ? {
              id: alloc.due.id,
              installmentMonth: alloc.due.installmentMonth,
              netPayableAmount: Number(alloc.due.netPayableAmount),
              status: alloc.due.status,
            }
          : null,
      };
    });

    if (pagination) {
      return {
        data: mapped,
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
      };
    }

    return mapped;
  }
}
