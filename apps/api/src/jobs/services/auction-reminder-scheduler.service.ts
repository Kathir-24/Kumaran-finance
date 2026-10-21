import { Injectable, Logger } from '@nestjs/common';
import { AuctionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuctionReminderJobPayload } from '../dto/job-payloads.dto';
import { NotificationService } from './notification.service';

export interface ScanUpcomingAuctionsResult {
  chitsCount: number;
  remindersCount: number;
  details: string[];
}

@Injectable()
export class AuctionReminderSchedulerService {
  private readonly logger = new Logger(AuctionReminderSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Scans for scheduled chit auctions occurring in 3 days (or on targetDate)
   * and broadcasts bilingual push notifications and DLT SMS reminders to all group subscribers.
   */
  async scanAndBroadcastUpcomingAuctions(targetDate?: Date): Promise<ScanUpcomingAuctionsResult> {
    const scanDate = targetDate ? new Date(targetDate) : new Date();
    if (!targetDate) {
      // Default: 3 calendar days ahead
      scanDate.setDate(scanDate.getDate() + 3);
    }

    const startOfDay = new Date(scanDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(scanDate);
    endOfDay.setHours(23, 59, 59, 999);

    this.logger.log(
      `Scanning for scheduled auctions between ${startOfDay.toISOString()} and ${endOfDay.toISOString()}`,
    );

    const scheduledAuctions = await this.prisma.auction.findMany({
      where: {
        status: AuctionStatus.SCHEDULED,
        auctionDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        chitGroup: {
          include: {
            branch: true,
            tickets: {
              include: {
                customer: true,
              },
            },
          },
        },
      },
    });

    let totalReminders = 0;
    const details: string[] = [];

    for (const auction of scheduledAuctions) {
      const { chitGroup } = auction;
      const formattedDate = auction.auctionDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      const subscribers = chitGroup.tickets
        .filter((t) => t.customer && t.customer.phone)
        .map((t) => ({
          name: t.customer.fullName,
          phone: t.customer.phone,
          fcmToken: t.customer.fcmToken || undefined,
        }));

      if (subscribers.length === 0) {
        continue;
      }

      const payload: AuctionReminderJobPayload = {
        chitGroupId: chitGroup.id,
        chitCode: chitGroup.groupCode,
        installmentMonth: auction.installmentMonth,
        auctionDate: formattedDate,
        auctionTime: '10:30 AM',
        branchName: chitGroup.branch.name,
        branchAddress: chitGroup.branch.address,
        branchPhone: chitGroup.branch.phone,
        subscribers,
      };

      const dispatchResult = await this.notificationService.dispatchAuctionReminder(payload);
      totalReminders += dispatchResult.dispatchedCount;

      const summary = `Chit ${chitGroup.groupCode} Month ${auction.installmentMonth}: ${dispatchResult.dispatchedCount} reminders dispatched (${dispatchResult.pushCount} Push, ${dispatchResult.smsCount} SMS)`;
      details.push(summary);
      this.logger.log(summary);
    }

    this.logger.log(
      `Auction scan completed: ${scheduledAuctions.length} chits found, ${totalReminders} reminders broadcasted.`,
    );

    return {
      chitsCount: scheduledAuctions.length,
      remindersCount: totalReminders,
      details,
    };
  }
}
