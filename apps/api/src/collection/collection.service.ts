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
import { PrismaService } from '../prisma/prisma.service';
import { BullMqQueueProvider } from '../jobs/providers/bullmq-queue.provider';
import {
  JOB_DISPATCH_PAYMENT_RECEIPT,
  NOTIFICATION_QUEUE,
} from '../jobs/constants/queue-names.constant';
import { AcknowledgeHandoverDto } from './dto/acknowledge-handover.dto';
import { QueryCollectionDto } from './dto/query-collection.dto';
import { RecordCollectionDto } from './dto/record-collection.dto';
import { SubmitHandoverDto } from './dto/submit-handover.dto';
import { SyncOfflineQueueDto } from './dto/sync-offline-collection.dto';

export interface SyncedOfflineItemResult {
  idempotencyKey: string;
  paymentId: string;
  receiptNumber: string;
  amount: string;
  status: string;
  isDuplicate: boolean;
  collectedAt: Date | string;
}

export interface FailedOfflineItemResult {
  idempotencyKey: string;
  ticketId: string;
  installmentMonth: number;
  amount: number;
  errorCode: string;
  errorMessage: string;
}

export interface SyncOfflineQueueResponse {
  totalSubmitted: number;
  successCount: number;
  failureCount: number;
  synced: SyncedOfflineItemResult[];
  failed: FailedOfflineItemResult[];
}

