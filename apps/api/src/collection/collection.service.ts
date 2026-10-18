import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DueStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AcknowledgeHandoverDto } from './dto/acknowledge-handover.dto';
import { QueryCollectionDto } from './dto/query-collection.dto';
import { RecordCollectionDto } from './dto/record-collection.dto';
import { SubmitHandoverDto } from './dto/submit-handover.dto';

@Injectable()
export class CollectionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Doorstep field collection recording.
   * Strictly enforces ADR-07: Single discrete payment matching exact net installment (Inet).
   * Generates sequential bilingual receipt and sets cashHandoverStatus.
   */
  async recordCollection(
    dto: RecordCollectionDto,
    collectorUserId: string,
    staffBranchId?: string | null,
  ) {
    // 1. Idempotency Check for Rural Offline Sync Deduplication
    if (dto.idempotencyKey) {
      const existingPayment = await this.prisma.payment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: {
          allocations: { include: { due: true, ticket: true } },
          receipt: true,
        },
      });

      if (existingPayment) {
        return {
          duplicateIgnored: true,
          message: 'Payment already recorded with this idempotency key',
          payment: existingPayment,
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
    const collectionAmount = BigInt(Math.floor(dto.amount));
    if (collectionAmount !== due.netPayableAmount) {
      throw new BadRequestException(
        `PARTIAL_PAYMENTS_NOT_ALLOWED: Payment must exactly match the net installment due of ₹${due.netPayableAmount.toString()} (received: ₹${collectionAmount.toString()})`,
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

    return this.prisma.$transaction(async (tx) => {
      // 1. Create Payment
      const payment = await tx.payment.create({
        data: {
          branchId,
          recordedByUserId: collectorUserId,
          customerId: ticket.customerId,
          amount: collectionAmount,
          paymentMethod: dto.paymentMethod,
          paymentStatus: PaymentStatus.SUCCESS,
          idempotencyKey: dto.idempotencyKey || null,
          transactionRef: dto.transactionRef || null,
          cashHandoverStatus,
          createdAt: paymentDate,
        },
      });

      // 2. Create PaymentAllocation (Maps Payment to discrete InstallmentDue)
      const allocation = await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          ticketId: ticket.id,
          installmentDueId: due.id,
          amountAllocated: collectionAmount,
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
          paidAmount: collectionAmount,
          status: DueStatus.PAID,
        },
      });

      // 5. Recalculate Arrears & Restore Auction Eligibility
      const remainingUnpaidDues = await tx.installmentDue.count({
        where: {
          ticketId: ticket.id,
          status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
          dueDate: { lt: new Date() },
        },
      });

      await tx.subscriberTicket.update({
        where: { id: ticket.id },
        data: {
          consecutiveUnpaidMonths: remainingUnpaidDues,
          status: remainingUnpaidDues === 0 ? 'ACTIVE' : ticket.status,
        },
      });

      return {
        paymentId: payment.id,
        receiptNumber: receipt.receiptNumber,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        cashHandoverStatus: payment.cashHandoverStatus,
        customerCode: ticket.customer.customerCode,
        customerName: ticket.customer.fullName,
        customerNameTamil: ticket.customer.fullNameTamil,
        ticketNumber: ticket.ticketNumber,
        groupCode: ticket.chitGroup.groupCode,
        installmentMonth: dto.installmentMonth,
        grossAmount: due.grossAmount,
        dividendDeduction: due.dividendDeduction,
        netPaidAmount: collectionAmount,
        allocationId: allocation.id,
        collectedAt: payment.createdAt,
      };
    });
  }

  /**
   * Evening Cash Handover Batch Submission by Field Agent (Maker step).
   * Aggregates all unhanded cash collections collected by this agent.
   */
  async submitHandover(collectorUserId: string, _dto?: SubmitHandoverDto) {
    const pendingPayments = await this.prisma.payment.findMany({
      where: {
        recordedByUserId: collectorUserId,
        paymentMethod: PaymentMethod.CASH,
        cashHandoverStatus: 'PENDING_HANDOVER',
        paymentStatus: PaymentStatus.SUCCESS,
      },
      include: {
        allocations: {
          include: {
            ticket: {
              include: { customer: { select: { customerCode: true, fullName: true } } },
            },
            due: { select: { installmentMonth: true } },
          },
        },
        receipt: { select: { receiptNumber: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalAmount = pendingPayments.reduce((sum, p) => sum + p.amount, 0n);

    return {
      collectorUserId,
      totalPendingAmount: totalAmount,
      paymentsCount: pendingPayments.length,
      paymentIds: pendingPayments.map((p) => p.id),
      collections: pendingPayments.map((p) => ({
        paymentId: p.id,
        receiptNumber: p.receipt?.receiptNumber,
        amount: p.amount,
        collectedAt: p.createdAt,
        customerName: p.allocations[0]?.ticket.customer.fullName,
        customerCode: p.allocations[0]?.ticket.customer.customerCode,
        ticketNumber: p.allocations[0]?.ticket.ticketNumber,
        installmentMonth: p.allocations[0]?.due.installmentMonth,
      })),
    };
  }

  /**
   * Cash Handover Acknowledgment into Branch Vault (Checker step).
   * Strictly enforces Non-Negotiable Hard Guard:
   *   collector_user_id != acknowledger_user_id
   * An agent who collected cash can NEVER acknowledge their own cash into vault.
   */
  async acknowledgeHandover(
    dto: AcknowledgeHandoverDto,
    acknowledgerUserId: string,
  ) {
    // 1. DUAL-ROLE HARD GUARD: Separation of Duties
    if (dto.collectorUserId === acknowledgerUserId) {
      throw new ForbiddenException(
        'Dual-Control Separation of Duties Violated: The field agent who collected the cash cannot acknowledge or sign off on their own cash handover into the branch vault (collector_user_id != acknowledger_user_id)',
      );
    }

    // 2. Fetch Specified Payments & Verify Collector Ownership
    const payments = await this.prisma.payment.findMany({
      where: {
        id: { in: dto.paymentIds },
      },
    });

    if (payments.length !== dto.paymentIds.length) {
      throw new BadRequestException('One or more payment IDs in the batch could not be found');
    }

    // Verify all belong to collector and are in PENDING_HANDOVER
    for (const p of payments) {
      if (p.recordedByUserId !== dto.collectorUserId) {
        throw new BadRequestException(
          `Payment ${p.id} was not recorded by collector ${dto.collectorUserId}`,
        );
      }
      if (p.paymentMethod !== PaymentMethod.CASH) {
        throw new BadRequestException(`Payment ${p.id} is not a cash collection`);
      }
      if (p.cashHandoverStatus !== 'PENDING_HANDOVER') {
        throw new BadRequestException(
          `Payment ${p.id} has already been acknowledged or is not pending handover`,
        );
      }
    }

    // 3. Verify Physically Counted Amount Against Total Payments Sum
    const totalBatchSum = payments.reduce((sum, p) => sum + p.amount, 0n);
    const countedAmount = BigInt(Math.floor(dto.acknowledgedAmount));

    if (totalBatchSum !== countedAmount) {
      throw new BadRequestException(
        `Cash Handover Discrepancy: Physically counted vault cash (₹${countedAmount.toString()}) does not match the sum of collection receipts (₹${totalBatchSum.toString()})`,
      );
    }

    const acknowledgedAt = new Date();

    // 4. Update Payments Status to ACKNOWLEDGED
    await this.prisma.payment.updateMany({
      where: { id: { in: dto.paymentIds } },
      data: {
        cashHandoverStatus: 'ACKNOWLEDGED',
        cashHandoverAcknowledgedByUserId: acknowledgerUserId,
        cashHandoverAcknowledgedAt: acknowledgedAt,
      },
    });

    return {
      success: true,
      message: `Cash handover of ₹${countedAmount.toString()} successfully verified and deposited into branch vault.`,
      collectorUserId: dto.collectorUserId,
      acknowledgedByUserId: acknowledgerUserId,
      acknowledgedAmount: countedAmount,
      totalPaymentsAcknowledged: payments.length,
      acknowledgedAt,
      notes: dto.notes || 'Physically counted and verified currency notes.',
    };
  }

  /**
   * Daily collections summary and register for reconciling day books.
   */
  async getDailySummary(
    query?: QueryCollectionDto,
    currentUserId?: string,
    userRole?: Role,
  ) {
    const targetDate = query?.date ? new Date(query.date) : new Date();
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const where: any = {
      createdAt: { gte: startOfDay, lte: endOfDay },
      paymentStatus: PaymentStatus.SUCCESS,
    };

    // Scoping for collection agent (sees only own collections)
    if (userRole === Role.COLLECTION_AGENT && currentUserId) {
      where.recordedByUserId = currentUserId;
    } else if (query?.collectorUserId) {
      where.recordedByUserId = query.collectorUserId;
    }

    if (query?.branchId) {
      where.branchId = query.branchId;
    }

    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        receipt: { select: { receiptNumber: true } },
        recordedByUser: { select: { id: true, name: true, phone: true } },
        allocations: {
          include: {
            ticket: {
              select: {
                ticketNumber: true,
                customer: { select: { customerCode: true, fullName: true, phone: true } },
                chitGroup: { select: { groupCode: true } },
              },
            },
            due: { select: { installmentMonth: true } },
          },
        },
      },
    });

    let totalCollected = 0n;
    let cashCollected = 0n;
    let cashPendingHandover = 0n;
    let cashAcknowledgedInVault = 0n;
    let digitalCollected = 0n;

    for (const p of payments) {
      totalCollected += p.amount;
      if (p.paymentMethod === PaymentMethod.CASH) {
        cashCollected += p.amount;
        if (p.cashHandoverStatus === 'PENDING_HANDOVER') {
          cashPendingHandover += p.amount;
        } else if (p.cashHandoverStatus === 'ACKNOWLEDGED') {
          cashAcknowledgedInVault += p.amount;
        }
      } else {
        digitalCollected += p.amount;
      }
    }

    return {
      date: startOfDay.toISOString().split('T')[0],
      totalPaymentsCount: payments.length,
      totals: {
        totalCollected,
        cashCollected,
        cashPendingHandover,
        cashAcknowledgedInVault,
        digitalCollected,
      },
      collections: payments.map((p) => ({
        paymentId: p.id,
        receiptNumber: p.receipt?.receiptNumber,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        cashHandoverStatus: p.cashHandoverStatus,
        collectedAt: p.createdAt,
        collectorName: p.recordedByUser.name,
        customerCode: p.allocations[0]?.ticket.customer.customerCode,
        customerName: p.allocations[0]?.ticket.customer.fullName,
        groupCode: p.allocations[0]?.ticket.chitGroup.groupCode,
        ticketNumber: p.allocations[0]?.ticket.ticketNumber,
        installmentMonth: p.allocations[0]?.due.installmentMonth,
      })),
    };
  }

  /**
   * Retrieves pending/overdue dues for field collection rounds.
   */
  async getAgentDues(collectorUserId: string, branchId?: string) {
    const where: any = {
      status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
      ticket: {
        status: { not: 'REMOVED_DEF_3M' },
        chitGroup: { status: 'ACTIVE' },
      },
    };

    if (branchId) {
      where.ticket.chitGroup.branchId = branchId;
    }

    return this.prisma.installmentDue.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { ticket: { ticketNumber: 'asc' } }],
      include: {
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            consecutiveUnpaidMonths: true,
            customer: {
              select: {
                id: true,
                customerCode: true,
                fullName: true,
                fullNameTamil: true,
                phone: true,
                altPhone: true,
                addressLine1: true,
                city: true,
              },
            },
            chitGroup: {
              select: {
                groupCode: true,
                groupName: true,
              },
            },
          },
        },
      },
    });
  }
}
