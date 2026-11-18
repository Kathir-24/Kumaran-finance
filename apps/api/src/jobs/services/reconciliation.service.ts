import { Injectable, Logger, Optional } from '@nestjs/common';
import { DueStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  computeMaxConsecutiveUnpaidMonths,
  deriveTicketArrearsStatus,
} from '../../common/utils/arrears.util';
import {
  acquirePaymentConcurrencyLocks,
  generateNextReceiptNumber,
  PAYMENT_TRANSACTION_OPTIONS,
} from '../../common/utils/receipt-sequence.util';
import { withTransactionRetry } from '../../common/utils/transaction-retry.util';
import { DistributedLockService } from './distributed-lock.service';
import { NotificationService } from './notification.service';
import type { ReconciliationJobResult } from '../dto/job-payloads.dto';

export interface ProviderSettlementRecord {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  amount: bigint;
  status: 'SUCCESS' | 'FAILED' | 'REFUNDED';
  settledAt: Date;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() private readonly distributedLockService?: DistributedLockService,
  ) {}

  /**
   * Executes daily settlement reconciliation against payment gateway records.
   * Auto-resolves ghost drops atomically in a database transaction:
   * 1. Transitions Payment INITIATED -> SUCCESS.
   * 2. Marks linked InstallmentDue records as PAID with paidAmount updated.
   * 3. Mints collision-proof sequential bilingual Receipt (KC-REC-PRD-YYYY-NNNNN).
   * 4. Recalculates consecutive arrears and restores ACTIVE status if in default.
   * 5. Dispatches official receipt notification asynchronously post-commit.
   * Guarded by DistributedLockService to prevent overlapping reconciliation runs across replicas.
   */
  async reconcileSettlement(
    providerRecords: ProviderSettlementRecord[],
  ): Promise<ReconciliationJobResult> {
    if (this.distributedLockService) {
      return this.distributedLockService.runWithLock(
        'reconciliation-settlement',
        60000,
        () => this.executeReconcileSettlement(providerRecords),
      );
    }
    return this.executeReconcileSettlement(providerRecords);
  }

  private async executeReconcileSettlement(
    providerRecords: ProviderSettlementRecord[],
  ): Promise<ReconciliationJobResult> {
    this.logger.log(`Starting payment reconciliation for ${providerRecords.length} gateway records`);

    let matchedCount = 0;
    let autoResolvedGhostDropsCount = 0;
    let exceptionCount = 0;
    const details: string[] = [];

    for (const record of providerRecords) {
      const payment = await this.prisma.payment.findFirst({
        where: { transactionRef: record.gatewayOrderId },
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
          receipt: true,
        },
      });

      if (!payment) {
        exceptionCount++;
        const msg = `Unmapped Credit: Gateway order ${record.gatewayOrderId} has no internal payment record.`;
        details.push(msg);
        this.logger.warn(msg);
        continue;
      }

      // Scenario 1: Amount and Status Match
      if (
        payment.paymentStatus === PaymentStatus.SUCCESS &&
        payment.amount === record.amount &&
        record.status === 'SUCCESS'
      ) {
        matchedCount++;
        continue;
      }

      // Scenario 2: Ghost Drop (Customer debited, but internal was pending/initiated)
      if (
        payment.paymentStatus === PaymentStatus.INITIATED &&
        record.status === 'SUCCESS' &&
        payment.amount === record.amount
      ) {
        const branchId = payment.branchId;
        const lockBranchId =
          payment.allocations[0]?.ticket?.chitGroup?.branchId || branchId;
        const branchCode = payment.allocations[0]?.ticket?.chitGroup?.branch?.code || 'PRD';
        const year = new Date().getFullYear();
        const prefix = `KC-REC-${branchCode}-${year}-`;
        const ticketIds = payment.allocations.map((a) => a.ticketId);
        const dueIds = payment.allocations.map((a) => a.installmentDueId);

        const txResult = await withTransactionRetry(this.prisma, async (tx) => {
          // 0. Acquire 4-tier DAG locks (Branch -> SubscriberTicket -> InstallmentDue -> Payment)
          const { lockedDues, lockedPayments } = await acquirePaymentConcurrencyLocks(tx, {
            branchId: lockBranchId,
            ticketIds,
            dueIds,
            paymentIds: [payment.id],
          });

          // 1. Re-verify locked Payment & InstallmentDue states inside transaction
          const current = await tx.payment.findUnique({
            where: { id: payment.id },
            select: { id: true, paymentStatus: true },
          });
          const effectiveStatus = lockedPayments[0]?.paymentStatus ?? current?.paymentStatus;

          if (!effectiveStatus) {
            return null;
          }

          if (effectiveStatus === PaymentStatus.SUCCESS && payment.amount === record.amount) {
            return { matchedConcurrently: true } as const;
          }

          if (effectiveStatus !== PaymentStatus.INITIATED) {
            return null;
          }

          const settledDue = lockedDues.find((d) => d.status === DueStatus.PAID);
          if (settledDue) {
            return {
              conflictReason: `CONFLICT_DUE_ALREADY_PAID: Installment due ${settledDue.id} was already settled by another payment for Gateway Order ${record.gatewayOrderId}. Manual refund review required.`,
            } as const;
          }

          // 2. Update Payment to SUCCESS with audit notes
          const settlementNotes = payment.notes
            ? `${payment.notes} | Auto-resolved Ghost Drop via Settlement (Ref: ${record.gatewayPaymentId})`
            : `Auto-resolved Ghost Drop via Settlement (Ref: ${record.gatewayPaymentId})`;

          const updatedPayment = await tx.payment.update({
            where: { id: payment.id },
            data: {
              paymentStatus: PaymentStatus.SUCCESS,
              notes: settlementNotes,
            },
          });

          // 3. Mark Installment Due(s) as PAID & Recalculate Arrears
          for (const alloc of payment.allocations) {
            await tx.installmentDue.update({
              where: { id: alloc.installmentDueId },
              data: {
                status: DueStatus.PAID,
                paidAmount: alloc.amountAllocated,
              },
            });

            // Recalculate consecutive arrears on ticket (canonical ADR-07 longest contiguous streak)
            const allDues = await tx.installmentDue.findMany({
              where: { ticketId: alloc.ticketId },
              orderBy: { installmentMonth: 'desc' },
            });

            const consecutiveUnpaid = computeMaxConsecutiveUnpaidMonths(allDues, {
              treatAsPaidIds: [alloc.installmentDueId],
            });

            await tx.subscriberTicket.update({
              where: { id: alloc.ticketId },
              data: {
                consecutiveUnpaidMonths: consecutiveUnpaid,
                status: deriveTicketArrearsStatus(consecutiveUnpaid, alloc.ticket.status),
              },
            });
          }

          // 4. Sequential Bilingual Receipt Generation strictly inside locked Branch transaction
          let receipt = await tx.receipt.findUnique({ where: { paymentId: payment.id } });
          if (!receipt) {
            const finalReceiptNumber = await generateNextReceiptNumber(tx, prefix);

            receipt = await tx.receipt.create({
              data: {
                branchId,
                paymentId: payment.id,
                receiptNumber: finalReceiptNumber,
                isBilingual: true,
                issuedAt: record.settledAt || new Date(),
              },
            });
          }

          return { payment: updatedPayment, receipt };
        }, undefined, PAYMENT_TRANSACTION_OPTIONS);

        if (
          txResult &&
          'conflictReason' in txResult &&
          typeof txResult.conflictReason === 'string'
        ) {
          exceptionCount++;
          details.push(txResult.conflictReason);
          this.logger.warn(txResult.conflictReason);
          continue;
        }

        if (txResult && 'matchedConcurrently' in txResult && txResult.matchedConcurrently) {
          matchedCount++;
          continue;
        }

        if (txResult) {
          autoResolvedGhostDropsCount++;
          const receiptNo = txResult.receipt?.receiptNumber || 'N/A';
          const msg = `Auto-resolved Ghost Drop: Payment ${payment.id} (Order ${record.gatewayOrderId}) updated to SUCCESS with Receipt ${receiptNo}.`;
          details.push(msg);
          this.logger.log(msg);

          // 5. Post-Commit Non-Blocking Receipt Notification
          if (this.notificationService && txResult.receipt) {
            const primaryAlloc = payment.allocations[0];
            if (primaryAlloc?.ticket?.customer) {
              try {
                await this.notificationService.dispatchPaymentReceipt({
                  paymentId: payment.id,
                  receiptNumber: txResult.receipt.receiptNumber,
                  recipientPhone: primaryAlloc.ticket.customer.phone,
                  subscriberName: primaryAlloc.ticket.customer.fullName,
                  amountPaid: payment.amount.toString(),
                  chitCode: primaryAlloc.ticket.chitGroup?.groupCode || 'KCA',
                  ticketNumber: primaryAlloc.ticket.ticketNumber,
                  paymentMode: payment.paymentMethod,
                  transactionTimestamp: (record.settledAt || new Date()).toISOString(),
                  receiptDownloadUrl: '',
                  passbookAppUrl: `https://app.kumaranfinance.in/passbook/${primaryAlloc.ticketId}`,
                  fcmToken: primaryAlloc.ticket.customer.fcmToken || undefined,
                });
              } catch (notifyErr: any) {
                this.logger.warn(`Failed to dispatch reconciliation receipt notification: ${notifyErr.message}`);
              }
            }
          }

          continue;
        }
      }

      // Scenario 3: Amount Discrepancy or Status Mismatch
      exceptionCount++;
      const msg = `Discrepancy on Order ${record.gatewayOrderId}: Gateway status=${record.status}, amount=${record.amount}; Internal status=${payment.paymentStatus}, amount=${payment.amount}`;
      details.push(msg);
      this.logger.warn(msg);
    }

    const result: ReconciliationJobResult = {
      executionTimestamp: new Date().toISOString(),
      matchedCount,
      autoResolvedGhostDropsCount,
      exceptionCount,
      details,
    };

    this.logger.log(
      `Reconciliation complete: ${matchedCount} matched, ${autoResolvedGhostDropsCount} ghost drops resolved, ${exceptionCount} exceptions.`,
    );

    return result;
  }
}
