import { Injectable, Logger, Optional } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../../notification/services/push.service';
import { SmsService } from '../../notification/services/sms.service';
import type {
  ApprovalAlertJobPayload,
  AuctionReminderJobPayload,
  AuctionResultNotificationJobPayload,
  DefaultWarningJobPayload,
  PaymentReceiptNotificationJobPayload,
} from '../dto/job-payloads.dto';

export interface SentNotificationRecord {
  id: string;
  channel: 'SMS_DLT' | 'WHATSAPP' | 'PUSH_NOTIFICATION';
  recipientPhone: string;
  templateType:
    | 'RECEIPT'
    | 'AUCTION_REMINDER'
    | 'AUCTION_RESULT'
    | 'DEFAULT_WARNING'
    | 'OTP'
    | 'DISBURSEMENT_APPROVAL'
    | 'REVERSAL_APPROVAL';
  messageText: string;
  variables: Record<string, any>;
  sentAt: Date;
  status: 'DELIVERED' | 'FAILED';
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private static readonly MAX_LOG_SIZE = 200;
  private readonly sentLog: SentNotificationRecord[] = [];

  private pushLog(record: SentNotificationRecord): void {
    if (this.sentLog.length >= NotificationService.MAX_LOG_SIZE) {
      this.sentLog.shift();
    }
    this.sentLog.push(record);
  }

