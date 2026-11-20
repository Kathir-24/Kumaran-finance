import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuctionStatus, ChitStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuctionReminderJobPayload } from '../dto/job-payloads.dto';
import { NotificationService } from './notification.service';
import { RedisConnectionProvider } from '../providers/redis-connection.provider';
import { FIRST_AUCTION_MONTH } from '../../common/constants';
import {
  formatIstDate,
  getIstDayBounds,
  IST_OFFSET_MS,
} from '../../report/helpers/report-scope.helper';

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
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {}

  /**
   * Scans for scheduled chit auctions occurring in 3 days (or on targetDate)
   * and broadcasts bilingual push notifications and DLT SMS reminders to all group subscribers.
   */
  async scanAndBroadcastUpcomingAuctions(targetDate?: Date): Promise<ScanUpcomingAuctionsResult> {
    let targetIstDate: string | Date;
    if (targetDate) {
      targetIstDate = targetDate;
    } else {
      // Advance current instant shifted by IST_OFFSET_MS by 3 UTC days to get the exact target calendar date in IST
      const istShifted = new Date(Date.now() + IST_OFFSET_MS);
      istShifted.setUTCDate(istShifted.getUTCDate() + 3);
      const year = istShifted.getUTCFullYear();
      const month = String(istShifted.getUTCMonth() + 1).padStart(2, '0');
      const day = String(istShifted.getUTCDate()).padStart(2, '0');
      targetIstDate = `${year}-${month}-${day}`;
    }

    const { dateStr, startOfDay, endOfDay } = getIstDayBounds(targetIstDate);
    const istDateString = targetDate ? formatIstDate(targetDate) : dateStr;

    this.logger.log(
      `Scanning for scheduled auctions on IST date ${istDateString} between ${startOfDay.toISOString()} and ${endOfDay.toISOString()}`,
    );

    const scheduledAuctions = await this.prisma.auction.findMany({
      where: {
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: null,
        installmentMonth: { gte: FIRST_AUCTION_MONTH },
        chitGroup: {
          status: ChitStatus.ACTIVE,
        },
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
              where: {
                status: 'ACTIVE',
              },
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

      // Guardrail 5: Month N maturity settlement has no auction
      if (auction.installmentMonth >= chitGroup.durationMonths) {
        continue;
      }

      const formattedDate = auction.auctionDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
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

      // Cost & Anti-Spam Protection: 24-hour Redis broadcast idempotency lock per auction and month
      const broadcastLockKey = `lock:broadcast:auction:${auction.id}:${auction.installmentMonth}`;
      const redis = this.redisProvider?.getClient();
      if (redis && this.redisProvider?.getIsConnected()) {
        try {
          const acquired = await redis.set(broadcastLockKey, '1', 'EX', 86400, 'NX');
          if (!acquired) {
            this.logger.warn(
              `[AuctionReminder] Broadcast for Chit ${chitGroup.groupCode} Month ${auction.installmentMonth} has already been dispatched in the last 24 hours. Skipping duplicate dispatch to prevent excess SMS billing.`,
            );
            continue;
          }
        } catch (err: any) {
          this.logger.warn(
            `[AuctionReminder] Redis broadcast lock check error: ${err.message}. Proceeding with caution.`,
          );
        }
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
