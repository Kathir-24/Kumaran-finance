import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PRESIGNED_URL_EXPIRES_IN_SECONDS } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentAccessHelper } from '../storage/helpers/document-access.helper';
import { StorageKeyHelper } from '../storage/helpers/storage-key.helper';
import { StorageService } from '../storage/storage.service';
import { FormXviiMinutesTemplate } from './templates/form-xvii-minutes.template';
import { FormXxiPassbookTemplate } from './templates/form-xxi-passbook.template';
import { PayoutVoucherTemplate } from './templates/payout-voucher.template';
import { SubscriptionReceiptTemplate } from './templates/subscription-receipt.template';

export interface GeneratedPdfResult {
  buffer: Buffer;
  key: string;
  presignedUrl: string;
}

@Injectable()
export class PdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Generates a bilingual 80mm subscription receipt PDF, uploads to storage, and updates receipt.
   */
  async generateReceiptPdf(
    paymentId: string,
    requestingUser: JwtPayload,
  ): Promise<GeneratedPdfResult> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        receipt: true,
        recordedByUser: { select: { name: true } },
        allocations: {
          include: {
            due: true,
            ticket: {
              include: {
                chitGroup: {
                  include: {
                    branch: true,
                  },
                },
                customer: true,
              },
            },
          },
        },
      },
    });

    if (!payment || !payment.receipt) {
      throw new NotFoundException('Payment or receipt not found');
    }

    // Enforce 6-persona ownership & data scoping
    DocumentAccessHelper.assertReceiptAccess(payment, requestingUser);

    const firstAlloc = payment.allocations[0];
    if (!firstAlloc) {
      throw new BadRequestException('Payment has no ticket allocations');
    }

    const ticket = firstAlloc.ticket;
    const chit = ticket.chitGroup;
    const due = firstAlloc.due;
    const customer = ticket.customer;

    const buffer = await SubscriptionReceiptTemplate.generate({
      receiptNumber: payment.receipt.receiptNumber,
      date: payment.createdAt,
      groupCode: chit.groupCode,
      installmentMonth: due.installmentMonth,
      durationMonths: chit.durationMonths,
      ticketNumber: ticket.ticketNumber,
      subscriberName: customer.fullName,
      subscriberNameTamil: customer.fullNameTamil,
      address: `${customer.addressLine1}, ${customer.city}`,
      phone: customer.phone,
      baseInstallment: due.grossAmount,
      dividendDeduction: due.dividendDeduction,
      netPayableAmount: due.netPayableAmount,
      amountPaid: payment.amount,
      paymentMethod: payment.paymentMethod,
      collectedByName: payment.recordedByUser.name,
      branchName: chit.branch.name,
      branchAddress: chit.branch.address,
      branchPhone: chit.branch.phone,
    });

    const year = payment.createdAt.getFullYear();
    const branchCode = chit.branch.id.split('-').pop() || 'PRD';
    const key = StorageKeyHelper.receiptPdf(branchCode, year, payment.receipt.receiptNumber);

    const upload = await this.storageService.uploadFile(key, buffer, 'application/pdf');

    // Update receipt with S3 storage key
    await this.prisma.receipt.update({
      where: { id: payment.receipt.id },
      data: { pdfS3Key: upload.key },
    });

    const presignedUrl = await this.storageService.getPresignedUrl(
      upload.key,
      PRESIGNED_URL_EXPIRES_IN_SECONDS,
    );

    return { buffer, key: upload.key, presignedUrl };
  }

  /**
   * Generates a bilingual prize payout voucher PDF, uploads to storage, and returns presigned URL.
   */
  async generatePayoutVoucherPdf(
    auctionId: string,
    requestingUser: JwtPayload,
  ): Promise<GeneratedPdfResult> {
    const winner = await this.prisma.auctionWinner.findUnique({
      where: { auctionId },
      include: {
        auction: {
          include: {
            chitGroup: {
              include: { branch: true },
            },
          },
        },
        ticket: {
          include: { customer: true },
        },
      },
    });

    if (!winner || winner.disbursementStatus !== 'DISBURSED') {
      throw new NotFoundException('Prize winner not found or prize payout not yet released');
    }

    // Enforce 6-persona ownership & data scoping
    DocumentAccessHelper.assertVoucherAccess(winner, requestingUser);

    const auction = winner.auction;
    const chit = auction.chitGroup;
    const ticket = winner.ticket;
    const customer = ticket.customer;

    const [verifiedUser, authorizedUser] = await Promise.all([
      winner.verifiedByUserId
        ? this.prisma.user.findUnique({ where: { id: winner.verifiedByUserId }, select: { name: true } })
        : null,
      winner.authorizedByUserId
        ? this.prisma.user.findUnique({ where: { id: winner.authorizedByUserId }, select: { name: true } })
        : null,
    ]);

    const voucherNumber = winner.paymentReference || `KC-VOU-${chit.groupCode}-M${auction.installmentMonth}`;

    const buffer = await PayoutVoucherTemplate.generate({
      voucherNumber,
      disbursedAt: winner.disbursedAt || new Date(),
      groupCode: chit.groupCode,
      chitValue: chit.chitValue,
      installmentMonth: auction.installmentMonth,
      auctionDate: auction.auctionDate,
      ticketNumber: ticket.ticketNumber,
      winnerCode: customer.customerCode,
      winnerName: customer.fullName,
      winnerNameTamil: customer.fullNameTamil,
      phone: customer.phone,
      bidDiscount: auction.bidDiscount || 0n,
      netPrizeMoney: winner.disbursedAmount || (chit.chitValue - (auction.bidDiscount || 0n)),
      disbursementMode: winner.disbursementMode || 'CASH',
      paymentReference: winner.paymentReference || 'N/A',
      agreementSigned: winner.agreementSigned,
      nomineeSigned: winner.nomineeSigned,
      isSecurityRequired: winner.isSecurityRequired,
      blankChequeDetails: winner.blankChequeDetails,
      verifiedByUserName: verifiedUser?.name || 'Authorized Staff',
      authorizedByUserName: authorizedUser?.name || 'Managing Partner',
      branchName: chit.branch.name,
      branchAddress: chit.branch.address,
    });

    const year = (winner.disbursedAt || new Date()).getFullYear();
    const branchCode = chit.branch.id.split('-').pop() || 'PRD';
    const key = StorageKeyHelper.voucherPdf(branchCode, year, voucherNumber);

    const upload = await this.storageService.uploadFile(key, buffer, 'application/pdf');
    const presignedUrl = await this.storageService.getPresignedUrl(
      upload.key,
      PRESIGNED_URL_EXPIRES_IN_SECONDS,
    );

    return { buffer, key: upload.key, presignedUrl };
  }

  /**
   * Generates Form XVII statutory auction minutes PDF and saves to storage.
   */
  async generateAuctionMinutesPdf(
    auctionId: string,
    requestingUser: JwtPayload,
  ): Promise<GeneratedPdfResult> {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        chitGroup: { include: { branch: true } },
        winner: {
          include: { ticket: { include: { customer: true } } },
        },
        tieBidders: {
          include: { ticket: { include: { customer: true } } },
          orderBy: { tokenNumber: 'asc' },
        },
        minutes: true,
      },
    });

    if (!auction || !auction.winner) {
      throw new NotFoundException('Finalized auction or winner not found');
    }

    // Enforce 6-persona ownership & data scoping
    DocumentAccessHelper.assertMinutesAccess(auction, requestingUser);

    const chit = auction.chitGroup;
    const winnerTicket = auction.winner.ticket;
    const winnerCustomer = winnerTicket.customer;

    const buffer = await FormXviiMinutesTemplate.generate({
      groupCode: chit.groupCode,
      groupName: chit.groupName,
      chitValue: chit.chitValue,
      durationMonths: chit.durationMonths,
      baseInstallment: chit.baseInstallment,
      sanctionOrderNumber: chit.sanctionOrderNumber,
      installmentMonth: auction.installmentMonth,
      auctionDate: auction.auctionDate,
      bidDiscount: auction.bidDiscount || 0n,
      foremanCommissionAmount: auction.foremanCommissionAmount || 0n,
      totalDividend: auction.totalDividend || 0n,
      dividendPerTicket: auction.dividendPerTicket || 0n,
      nextMonthNetInstallment: chit.baseInstallment - (auction.dividendPerTicket || 0n),
      prizeMoney: auction.prizeMoney || (chit.chitValue - (auction.bidDiscount || 0n)),
      winnerTicketNumber: winnerTicket.ticketNumber,
      winnerName: winnerCustomer.fullName,
      winnerNameTamil: winnerCustomer.fullNameTamil,
      winnerCustomerCode: winnerCustomer.customerCode,
      winnerPhone: winnerCustomer.phone,
      wasTieBreakWinner: auction.winner.wasTieBreakWinner,
      tiedBidders: auction.tieBidders.map((tb) => ({
        ticketNumber: tb.ticket.ticketNumber,
        customerName: tb.ticket.customer.fullName,
        tokenNumberDrawn: tb.tokenNumber,
        isWinner: tb.isWinner,
      })),
      subscribersPresent: auction.minutes?.subscribersPresent || 0,
      minutesText: auction.minutes?.minutesText || 'Minutes pending entry',
      signedByForeman: auction.minutes?.signedByForeman || false,
    });

    const key = StorageKeyHelper.auctionMinutesPdf(chit.id, auction.installmentMonth);
    const upload = await this.storageService.uploadFile(key, buffer, 'application/pdf');
    const presignedUrl = await this.storageService.getPresignedUrl(
      upload.key,
      PRESIGNED_URL_EXPIRES_IN_SECONDS,
    );

    return { buffer, key: upload.key, presignedUrl };
  }

  /**
   * Generates Form XXI subscriber passbook ledger PDF and saves to storage.
   */
  async generatePassbookPdf(
    ticketId: string,
    requestingUser: JwtPayload,
  ): Promise<GeneratedPdfResult> {
    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: ticketId },
      include: {
        customer: true,
        chitGroup: true,
        dues: {
          orderBy: { installmentMonth: 'asc' },
          include: {
            allocations: {
              include: {
                payment: {
                  include: { receipt: true },
                },
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Subscriber ticket not found');
    }

    // Enforce 6-persona ownership & data scoping
    DocumentAccessHelper.assertPassbookAccess(ticket, requestingUser);

    let totalGrossDue = 0n;
    let totalDividendCredit = 0n;
    let totalNetPayable = 0n;
    let totalPaid = 0n;
    let totalOutstandingArrears = 0n;

    const schedule = ticket.dues.map((d) => {
      totalGrossDue += d.grossAmount;
      totalDividendCredit += d.dividendDeduction;
      totalNetPayable += d.netPayableAmount;
      totalPaid += d.paidAmount;

      const unpaidDue = d.status !== 'PAID' ? d.netPayableAmount - d.paidAmount : 0n;
      if (unpaidDue > 0n) {
        totalOutstandingArrears += unpaidDue;
      }

      const alloc = d.allocations[0];
      return {
        installmentMonth: d.installmentMonth,
        dueDate: d.dueDate,
        grossAmount: d.grossAmount,
        dividendDeduction: d.dividendDeduction,
        netPayableAmount: d.netPayableAmount,
        paidAmount: d.paidAmount,
        status: d.status,
        paymentDate: alloc?.payment.createdAt || null,
        receiptNumber: alloc?.payment.receipt?.receiptNumber || null,
      };
    });

    const chit = ticket.chitGroup;
    const customer = ticket.customer;

    const buffer = await FormXxiPassbookTemplate.generate({
      groupCode: chit.groupCode,
      groupName: chit.groupName,
      chitValue: chit.chitValue,
      durationMonths: chit.durationMonths,
      baseInstallment: chit.baseInstallment,
      ticketNumber: ticket.ticketNumber,
      isPrized: ticket.isPrized,
      customerCode: customer.customerCode,
      customerName: customer.fullName,
      customerNameTamil: customer.fullNameTamil,
      phone: customer.phone,
      totalGrossDue,
      totalDividendCredit,
      totalNetPayable,
      totalPaid,
      totalOutstandingArrears,
      schedule,
    });

    const key = `passbooks/${chit.id}/ticket-${ticket.ticketNumber}.pdf`;
    const upload = await this.storageService.uploadFile(key, buffer, 'application/pdf');
    const presignedUrl = await this.storageService.getPresignedUrl(
      upload.key,
      PRESIGNED_URL_EXPIRES_IN_SECONDS,
    );

    return { buffer, key: upload.key, presignedUrl };
  }
}