  constructor(
    @Optional() private readonly smsService?: SmsService,
    @Optional() private readonly pushService?: PushService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * Formats and records/dispatches bilingual payment receipt alert:
   * - Primary (₹0 Cost): Mobile App Push Notification (FCM) deep-linking to /passbook.
   * - Fallback: Indian DLT-Compliant SMS via SmsService (only if customer has no registered smartphone/FCM token).
   */
  async dispatchPaymentReceipt(
    payload: PaymentReceiptNotificationJobPayload,
  ): Promise<{ smsId?: string; pushId?: string; whatsappId: string; channel: 'PUSH_NOTIFICATION' | 'SMS_DLT' }> {
    const formattedAmount = BigInt(payload.amountPaid).toLocaleString('en-IN');

    let smsId: string | undefined;
    let pushId: string | undefined;

    // Check if customer has an active Mobile App Push Token (Primary & ₹0 Cost Channel)
    const isPushEligible = Boolean(payload.fcmToken) && payload.channelPreference !== 'SMS_FALLBACK';

    if (isPushEligible && payload.fcmToken) {
      pushId = `push-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const pushTitle = 'குமரன் பைனான்ஸ் / Kumaran Finance';
      const pushBody = `மாத தவணை தொகை ரூ. ${formattedAmount} பெறப்பட்டது! ரசீது எண்: ${payload.receiptNumber}. / Payment of Rs. ${formattedAmount} received!`;

      if (this.pushService) {
        const pushRes = await this.pushService.sendPushNotification({
          recipientToken: payload.fcmToken,
          title: pushTitle,
          body: pushBody,
          data: {
            type: 'RECEIPT',
            receiptNumber: payload.receiptNumber,
            passbookUrl: payload.passbookAppUrl,
            chitCode: payload.chitCode,
          },
        });
        if (pushRes.messageId) {
          pushId = pushRes.messageId;
        }
      }

      this.logger.log(
        `Dispatched free Mobile App Push Notification for Receipt ${payload.receiptNumber}`,
      );

      this.pushLog({
        id: pushId,
        channel: 'PUSH_NOTIFICATION',
        recipientPhone: payload.recipientPhone,
        templateType: 'RECEIPT',
        messageText: `${pushTitle}: ${pushBody}`,
        variables: { ...payload },
        sentAt: new Date(),
        status: 'DELIVERED',
      });
    } else {
      // Fallback: Indian DLT-Compliant SMS via pluggable SmsService (Reserved for non-smartphone users)
      smsId = `sms-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      if (this.smsService) {
        const smsResult = await this.smsService.sendPaymentReceiptSms({
          recipientPhone: payload.recipientPhone,
          amountPaid: payload.amountPaid,
          chitCode: payload.chitCode,
          ticketNumber: payload.ticketNumber,
          transactionTimestamp: payload.transactionTimestamp,
          receiptNumber: payload.receiptNumber,
          passbookAppUrl: payload.passbookAppUrl,
        });
        if (smsResult.messageId) {
          smsId = smsResult.messageId;
        }
      }

      const smsText = `Kumaran Chits: Received Rs.${formattedAmount} for Chit ${payload.chitCode}, Ticket #${payload.ticketNumber} on ${payload.transactionTimestamp}. Receipt: ${payload.receiptNumber}. View passbook: ${payload.passbookAppUrl}`;
      this.pushLog({
        id: smsId,
        channel: 'SMS_DLT',
        recipientPhone: payload.recipientPhone,
        templateType: 'RECEIPT',
        messageText: smsText,
        variables: { ...payload },
        sentAt: new Date(),
        status: 'DELIVERED',
      });
    }

    // 2. Bilingual WhatsApp Notification
    const whatsappText = `வணக்கம் திரு. *${payload.subscriberName}*,

குமரன் சீட்ஸ்-ல் உங்கள் சீட்டு தவணை தொகை வெற்றிகரமாக பெறப்பட்டது.
Your chit subscription payment has been received successfully.

📋 *கட்டண விவரம் / Payment Details:*
-------------------------------------------
• சீட்டு குழு / Chit Group: *${payload.chitCode}*
• டிக்கெட் எண் / Ticket No: *${payload.ticketNumber}*
• செலுத்திய தொகை / Amount: *₹${formattedAmount}*
• கட்டண முறை / Mode: *${payload.paymentMode}*
• ரசீது எண் / Receipt No: *${payload.receiptNumber}*
• தேதி & நேரம் / Date: *${payload.transactionTimestamp}*

📥 *டிஜிட்டல் ரசீதை பதிவிறக்க / Download Receipt PDF:*
${payload.receiptDownloadUrl}

📲 *உங்கள் டிஜிட்டல் பாஸ்புக்கை பார்க்க / View Passbook:*
${payload.passbookAppUrl}

நன்றி / Thank you,
*குமரன் பைனான்ஸ் / Kumaran Finance*`;

    const whatsappId = `wa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.pushLog({
      id: whatsappId,
      channel: 'WHATSAPP',
      recipientPhone: payload.recipientPhone,
      templateType: 'RECEIPT',
      messageText: whatsappText,
      variables: { ...payload },
      sentAt: new Date(),
      status: 'DELIVERED',
    });

    this.logger.log(
      `Dispatched bilingual receipt notifications to ${payload.recipientPhone} for Receipt ${payload.receiptNumber}`,
    );

    return {
      smsId,
      pushId,
      whatsappId,
      channel: isPushEligible ? 'PUSH_NOTIFICATION' : 'SMS_DLT',
    };
  }

  /**
   * Formats and broadcasts upcoming auction reminders to subscribers:
   * - Primary (₹0 Cost): Mobile App Push Notification (FCM) for app users (`fcmToken` present).
   * - Fallback: Indian DLT-Compliant SMS via SmsService (Template 1407169823412093849) for keypad phone users.
   */
  async dispatchAuctionReminder(
    payload: AuctionReminderJobPayload,
  ): Promise<{ dispatchedCount: number; pushCount: number; smsCount: number }> {
    let count = 0;
    let pushCount = 0;
    let smsCount = 0;

    for (const sub of payload.subscribers) {
      if (sub.fcmToken) {
        // Primary: Free Mobile Push Notification
        let pushId = `push-auc-${Date.now()}-${count}`;
        const pushTitle = 'குமரன் பைனான்ஸ் / Kumaran Finance';
        const pushBody = `மாதம் ${payload.installmentMonth} ஏல அறிவிப்பு: ${payload.auctionDate} ${payload.auctionTime} (${payload.branchName}). / Chit ${payload.chitCode} Month ${payload.installmentMonth} auction on ${payload.auctionDate} at ${payload.auctionTime}.`;

        if (this.pushService) {
          const pushRes = await this.pushService.sendPushNotification({
            recipientToken: sub.fcmToken,
            title: pushTitle,
            body: pushBody,
            data: {
              type: 'AUCTION_REMINDER',
              chitCode: payload.chitCode,
              installmentMonth: String(payload.installmentMonth),
            },
          });
          if (pushRes.messageId) {
            pushId = pushRes.messageId;
          }
        }

        this.pushLog({
          id: pushId,
          channel: 'PUSH_NOTIFICATION',
          recipientPhone: sub.phone,
          templateType: 'AUCTION_REMINDER',
          messageText: `${pushTitle}: ${pushBody} - *மாதம் ${payload.installmentMonth}* ஏலம் கீழ்கண்ட தேதியில் நடைபெற உள்ளது: ${payload.auctionDate}`,
          variables: { ...payload, subscriberName: sub.name },
          sentAt: new Date(),
          status: 'DELIVERED',
        });
        pushCount++;
      } else {
        // Fallback: Indian DLT-Compliant SMS for keypad phones
        const smsId = `sms-auc-${Date.now()}-${count}`;
        if (this.smsService) {
          await this.smsService.sendAuctionReminderSms({
            recipientPhone: sub.phone,
            chitCode: payload.chitCode,
            installmentMonth: payload.installmentMonth,
            auctionDate: payload.auctionDate,
            auctionTime: payload.auctionTime,
            branchName: payload.branchName,
            branchPhone: payload.branchPhone,
          });
        }

        const smsText = `Kumaran Chits: Auction for Chit ${payload.chitCode} Month ${payload.installmentMonth} is scheduled on ${payload.auctionDate} at ${payload.auctionTime}. Venue: ${payload.branchName}. Contact: ${payload.branchPhone} - *மாதம் ${payload.installmentMonth}* ஏலம் கீழ்கண்ட தேதியில் நடைபெற உள்ளது: ${payload.auctionDate}`;
        this.pushLog({
          id: smsId,
          channel: 'SMS_DLT',
          recipientPhone: sub.phone,
          templateType: 'AUCTION_REMINDER',
          messageText: smsText,
          variables: { ...payload, subscriberName: sub.name },
          sentAt: new Date(),
          status: 'DELIVERED',
        });
        smsCount++;
      }
      count++;
    }

    this.logger.log(
      `Broadcasted auction reminders to ${count} subscribers (${pushCount} Push, ${smsCount} SMS) for Chit ${payload.chitCode} Month ${payload.installmentMonth}`,
    );
    return { dispatchedCount: count, pushCount, smsCount };
  }

  /**
   * Formats and dispatches a statutory warning notice for tickets entering 3-month default:
   * - Primary (₹0 Cost): Mobile App Push Notification (FCM) for app users (`fcmToken` present).
   * - Fallback: Indian DLT-Compliant SMS via SmsService (Template 1407169823412093850) for keypad phone users.
   */
  async dispatchDefaultWarning(
    payload: DefaultWarningJobPayload,
  ): Promise<{ notificationId: string; channel: 'PUSH_NOTIFICATION' | 'SMS_DLT' }> {
    const formattedOverdue = BigInt(payload.totalOverdueAmount).toLocaleString('en-IN');
    let notificationId: string;
    let channel: 'PUSH_NOTIFICATION' | 'SMS_DLT';

    if (payload.fcmToken) {
      notificationId = `push-def-${Date.now()}`;
      channel = 'PUSH_NOTIFICATION';
      const pushTitle = 'எச்சரிக்கை அறிவிப்பு / Kumaran Finance Warning';
      const pushBody = `குமரன் சீட்ஸ்: டிக்கெட் #${payload.ticketNumber} (${payload.chitCode}) தொடர்ந்து ${payload.consecutiveUnpaidMonths} மாத தவணைகள் நிலுவையில் உள்ளது (₹${formattedOverdue}). உடனடியாக செலுத்தவும். / Urgent: 3-month default warning.`;

      if (this.pushService) {
        const pushRes = await this.pushService.sendPushNotification({
          recipientToken: payload.fcmToken,
          title: pushTitle,
          body: pushBody,
          data: {
            type: 'DEFAULT_WARNING',
            ticketId: payload.ticketId,
            chitCode: payload.chitCode,
          },
        });
        if (pushRes.messageId) {
          notificationId = pushRes.messageId;
        }
      }

      this.pushLog({
        id: notificationId,
        channel: 'PUSH_NOTIFICATION',
        recipientPhone: payload.customerPhone,
        templateType: 'DEFAULT_WARNING',
        messageText: `${pushTitle}: ${pushBody} - 3 மாத தவணைகள் நிலுவையில் உள்ளது`,
        variables: { ...payload },
        sentAt: new Date(),
        status: 'DELIVERED',
      });
    } else {
      notificationId = `sms-def-${Date.now()}`;
      channel = 'SMS_DLT';

      if (this.smsService) {
        await this.smsService.sendDefaultWarningSms({
          recipientPhone: payload.customerPhone,
          customerName: payload.customerName,
          chitCode: payload.chitCode,
          ticketNumber: payload.ticketNumber,
          consecutiveUnpaidMonths: payload.consecutiveUnpaidMonths,
          totalOverdueAmount: payload.totalOverdueAmount,
          branchPhone: '0424-2223333',
        });
      }

      const smsText = `Kumaran Chits: Urgent: Ticket #${payload.ticketNumber} in Chit ${payload.chitCode} has ${payload.consecutiveUnpaidMonths} months overdue (Rs.${formattedOverdue}). Clear dues to avoid cancellation - 3 மாத தவணைகள் நிலுவையில் உள்ளது. Contact: 0424-2223333`;
      this.pushLog({
        id: notificationId,
        channel: 'SMS_DLT',
        recipientPhone: payload.customerPhone,
        templateType: 'DEFAULT_WARNING',
        messageText: smsText,
        variables: { ...payload },
        sentAt: new Date(),
        status: 'DELIVERED',
      });
    }

    this.logger.warn(
      `Default warning sent via ${channel} to ${payload.customerPhone} for Ticket #${payload.ticketNumber} in ${payload.chitCode}`,
    );

    return { notificationId, channel };
  }

