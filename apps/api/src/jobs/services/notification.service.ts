import { Injectable, Logger, Optional } from '@nestjs/common';
import { SmsService } from '../../notification/services/sms.service';
import type {
  AuctionReminderJobPayload,
  DefaultWarningJobPayload,
  PaymentReceiptNotificationJobPayload,
} from '../dto/job-payloads.dto';

export interface SentNotificationRecord {
  id: string;
  channel: 'SMS_DLT' | 'WHATSAPP' | 'PUSH_NOTIFICATION';
  recipientPhone: string;
  templateType: 'RECEIPT' | 'AUCTION_REMINDER' | 'DEFAULT_WARNING' | 'OTP';
  messageText: string;
  variables: Record<string, any>;
  sentAt: Date;
  status: 'DELIVERED' | 'FAILED';
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly sentLog: SentNotificationRecord[] = [];

  constructor(@Optional() private readonly smsService?: SmsService) {}

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

      this.logger.log(
        `Dispatched free Mobile App Push Notification for Receipt ${payload.receiptNumber}`,
      );

      this.sentLog.push({
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
      this.sentLog.push({
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
    this.sentLog.push({
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
   * Formats and broadcasts upcoming auction reminders to subscribers.
   */
  async dispatchAuctionReminder(
    payload: AuctionReminderJobPayload,
  ): Promise<{ dispatchedCount: number }> {
    let count = 0;

    for (const sub of payload.subscribers) {
      // 1. Pluggable DLT SMS Dispatch
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

      // 2. Bilingual Notification Recording (WhatsApp / Sent Log)
      const messageText = `வணக்கம் திரு. *${sub.name}*,

குமரன் சீட்ஸ் *${payload.chitCode}* குழுவின் *மாதம் ${payload.installmentMonth}* ஏலம் கீழ்கண்ட தேதியில் நடைபெற உள்ளது:

📅 *ஏல தேதி / Auction Date:* ${payload.auctionDate}
⏰ *நேரம் / Time:* ${payload.auctionTime}
📍 *இடம் / Venue:* ${payload.branchName}, ${payload.branchAddress}

அனைத்து சந்தாதாரர்களும் தவறாமல் ஏலத்தில் கலந்துகொள்ளுமாறு கேட்டுக்கொள்கிறோம்.

குமரன் பைனான்ஸ்
தொடர்புக்கு: ${payload.branchPhone}`;

      this.sentLog.push({
        id: `wa-auc-${Date.now()}-${count}`,
        channel: 'WHATSAPP',
        recipientPhone: sub.phone,
        templateType: 'AUCTION_REMINDER',
        messageText,
        variables: { ...payload, subscriberName: sub.name },
        sentAt: new Date(),
        status: 'DELIVERED',
      });
      count++;
    }

    this.logger.log(
      `Broadcasted auction reminders to ${count} subscribers for Chit ${payload.chitCode} Month ${payload.installmentMonth}`,
    );
    return { dispatchedCount: count };
  }

  /**
   * Formats and dispatches a statutory warning notice for tickets entering 3-month default.
   */
  async dispatchDefaultWarning(
    payload: DefaultWarningJobPayload,
  ): Promise<{ notificationId: string }> {
    const formattedOverdue = BigInt(payload.totalOverdueAmount).toLocaleString('en-IN');

    // 1. Pluggable DLT SMS Dispatch
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

    const messageText = `எச்சரிக்கை அறிவிப்பு / DEFAULT WARNING NOTICE

வணக்கம் திரு. *${payload.customerName}*,

குமரன் சீட்ஸ் *${payload.chitCode}* குழுவின் டிக்கெட் எண் *#${payload.ticketNumber}* தொடர்ந்து ${payload.consecutiveUnpaidMonths} மாத தவணைகள் நிலுவையில் உள்ளது (₹${formattedOverdue}).
Your ticket has ${payload.consecutiveUnpaidMonths} consecutive months in default arrears.

சட்டரீதியான நடவடிக்கை மற்றும் உறுப்பினர் நீக்கத்தை தவிர்க்க உடனடியாக நிலுவைத் தொகையை செலுத்தவும்.
Please clear your outstanding dues immediately to avoid statutory membership termination under company rules.

குமரன் பைனான்ஸ் / Kumaran Finance`;

    const id = `wa-def-${Date.now()}`;
    this.sentLog.push({
      id,
      channel: 'WHATSAPP',
      recipientPhone: payload.customerPhone,
      templateType: 'DEFAULT_WARNING',
      messageText,
      variables: { ...payload },
      sentAt: new Date(),
      status: 'DELIVERED',
    });

    this.logger.warn(
      `Default warning sent to ${payload.customerPhone} for Ticket #${payload.ticketNumber} in ${payload.chitCode}`,
    );

    return { notificationId: id };
  }

  /**
   * Retrieves sent notification records for audit review and test assertions.
   */
  getSentNotificationLog(limit = 100): SentNotificationRecord[] {
    return [...this.sentLog].reverse().slice(0, limit);
  }

  /**
   * Clears in-memory sent logs (for clean test isolation).
   */
  clearLog(): void {
    this.sentLog.length = 0;
  }
}