@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly queueProvider?: BullMqQueueProvider,
  ) {}

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
          paymentId: existingPayment.id,
          receiptNumber: existingPayment.receipt?.receiptNumber || '',
          amount: existingPayment.amount,
          collectedAt: existingPayment.createdAt,
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
    const prefix = `KC-REC-${branchCode}-${year}-`;
    const lastReceipt = await this.prisma.receipt.findFirst({
      where: {
        branchId,
        receiptNumber: { startsWith: prefix },
      },
      orderBy: { receiptNumber: 'desc' },
      select: { receiptNumber: true },
    });

    let nextSeq = 1;
    if (lastReceipt?.receiptNumber) {
      const parts = lastReceipt.receiptNumber.split('-');
      const lastNumStr = parts[parts.length - 1];
      const parsed = parseInt(lastNumStr, 10);
      if (!isNaN(parsed)) {
        nextSeq = parsed + 1;
      }
    }

    const cashHandoverStatus =
      dto.paymentMethod === PaymentMethod.CASH
        ? 'PENDING_HANDOVER'
        : 'ACKNOWLEDGED';

    const paymentDate = dto.collectedAt ? new Date(dto.collectedAt) : new Date();

    let result: any;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        // 0. Pessimistic Row Lock (SELECT FOR UPDATE) to eliminate concurrent duplicate payments
        if (typeof tx.$queryRaw === 'function') {
          const lockedDues = await tx.$queryRaw<Array<{ id: string; status: DueStatus; netPayableAmount: bigint }>>`
            SELECT id, status, "netPayableAmount" FROM "InstallmentDue" WHERE id = ${due.id} FOR UPDATE
          `;
          const lockedDue = lockedDues && lockedDues[0];
          if (lockedDue && lockedDue.status === DueStatus.PAID) {
            throw new BadRequestException(
              `INSTALLMENT_ALREADY_PAID: Month ${dto.installmentMonth} installment has already been paid in full`,
            );
          }
        }

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

        // 3. Create Bilingual Receipt (with collision-proof sequence guarantee)
        let finalReceiptNumber = `${prefix}${String(nextSeq).padStart(5, '0')}`;
        if (typeof tx.receipt?.findUnique === 'function') {
          while (await tx.receipt.findUnique({ where: { receiptNumber: finalReceiptNumber } })) {
            nextSeq++;
            finalReceiptNumber = `${prefix}${String(nextSeq).padStart(5, '0')}`;
          }
        }

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
            },
          });
          if (existing) {
            return {
              duplicateIgnored: true,
              message: 'Payment already recorded with this idempotency key',
              payment: existing,
              paymentId: existing.id,
              receiptNumber: existing.receipt?.receiptNumber || '',
              amount: existing.amount,
              collectedAt: existing.createdAt,
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
            amountPaid: collectionAmount.toString(),
            chitCode: ticket.chitGroup.groupCode,
            ticketNumber: ticket.ticketNumber,
            receiptNumber: result.receiptNumber,
            transactionTimestamp: paymentDate.toISOString(),
            passbookAppUrl: `https://app.kumaranfinance.com/passbook/${ticket.id}`,
          },
        );
      } catch (queueErr: any) {
        this.logger.warn(
          `Failed to enqueue collection receipt notification for ${result.receiptNumber}: ${queueErr.message}`,
        );
      }
    }

    return result;
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

    // 2. Fetch Specified Payments & Verify Collector Ownership within atomic transaction
    return this.prisma.$transaction(async (tx) => {
      // 0. Pessimistic Row Lock (SELECT FOR UPDATE) to eliminate concurrent duplicate vault handovers
      if (typeof tx.$queryRaw === 'function' && dto.paymentIds && dto.paymentIds.length > 0) {
        const lockedPayments = await tx.$queryRaw<Array<{ id: string; cashHandoverStatus: string }>>`
          SELECT id, "cashHandoverStatus" FROM "Payment" WHERE id = ANY(${dto.paymentIds}::text[]) FOR UPDATE
        `;
        if (lockedPayments && lockedPayments.length > 0) {
          for (const lp of lockedPayments) {
            if (lp.cashHandoverStatus !== 'PENDING_HANDOVER') {
              throw new BadRequestException(
                `Payment ${lp.id} has already been acknowledged or is not pending handover`,
              );
            }
          }
        }
      }

      const payments = await tx.payment.findMany({
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
      await tx.payment.updateMany({
        where: { id: { in: dto.paymentIds } },
        data: {
          cashHandoverStatus: 'ACKNOWLEDGED',
          cashHandoverAcknowledgedByUserId: acknowledgerUserId,
          cashHandoverAcknowledgedAt: acknowledgedAt,
        },
      });

      // 5. Immutable Audit Trail for Vault Deposit
      await tx.auditLog.create({
        data: {
          userId: acknowledgerUserId,
          action: 'CASH_HANDOVER_ACKNOWLEDGED',
          entityType: 'Payment',
          entityId: dto.collectorUserId,
          newValue: {
            collectorUserId: dto.collectorUserId,
            acknowledgedByUserId: acknowledgerUserId,
            acknowledgedAmount: countedAmount.toString(),
            totalPaymentsAcknowledged: payments.length,
            paymentIds: dto.paymentIds,
            notes: dto.notes || null,
          },
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
    });
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

  /**
   * Batch Offline Collection Queue Synchronization.
   * Processes a list of locally queued offline collections submitted by field agents.
   * Guarantees item-level isolation (partial success) and idempotent deduplication.
   */
  async syncOfflineQueue(
    dto: SyncOfflineQueueDto,
    collectorUserId: string,
    staffBranchId?: string | null,
  ): Promise<SyncOfflineQueueResponse> {
    const synced: SyncedOfflineItemResult[] = [];
    const failed: FailedOfflineItemResult[] = [];

    for (const item of dto.items) {
      try {
        const result: any = await this.recordCollection(
          {
            ticketId: item.ticketId,
            installmentMonth: item.installmentMonth,
            amount: item.amount,
            paymentMethod: item.paymentMethod,
            idempotencyKey: item.idempotencyKey,
            collectedAt: item.collectedAt,
            transactionRef: item.transactionRef,
          },
          collectorUserId,
          staffBranchId,
        );

        synced.push({
          idempotencyKey: item.idempotencyKey,
          paymentId: result.paymentId || result.payment?.id || '',
          receiptNumber:
            result.receiptNumber ||
            result.payment?.receipt?.receiptNumber ||
            '',
          amount: (
            result.amount ??
            result.payment?.amount ??
            item.amount
          ).toString(),
          status: 'SUCCESS',
          isDuplicate: !!result.duplicateIgnored,
          collectedAt: result.collectedAt || item.collectedAt,
        });
      } catch (err: any) {
        const errorMessage =
          err?.message || 'Failed to record offline collection';
        let errorCode = 'SYNC_FAILED';

        if (errorMessage.includes('INSTALLMENT_ALREADY_PAID')) {
          errorCode = 'INSTALLMENT_ALREADY_PAID';
        } else if (errorMessage.includes('PARTIAL_PAYMENTS_NOT_ALLOWED')) {
          errorCode = 'PARTIAL_PAYMENTS_NOT_ALLOWED';
        } else if (errorMessage.includes('Subscriber ticket not found')) {
          errorCode = 'TICKET_NOT_FOUND';
        } else if (errorMessage.includes('Chit scheme is not active')) {
          errorCode = 'CHIT_NOT_ACTIVE';
        } else if (errorMessage.includes('removed from this chit scheme')) {
          errorCode = 'TICKET_REMOVED';
        } else if (errorMessage.includes('has not been generated')) {
          errorCode = 'DUE_NOT_FOUND';
        }

        failed.push({
          idempotencyKey: item.idempotencyKey,
          ticketId: item.ticketId,
          installmentMonth: item.installmentMonth,
          amount: item.amount,
          errorCode,
          errorMessage,
        });
      }
    }

    return {
      totalSubmitted: dto.items.length,
      successCount: synced.length,
      failureCount: failed.length,
      synced,
      failed,
    };
  }
}
