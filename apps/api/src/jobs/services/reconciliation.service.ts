import { Injectable, Logger, Optional } from '@nestjs/common';
import { DueStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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
        const branchCode = payment.allocations[0]?.ticket?.chitGroup?.branch?.code || 'PRD';
        const year = new Date().getFullYear();
        const prefix = `KC-REC-${branchCode}-${year}-`;

        const txResult = await this.prisma.$transaction(async (tx) => {
          // 1. Re-verify payment still INITIATED under transaction
          const current = await tx.payment.findUnique({
            where: { id: payment.id },
            select: { id: true, paymentStatus: true },
          });

          if (!current || current.paymentStatus !== PaymentStatus.INITIATED) {
            return null;
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

            // Recalculate consecutive arrears on ticket
            const allDues = await tx.installmentDue.findMany({
              where: {
                ticketId: alloc.ticketId,
                installmentMonth: { lte: alloc.due.installmentMonth },
              },
              orderBy: { installmentMonth: 'desc' },
            });

            let consecutiveUnpaid = 0;
            for (const d of allDues) {
              if (d.id === alloc.installmentDueId) {
                break;
              }
              if (d.status !== DueStatus.PAID) {
                consecutiveUnpaid++;
              } else {
                break;
              }
            }

            await tx.subscriberTicket.update({
              where: { id: alloc.ticketId },
              data: {
                consecutiveUnpaidMonths: consecutiveUnpaid,
                status: consecutiveUnpaid < 3 ? 'ACTIVE' : alloc.ticket.status,
              },
            });
          }

          // 4. Collision-Proof Sequential Bilingual Receipt Generation
          let receipt = await tx.receipt.findUnique({ where: { paymentId: payment.id } });
          if (!receipt) {
            const lastReceipt = await tx.receipt.findFirst({
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

            let finalReceiptNumber = `${prefix}${String(nextSeq).padStart(5, '0')}`;
            if (typeof tx.receipt?.findUnique === 'function') {
              while (await tx.receipt.findUnique({ where: { receiptNumber: finalReceiptNumber } })) {
                nextSeq++;
                finalReceiptNumber = `${prefix}${String(nextSeq).padStart(5, '0')}`;
              }
            }

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
        });

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
                  passbookAppUrl: '',
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
