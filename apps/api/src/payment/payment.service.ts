import {
  BadRequestException,
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
import {
  JOB_DISPATCH_PAYMENT_RECEIPT,
  NOTIFICATION_QUEUE,
} from '../jobs/constants/queue-names.constant';
import {
  formatBilingualReceiptText,
  ReceiptDataInput,
} from './bilingual-receipt.helper';
import { ApproveReversalDto } from './dto/approve-reversal.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { RejectReversalDto } from './dto/reject-reversal.dto';
import { RequestReversalDto } from './dto/request-reversal.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly queueProvider?: BullMqQueueProvider,
  ) {}

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
    // 1. Idempotency Check
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
    const paymentAmount = BigInt(Math.floor(dto.amount));
    if (paymentAmount !== due.netPayableAmount) {
      throw new BadRequestException(
        `PARTIAL_PAYMENTS_NOT_ALLOWED: Payment must exactly match the net installment due of ₹${due.netPayableAmount.toString()} (received: ₹${paymentAmount.toString()})`,
      );
    }

    const branchId = staffBranchId || ticket.chitGroup.branchId;
    const branchCode = ticket.chitGroup.branch?.code || 'PRD';
    const year = new Date().getFullYear();

    // 6. Generate Sequential Bilingual Receipt Number: KC-REC-PRD-YYYY-XXXXX
    const receiptCount = await this.prisma.receipt.count({
      where: { branchId },
    });
    const sequence = String(receiptCount + 1).padStart(5, '0');
    const receiptNumber = `KC-REC-${branchCode}-${year}-${sequence}`;

    const cashHandoverStatus =
      dto.paymentMethod === PaymentMethod.CASH
        ? 'PENDING_HANDOVER'
        : 'ACKNOWLEDGED';

    const paymentDate = dto.collectedAt ? new Date(dto.collectedAt) : new Date();

    const result = await this.prisma.$transaction(async (tx) => {
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

      // 3. Create Bilingual Receipt
      const receipt = await tx.receipt.create({
        data: {
          branchId,
          paymentId: payment.id,
          receiptNumber,
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

      // 5. Recalculate Consecutive Arrears
      const allDues = await tx.installmentDue.findMany({
        where: {
          ticketId: ticket.id,
          installmentMonth: { lte: dto.installmentMonth },
        },
        orderBy: { installmentMonth: 'desc' },
      });

      let consecutiveUnpaid = 0;
      for (const d of allDues) {
        if (d.id === due.id) {
          break;
        }
        if (d.status !== DueStatus.PAID) {
          consecutiveUnpaid++;
        } else {
          break;
        }
      }

      await tx.subscriberTicket.update({
        where: { id: ticket.id },
        data: {
          consecutiveUnpaidMonths: consecutiveUnpaid,
          status: consecutiveUnpaid >= 3 ? 'DEFAULT_3_MONTHS' : 'ACTIVE',
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
    });

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
            passbookAppUrl: `https://app.kumaranfinance.com/passbook/${ticket.id}`,
          },
        );
      } catch (queueErr: any) {
        this.logger.warn(
          `Failed to enqueue payment receipt job for receipt ${result.receipt.receiptNumber}: ${queueErr.message}`,
        );
      }
    }

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

    return this.prisma.$transaction(async (tx) => {
      let reversal;
      if (payment.reversal) {
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
    // 1. Enforce Super Admin Exclusivity
    if (!checkerRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'REVERSAL_PERMISSION_DENIED: Only Super Admin (Partners) possess financial authority to approve payment reversals',
      );
    }

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

    return this.prisma.$transaction(async (tx) => {
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

        // 4. Recalculate Consecutive Arrears for ticket
        const unpaidDues = await tx.installmentDue.count({
          where: {
            ticketId: alloc.ticketId,
            installmentMonth: { lte: alloc.due.installmentMonth },
            status: { not: DueStatus.PAID },
          },
        });

        await tx.subscriberTicket.update({
          where: { id: alloc.ticketId },
          data: {
            consecutiveUnpaidMonths: unpaidDues,
            status: unpaidDues >= 3 ? 'DEFAULT_3_MONTHS' : 'ACTIVE',
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

    return this.prisma.$transaction(async (tx) => {
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
}
