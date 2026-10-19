import { Injectable, Logger } from '@nestjs/common';
import { DueStatus } from '@prisma/client';
import { CONSECUTIVE_UNPAID_DEFAULT_THRESHOLD_MONTHS } from '../../common/constants';
import { PrismaService } from '../../prisma/prisma.service';
import type { DailyArrearsExecutionResult } from '../dto/job-payloads.dto';
import { NotificationService } from './notification.service';

@Injectable()
export class DailyArrearsService {
  private readonly logger = new Logger(DailyArrearsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Evaluates and transitions unpaid past-due installments to OVERDUE status,
   * recalculates consecutive unpaid months for each subscriber ticket,
   * updates default statuses (ADR-07), and dispatches default warnings.
   */
  async processDailyOverdueAndArrears(
    cutoffDate?: Date,
  ): Promise<DailyArrearsExecutionResult> {
    const effectiveCutoff = cutoffDate || new Date();
    this.logger.log(
      `Starting Daily Arrears & Defaulter job for cutoff date: ${effectiveCutoff.toISOString()}`,
    );

    // 1. Find all UNPAID dues where due date has passed
    const pastDueUnpaidDues = await this.prisma.installmentDue.findMany({
      where: {
        status: DueStatus.UNPAID,
        dueDate: { lt: effectiveCutoff },
      },
      select: { id: true, ticketId: true },
    });

    const duesToUpdateIds = pastDueUnpaidDues.map((d) => d.id);
    let duesTransitioned = 0;

    if (duesToUpdateIds.length > 0) {
      const updateResult = await this.prisma.installmentDue.updateMany({
        where: { id: { in: duesToUpdateIds } },
        data: { status: DueStatus.OVERDUE },
      });
      duesTransitioned = updateResult.count;
      this.logger.log(
        `Transitioned ${duesTransitioned} dues from UNPAID to OVERDUE`,
      );
    }

    // 2. Fetch all active tickets in active chit groups to re-evaluate arrears
    const tickets = await this.prisma.subscriberTicket.findMany({
      where: {
        status: { in: ['ACTIVE', 'DEFAULT_3_MONTHS'] },
        chitGroup: { status: 'ACTIVE' },
      },
      include: {
        customer: true,
        chitGroup: true,
        dues: {
          orderBy: { installmentMonth: 'desc' },
        },
      },
    });

    let ticketsInArrears = 0;
    let ticketsInDefault3M = 0;

    for (const ticket of tickets) {
      let consecutiveUnpaid = 0;
      let totalOverdue = 0n;

      // Count consecutive unpaid months starting from the latest month downwards
      for (const d of ticket.dues) {
        if (d.status !== DueStatus.PAID) {
          consecutiveUnpaid++;
          totalOverdue += (d.netPayableAmount - d.paidAmount);
        } else {
          break; // Stop at the first paid month
        }
      }

      const wasInDefault = ticket.status === 'DEFAULT_3_MONTHS';
      const isNowDefault =
        consecutiveUnpaid >= CONSECUTIVE_UNPAID_DEFAULT_THRESHOLD_MONTHS;
      const targetStatus = isNowDefault ? 'DEFAULT_3_MONTHS' : 'ACTIVE';

      if (consecutiveUnpaid > 0) {
        ticketsInArrears++;
      }
      if (isNowDefault) {
        ticketsInDefault3M++;
      }

      // Update ticket if status or consecutive count changed
      if (
        ticket.consecutiveUnpaidMonths !== consecutiveUnpaid ||
        ticket.status !== targetStatus
      ) {
        await this.prisma.subscriberTicket.update({
          where: { id: ticket.id },
          data: {
            consecutiveUnpaidMonths: consecutiveUnpaid,
            status: targetStatus,
          },
        });

        // Trigger default warning notification if newly entered DEFAULT_3_MONTHS
        if (!wasInDefault && isNowDefault) {
          await this.notificationService.dispatchDefaultWarning({
            ticketId: ticket.id,
            customerName: ticket.customer.fullName,
            customerPhone: ticket.customer.phone,
            chitCode: ticket.chitGroup.groupCode,
            ticketNumber: ticket.ticketNumber,
            consecutiveUnpaidMonths: consecutiveUnpaid,
            totalOverdueAmount: totalOverdue.toString(),
          });
        }
      }
    }

    const result: DailyArrearsExecutionResult = {
      executionTimestamp: new Date().toISOString(),
      cutoffDate: effectiveCutoff.toISOString(),
      duesTransitionedToOverdue: duesTransitioned,
      ticketsEvaluated: tickets.length,
      ticketsInArrears,
      ticketsInDefault3M,
    };

    this.logger.log(
      `Daily Arrears job completed: ${duesTransitioned} dues overdue, ${ticketsInArrears} in arrears, ${ticketsInDefault3M} in 3M default.`,
    );

    return result;
  }
}
