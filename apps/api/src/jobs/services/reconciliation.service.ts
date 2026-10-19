import { Injectable, Logger } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executes daily settlement reconciliation against payment gateway records.
   * Auto-resolves ghost drops and flags discrepancies.
   */
  async reconcileSettlement(
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
        include: { allocations: true },
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
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { paymentStatus: PaymentStatus.SUCCESS },
        });

        autoResolvedGhostDropsCount++;
        const msg = `Auto-resolved Ghost Drop: Payment ${payment.id} (Order ${record.gatewayOrderId}) updated to SUCCESS.`;
        details.push(msg);
        this.logger.log(msg);
        continue;
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