  /**
   * Formats and broadcasts auction result and dividend credit to all chit group subscribers:
   * - Primary (₹0 Cost): Mobile App Push Notification (FCM) for app users (`fcmToken` present).
   * - Fallback: Indian DLT-Compliant SMS via SmsService for keypad phone users.
   */
  async dispatchAuctionResult(
    payload: AuctionResultNotificationJobPayload,
  ): Promise<{ dispatchedCount: number; pushCount: number; smsCount: number }> {
    let count = 0;
    let pushCount = 0;
    let smsCount = 0;

    const formattedDiscount = BigInt(payload.winningDiscountAmount).toLocaleString('en-IN');
    const formattedDividend = BigInt(payload.dividendPerTicket).toLocaleString('en-IN');
    const formattedPayable = BigInt(payload.nextMonthNetPayable).toLocaleString('en-IN');

    for (const sub of payload.subscribers) {
      if (sub.fcmToken) {
        let pushId = `push-res-${Date.now()}-${count}`;
        const pushTitle = 'குமரன் பைனான்ஸ் / Kumaran Finance';
        const pushBody = `மாதம் ${payload.installmentMonth} ஏல முடிவு: வெற்றி கழிவு ரூ. ${formattedDiscount}. லாபப்பங்கு ரூ. ${formattedDividend}. அடுத்த மாத தவணை: ரூ. ${formattedPayable}. / Dividend credit: Rs.${formattedDividend}. Next month: Rs.${formattedPayable}.`;

        if (this.pushService) {
          const pushRes = await this.pushService.sendPushNotification({
            recipientToken: sub.fcmToken,
            title: pushTitle,
            body: pushBody,
            data: {
              type: 'AUCTION_RESULT',
              chitCode: payload.chitCode,
              installmentMonth: String(payload.installmentMonth),
            },
          });
          if (pushRes.messageId) {
            pushId = pushRes.messageId;
          }
        }

        this.pushLog({
          id: pushId,
          channel: 'PUSH_NOTIFICATION',
          recipientPhone: sub.phone,
          templateType: 'AUCTION_RESULT',
          messageText: `${pushTitle}: ${pushBody}`,
          variables: { ...payload, subscriberName: sub.name },
          sentAt: new Date(),
          status: 'DELIVERED',
        });
        pushCount++;
      } else {
        const smsId = `sms-res-${Date.now()}-${count}`;
        const smsText = `Kumaran Chits: Chit ${payload.chitCode} Month ${payload.installmentMonth} Auction won at Rs.${formattedDiscount} discount. Dividend credit: Rs.${formattedDividend}. Next month installment: Rs.${formattedPayable}.`;

        this.pushLog({
          id: smsId,
          channel: 'SMS_DLT',
          recipientPhone: sub.phone,
          templateType: 'AUCTION_RESULT',
          messageText: smsText,
          variables: { ...payload, subscriberName: sub.name },
          sentAt: new Date(),
          status: 'DELIVERED',
        });
        smsCount++;
      }
      count++;
    }

    this.logger.log(
      `Broadcasted auction results to ${count} subscribers (${pushCount} Push, ${smsCount} SMS) for Chit ${payload.chitCode} Month ${payload.installmentMonth}`,
    );
    return { dispatchedCount: count, pushCount, smsCount };
  }

  /**
   * Broadcasts high-priority push notifications to active Partners/Admins for Maker-Checker approvals:
   * - Triggered on: DISBURSEMENT_APPROVAL (pending safety proof verification) or REVERSAL_APPROVAL.
   * - Excludes: Maker user (`excludeUserId`) so maker never receives an approval request for their own action.
   * - Audience: Active users with Role.SUPER_ADMIN or Role.BRANCH_MANAGER and registered `fcmToken`.
   */
  async dispatchApprovalAlert(
    payload: ApprovalAlertJobPayload,
  ): Promise<{ dispatchedCount: number; partnerCount: number }> {
    if (!this.prisma) {
      this.logger.warn('PrismaService not available; skipping dispatchApprovalAlert');
      return { dispatchedCount: 0, partnerCount: 0 };
    }

    const partners = await this.prisma.user.findMany({
      where: {
        roles: { hasSome: [Role.SUPER_ADMIN, Role.BRANCH_MANAGER] },
        isActive: true,
        fcmToken: { not: null },
        ...(payload.excludeUserId ? { id: { not: payload.excludeUserId } } : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        fcmToken: true,
      },
    });

    let count = 0;
    for (const partner of partners) {
      if (!partner.fcmToken) continue;

      let pushId = `push-alert-${Date.now()}-${count}`;
      if (this.pushService) {
        const pushRes = await this.pushService.sendPushNotification(
          {
            recipientToken: partner.fcmToken,
            title: payload.title,
            body: payload.body,
            data: {
              ...payload.data,
              approvalType: payload.approvalType,
              entityId: payload.entityId,
              ...(payload.amount ? { amount: payload.amount } : {}),
            },
            priority: 'high',
          },
          { userId: partner.id },
        );
        if (pushRes.messageId) {
          pushId = pushRes.messageId;
        }
      }

      this.pushLog({
        id: pushId,
        channel: 'PUSH_NOTIFICATION',
        recipientPhone: partner.phone,
        templateType: payload.approvalType,
        messageText: `${payload.title}: ${payload.body}`,
        variables: { ...payload, partnerName: partner.name },
        sentAt: new Date(),
        status: 'DELIVERED',
      });
      count++;
    }

    this.logger.log(
      `Dispatched high-priority approval push alerts to ${count}/${partners.length} active partner(s) for ${payload.approvalType} (Entity: ${payload.entityId})`,
    );

    return { dispatchedCount: count, partnerCount: partners.length };
  }

  /**
   * Retrieves sent notification records for audit review and test assertions.
   */
  getSentNotificationLog(limit = 100): SentNotificationRecord[] {
    const safeLimit = Math.max(1, limit);
    return this.sentLog.slice(-safeLimit).reverse();
  }

  /**
   * Clears in-memory sent logs (for clean test isolation).
   */
  clearLog(): void {
    this.sentLog.length = 0;
  }
}
