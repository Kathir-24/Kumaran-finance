import { Role } from '@prisma/client';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { parseBigIntField } from '../../common/utils/bigint-json.util';
import type { PrismaService } from '../../prisma/prisma.service';

export interface MakerCheckerItemFlags {
  isOwnRequest?: boolean;
  canCurrentUserApprove?: boolean;
}

export interface PendingCashHandoverItem extends MakerCheckerItemFlags {
  collectorId: string;
  collectorName: string;
  collectorPhone?: string | null;
  branchId: string;
  totalAmount: string;
  paymentCount: number;
  oldestCollectionAt: Date | string;
  paymentIds: string[];
}

export interface PendingDisbursementAuthorizationItem extends MakerCheckerItemFlags {
  id: string;
  auctionId: string;
  chitGroupCode: string;
  chitGroupName: string;
  installmentMonth: number;
  customerCode: string;
  customerName: string;
  customerPhone: string;
  ticketNumber: number;
  netPayableAmount: string;
  disbursementMode?: string | null;
  verifiedByUserId?: string | null;
  agreementSigned: boolean;
  nomineeSigned: boolean;
  hasSecurityDoc: boolean;
}

export interface PendingPaymentReversalItem extends MakerCheckerItemFlags {
  id: string;
  paymentId: string;
  receiptNumber: string;
  amount: string;
  customerCode?: string;
  customerName?: string;
  reason: string;
  notes?: string | null;
  initiatedByUserId: string;
  createdAt: Date | string;
}

export interface PendingSafetyProofItem extends MakerCheckerItemFlags {
  id: string;
  auctionId: string;
  chitGroupCode: string;
  chitGroupName: string;
  installmentMonth: number;
  customerCode: string;
  customerName: string;
  customerPhone: string;
  ticketNumber: number;
  netPayableAmount: string;
  auctionDate: Date | string;
}

export interface PendingAuctionFinalizationItem extends MakerCheckerItemFlags {
  auctionId: string;
  chitGroupId: string;
  chitGroupCode: string;
  chitGroupName: string;
  installmentMonth: number;
  auctionDate: Date | string;
  bidDiscount: string;
  prizeMoney: string;
  dividendPerTicket: string;
  winningTicketNumber: number | null;
  winnerCustomerCode: string | null;
  winnerCustomerName: string | null;
  conductedByUserId: string;
}

export interface PendingAuctionCorrectionItem extends MakerCheckerItemFlags {
  correctionRequestId: string;
  auctionId: string;
  chitGroupId: string;
  chitGroupCode: string;
  chitGroupName: string;
  installmentMonth: number;
  currentBidDiscount: string;
  correctedBidDiscount: string;
  correctedTicketNumber: number | null;
  reason: string;
  requestedByUserId: string;
  requestedAt: Date | string;
}

export interface PendingDefaulterRemovalItem extends MakerCheckerItemFlags {
  ticketId: string;
  chitGroupId: string;
  chitGroupCode: string;
  chitGroupName: string;
  ticketNumber: number;
  customerCode: string;
  customerName: string;
  customerPhone: string;
  consecutiveUnpaidMonths: number;
  totalArrearsAmount: string;
  removalReason: string | null;
  removalRequestedByUserId: string | null;
  removalRequestedAt: Date | string | null;
}

export interface PendingFinalMonthSettlementItem extends MakerCheckerItemFlags {
  id: string;
  auctionId: string;
  chitGroupId: string;
  chitGroupCode: string;
  chitGroupName: string;
  installmentMonth: number;
  ticketNumber: number;
  customerCode: string;
  customerName: string;
  customerPhone: string;
  netPayableAmount: string;
  disbursementMode?: string | null;
  paymentReference?: string | null;
  preparedByUserId: string | null;
}

export interface PendingApprovalsResponse {
  scope?: string;
  summary: {
    totalPendingCount: number;
    actionableByCurrentUserCount: number;
    cashHandoversCount: number;
    disbursementAuthorizationsCount: number;
    paymentReversalsCount: number;
    safetyProofVerificationsCount: number;
    auctionFinalizationsCount: number;
    auctionCorrectionsCount: number;
    defaulterRemovalsCount: number;
    finalMonthSettlementsCount: number;
    cashHandoversTotalAmount: string;
    disbursementsTotalAmount: string;
    reversalsTotalAmount: string;
    finalMonthSettlementsTotalAmount: string;
  };
  cashHandovers: PendingCashHandoverItem[];
  disbursementAuthorizations: PendingDisbursementAuthorizationItem[];
  paymentReversals: PendingPaymentReversalItem[];
  safetyProofVerifications: PendingSafetyProofItem[];
  auctionFinalizations: PendingAuctionFinalizationItem[];
  auctionCorrections: PendingAuctionCorrectionItem[];
  defaulterRemovals: PendingDefaulterRemovalItem[];
  finalMonthSettlements: PendingFinalMonthSettlementItem[];
}

export interface ApprovalCallerContext {
  userId: string;
  roles: Role[];
  isPartner: boolean;
}

function sumBigIntStrings(values: string[]): bigint {
  let total = 0n;
  for (const raw of values) {
    const parsed = parseBigIntField(raw);
    if (parsed !== undefined) {
      total += parsed;
    }
  }
  return total;
}

/**
 * Fetches and aggregates all 8 Maker-Checker dual-control approval queues for a given branch scope
 * using pure 64-bit BigInt arithmetic. The returned payload is branch-scoped and user-agnostic so
 * it can be safely cached in Redis without cross-user contamination.
 */
export async function buildBranchPendingApprovalsSnapshot(
  prisma: PrismaService,
  branchId?: string,
): Promise<PendingApprovalsResponse> {
  // 1. Pending Cash Handovers (CASH + PENDING_HANDOVER + SUCCESS)
  const pendingCashPayments =
    (await prisma.payment.findMany({
      where: {
        paymentMethod: 'CASH',
        cashHandoverStatus: 'PENDING_HANDOVER',
        paymentStatus: 'SUCCESS',
        ...(branchId ? { branchId } : {}),
      },
      include: {
        recordedByUser: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    })) ?? [];

  const cashHandoverMap = new Map<
    string,
    {
      collectorId: string;
      collectorName: string;
      collectorPhone?: string | null;
      branchId: string;
      totalAmount: bigint;
      paymentCount: number;
      oldestCollectionAt: Date;
      paymentIds: string[];
    }
  >();

  let cashHandoversTotalBigInt = 0n;
  for (const p of pendingCashPayments) {
    cashHandoversTotalBigInt += p.amount;
    // Key by collector + branch so cross-branch collections are never merged under one branchId
    const groupKey = `${p.recordedByUserId}:${p.branchId}`;
    const existing = cashHandoverMap.get(groupKey);
    if (existing) {
      existing.totalAmount += p.amount;
      existing.paymentCount += 1;
      existing.paymentIds.push(p.id);
      if (p.createdAt < existing.oldestCollectionAt) {
        existing.oldestCollectionAt = p.createdAt;
      }
    } else {
      cashHandoverMap.set(groupKey, {
        collectorId: p.recordedByUserId,
        collectorName: p.recordedByUser?.name || 'Unknown Agent',
        collectorPhone: p.recordedByUser?.phone || null,
        branchId: p.branchId,
        totalAmount: p.amount,
        paymentCount: 1,
        oldestCollectionAt: p.createdAt,
        paymentIds: [p.id],
      });
    }
  }

  const cashHandovers: PendingCashHandoverItem[] = Array.from(
    cashHandoverMap.values(),
  ).map((h) => ({
    ...h,
    totalAmount: h.totalAmount.toString(),
  }));

  // 2. Pending Disbursement Authorizations & Month N Prepared Settlements (VERIFIED_BY_MAKER)
  const pendingMakerVerified =
    (await prisma.auctionWinner.findMany({
      where: {
        disbursementStatus: 'VERIFIED_BY_MAKER',
        ...(branchId ? { auction: { chitGroup: { branchId } } } : {}),
      },
      include: {
        auction: {
          include: {
            chitGroup: {
              select: {
                id: true,
                groupCode: true,
                groupName: true,
                branchId: true,
                durationMonths: true,
              },
            },
          },
        },
        ticket: {
          include: {
            customer: {
              select: { customerCode: true, fullName: true, phone: true },
            },
          },
        },
      },
      orderBy: { auction: { auctionDate: 'desc' } },
    })) ?? [];

  let disbursementsTotalBigInt = 0n;
  let finalMonthSettlementsTotalBigInt = 0n;
  const disbursementAuthorizations: PendingDisbursementAuthorizationItem[] = [];
  const finalMonthSettlements: PendingFinalMonthSettlementItem[] = [];

  for (const w of pendingMakerVerified) {
    const netAmount = w.disbursedAmount ?? w.auction.prizeMoney ?? 0n;
    const isMonthNPrepared =
      w.auction.status === 'SCHEDULED' &&
      typeof w.auction.chitGroup?.durationMonths === 'number' &&
      w.auction.installmentMonth === w.auction.chitGroup.durationMonths;

    if (isMonthNPrepared) {
      finalMonthSettlementsTotalBigInt += netAmount;
      finalMonthSettlements.push({
        id: w.id,
        auctionId: w.auctionId,
        chitGroupId: w.auction.chitGroup.id || w.auction.chitGroupId,
        chitGroupCode: w.auction.chitGroup.groupCode,
        chitGroupName: w.auction.chitGroup.groupName,
        installmentMonth: w.auction.installmentMonth,
        ticketNumber: w.ticket.ticketNumber,
        customerCode: w.ticket.customer.customerCode,
        customerName: w.ticket.customer.fullName,
        customerPhone: w.ticket.customer.phone,
        netPayableAmount: netAmount.toString(),
        disbursementMode: w.disbursementMode,
        paymentReference: w.paymentReference ?? null,
        preparedByUserId: w.verifiedByUserId ?? w.auction.conductedByUserId ?? null,
      });
    } else if (w.auction.status !== 'SCHEDULED') {
      // CR-DISB-01: Non-Month-N disbursement authorizations apply strictly to finalized auctions
      disbursementsTotalBigInt += netAmount;
      disbursementAuthorizations.push({
        id: w.id,
        auctionId: w.auctionId,
        chitGroupCode: w.auction.chitGroup.groupCode,
        chitGroupName: w.auction.chitGroup.groupName,
        installmentMonth: w.auction.installmentMonth,
        customerCode: w.ticket.customer.customerCode,
        customerName: w.ticket.customer.fullName,
        customerPhone: w.ticket.customer.phone,
        ticketNumber: w.ticket.ticketNumber,
        netPayableAmount: netAmount.toString(),
        disbursementMode: w.disbursementMode,
        verifiedByUserId: w.verifiedByUserId,
        agreementSigned: w.agreementSigned,
        nomineeSigned: w.nomineeSigned,
        hasSecurityDoc: !!w.securityDocS3Key,
      });
    }
  }

  // 3. Pending Payment Reversals (Checker step)
  const pendingReversals =
    (await prisma.paymentReversal.findMany({
      where: {
        status: 'REQUESTED',
        ...(branchId ? { payment: { branchId } } : {}),
      },
      include: {
        payment: {
          include: {
            receipt: { select: { receiptNumber: true } },
            allocations: {
              include: {
                ticket: {
                  include: {
                    customer: {
                      select: { customerCode: true, fullName: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })) ?? [];

  let reversalsTotalBigInt = 0n;
  const paymentReversals: PendingPaymentReversalItem[] = pendingReversals.map((r) => {
    reversalsTotalBigInt += r.payment.amount;
    const primaryCustomer = r.payment.allocations[0]?.ticket?.customer;
    return {
      id: r.id,
      paymentId: r.paymentId,
      receiptNumber: r.payment.receipt?.receiptNumber || 'N/A',
      amount: r.payment.amount.toString(),
      customerCode: primaryCustomer?.customerCode,
      customerName: primaryCustomer?.fullName,
      reason: r.reason,
      notes: r.notes,
      initiatedByUserId: r.initiatedByUserId,
      createdAt: r.createdAt,
    };
  });

  // 4. Pending Safety Proof Verifications (Maker step — strictly finalized auctions only)
  const pendingSafetyProofs =
    (await prisma.auctionWinner.findMany({
      where: {
        disbursementStatus: 'PENDING_VERIFICATION',
        auction: {
          status: { in: ['COMPLETED', 'MINUTES_FILED'] },
          ...(branchId ? { chitGroup: { branchId } } : {}),
        },
      },
      include: {
        auction: {
          include: {
            chitGroup: {
              select: { groupCode: true, groupName: true },
            },
          },
        },
        ticket: {
          include: {
            customer: {
              select: { customerCode: true, fullName: true, phone: true },
            },
          },
        },
      },
      orderBy: { auction: { auctionDate: 'desc' } },
    })) ?? [];

  const safetyProofVerifications: PendingSafetyProofItem[] = pendingSafetyProofs.map((w) => ({
    id: w.id,
    auctionId: w.auctionId,
    chitGroupCode: w.auction.chitGroup.groupCode,
    chitGroupName: w.auction.chitGroup.groupName,
    installmentMonth: w.auction.installmentMonth,
    customerCode: w.ticket.customer.customerCode,
    customerName: w.ticket.customer.fullName,
    customerPhone: w.ticket.customer.phone,
    ticketNumber: w.ticket.ticketNumber,
    netPayableAmount: (w.disbursedAmount ?? w.auction.prizeMoney ?? 0n).toString(),
    auctionDate: w.auction.auctionDate,
  }));

  // 5. Pending Auction Finalizations (Months 2..N-1 recorded by Maker, awaiting Checker Partner)
  const rawPendingAuctions =
    typeof prisma.auction?.findMany === 'function'
      ? (await prisma.auction.findMany({
          where: {
            status: 'SCHEDULED',
            conductedByUserId: { not: null },
            finalizedByUserId: null,
            installmentMonth: { gt: 1 },
            winner: { isNot: null },
            ...(branchId ? { chitGroup: { branchId } } : {}),
          },
          include: {
            chitGroup: {
              select: {
                id: true,
                groupCode: true,
                groupName: true,
                durationMonths: true,
              },
            },
            winner: {
              include: {
                ticket: {
                  include: {
                    customer: { select: { customerCode: true, fullName: true } },
                  },
                },
              },
            },
          },
          orderBy: { auctionDate: 'desc' },
        })) ?? []
      : [];

  const auctionFinalizations: PendingAuctionFinalizationItem[] = rawPendingAuctions
    .filter(
      (a) =>
        !(
          typeof a.chitGroup?.durationMonths === 'number' &&
          a.installmentMonth === a.chitGroup.durationMonths
        ),
    )
    .map((a) => ({
      auctionId: a.id,
      chitGroupId: a.chitGroup?.id || a.chitGroupId,
      chitGroupCode: a.chitGroup?.groupCode || 'N/A',
      chitGroupName: a.chitGroup?.groupName || 'N/A',
      installmentMonth: a.installmentMonth,
      auctionDate: a.auctionDate,
      bidDiscount: (a.bidDiscount ?? 0n).toString(),
      prizeMoney: (a.prizeMoney ?? 0n).toString(),
      dividendPerTicket: (a.dividendPerTicket ?? 0n).toString(),
      winningTicketNumber: a.winner?.ticket?.ticketNumber ?? null,
      winnerCustomerCode: a.winner?.ticket?.customer?.customerCode ?? null,
      winnerCustomerName: a.winner?.ticket?.customer?.fullName ?? null,
      conductedByUserId: a.conductedByUserId || '',
    }));

  // 6. Pending Finalized Auction Corrections (AUCTION_CORRECTION_REQUESTED without subsequent approval)
  const auctionCorrections: PendingAuctionCorrectionItem[] = [];
  if (
    typeof prisma.auditLog?.findMany === 'function' &&
    typeof prisma.auction?.findMany === 'function'
  ) {
    const correctionLogs =
      (await prisma.auditLog.findMany({
        where: {
          entityType: 'Auction',
          action: {
            in: [
              'AUCTION_CORRECTION_REQUESTED',
              'AUCTION_CORRECTION_APPROVED',
              'AUCTION_CORRECTION_REJECTED',
            ],
          },
        },
        orderBy: { timestamp: 'desc' },
        take: 200,
        select: {
          id: true,
          entityId: true,
          action: true,
          userId: true,
          timestamp: true,
          newValue: true,
        },
      })) ?? [];

    const latestRequestByAuction = new Map<string, (typeof correctionLogs)[number]>();
    const latestResolutionByAuction = new Map<string, (typeof correctionLogs)[number]>();

    for (const log of correctionLogs) {
      if (log.action === 'AUCTION_CORRECTION_REQUESTED') {
        if (!latestRequestByAuction.has(log.entityId)) {
          latestRequestByAuction.set(log.entityId, log);
        }
      } else if (!latestResolutionByAuction.has(log.entityId)) {
        latestResolutionByAuction.set(log.entityId, log);
      }
    }

    const pendingCorrectionLogs: Array<(typeof correctionLogs)[number]> = [];
    for (const [auctionId, reqLog] of latestRequestByAuction.entries()) {
      const resLog = latestResolutionByAuction.get(auctionId);
      const alreadyResolved = Boolean(
        resLog &&
          resLog.id !== reqLog.id &&
          ((resLog.newValue as any)?.correctionRequestId === reqLog.id ||
            new Date(resLog.timestamp).getTime() >=
              new Date(reqLog.timestamp).getTime()),
      );
      if (!alreadyResolved && reqLog.newValue) {
        pendingCorrectionLogs.push(reqLog);
      }
    }

    if (pendingCorrectionLogs.length > 0) {
      const auctionIds = pendingCorrectionLogs.map((l) => l.entityId);
      const matchingAuctions =
        (await prisma.auction.findMany({
          where: {
            id: { in: auctionIds },
            status: { in: ['COMPLETED', 'MINUTES_FILED'] },
            chitGroup: {
              status: 'ACTIVE',
              ...(branchId ? { branchId } : {}),
            },
          },
          include: {
            chitGroup: {
              select: { id: true, groupCode: true, groupName: true, status: true },
            },
            winner: {
              select: { disbursementStatus: true },
            },
          },
        })) ?? [];
      const auctionById = new Map(matchingAuctions.map((a) => [a.id, a]));

      for (const reqLog of pendingCorrectionLogs) {
        const auc = auctionById.get(reqLog.entityId);
        if (!auc) continue;
        // KFC-FIN-005 / XR-AUC-03: Exclude immutable disbursed prizes & non-active schemes from pending queue
        if (auc.winner?.disbursementStatus === 'DISBURSED') continue;
        if (auc.chitGroup?.status && auc.chitGroup.status !== 'ACTIVE') continue;
        const reqVal = reqLog.newValue as Record<string, any>;
        const correctedDiscount =
          parseBigIntField(reqVal.correctedBidDiscount) ?? 0n;
        auctionCorrections.push({
          correctionRequestId: reqLog.id,
          auctionId: auc.id,
          chitGroupId: auc.chitGroup?.id || auc.chitGroupId,
          chitGroupCode: auc.chitGroup?.groupCode || 'N/A',
          chitGroupName: auc.chitGroup?.groupName || 'N/A',
          installmentMonth: auc.installmentMonth,
          currentBidDiscount: (auc.bidDiscount ?? 0n).toString(),
          correctedBidDiscount: correctedDiscount.toString(),
          correctedTicketNumber:
            typeof reqVal.correctedTicketNumber === 'number'
              ? reqVal.correctedTicketNumber
              : null,
          reason: typeof reqVal.reason === 'string' ? reqVal.reason : '',
          requestedByUserId: reqLog.userId ?? reqVal.requestedByUserId ?? '',
          requestedAt: reqLog.timestamp,
        });
      }
    }
  }

  // 7. Pending Defaulter Removals (SEC-B: status = PENDING_REMOVAL_APPROVAL)
  const rawPendingRemovals =
    typeof prisma.subscriberTicket?.findMany === 'function'
      ? (await prisma.subscriberTicket.findMany({
          where: {
            status: 'PENDING_REMOVAL_APPROVAL',
            ...(branchId ? { chitGroup: { branchId } } : {}),
          },
          include: {
            chitGroup: {
              select: { id: true, groupCode: true, groupName: true },
            },
            customer: {
              select: { customerCode: true, fullName: true, phone: true },
            },
            dues: {
              where: { status: { not: 'PAID' } },
              select: { netPayableAmount: true, paidAmount: true },
            },
          },
          orderBy: { removalRequestedAt: 'desc' },
        })) ?? []
      : [];

  const defaulterRemovals: PendingDefaulterRemovalItem[] = rawPendingRemovals.map(
    (t) => {
      let arrearsTotal = 0n;
      for (const d of t.dues ?? []) {
        const diff = d.netPayableAmount - d.paidAmount;
        if (diff > 0n) {
          arrearsTotal += diff;
        }
      }
      return {
        ticketId: t.id,
        chitGroupId: t.chitGroup?.id || t.chitGroupId,
        chitGroupCode: t.chitGroup?.groupCode || 'N/A',
        chitGroupName: t.chitGroup?.groupName || 'N/A',
        ticketNumber: t.ticketNumber,
        customerCode: t.customer.customerCode,
        customerName: t.customer.fullName,
        customerPhone: t.customer.phone,
        consecutiveUnpaidMonths: t.consecutiveUnpaidMonths,
        totalArrearsAmount: arrearsTotal.toString(),
        removalReason: t.removalReason ?? null,
        removalRequestedByUserId: t.removalRequestedByUserId ?? null,
        removalRequestedAt: t.removalRequestedAt ?? null,
      };
    },
  );

  const totalPendingCount =
    cashHandovers.length +
    disbursementAuthorizations.length +
    paymentReversals.length +
    safetyProofVerifications.length +
    auctionFinalizations.length +
    auctionCorrections.length +
    defaulterRemovals.length +
    finalMonthSettlements.length;

  return {
    scope: branchId ? `BRANCH_${branchId}` : 'ALL_BRANCHES',
    summary: {
      totalPendingCount,
      actionableByCurrentUserCount: 0,
      cashHandoversCount: cashHandovers.length,
      disbursementAuthorizationsCount: disbursementAuthorizations.length,
      paymentReversalsCount: paymentReversals.length,
      safetyProofVerificationsCount: safetyProofVerifications.length,
      auctionFinalizationsCount: auctionFinalizations.length,
      auctionCorrectionsCount: auctionCorrections.length,
      defaulterRemovalsCount: defaulterRemovals.length,
      finalMonthSettlementsCount: finalMonthSettlements.length,
      cashHandoversTotalAmount: cashHandoversTotalBigInt.toString(),
      disbursementsTotalAmount: disbursementsTotalBigInt.toString(),
      reversalsTotalAmount: reversalsTotalBigInt.toString(),
      finalMonthSettlementsTotalAmount: finalMonthSettlementsTotalBigInt.toString(),
    },
    cashHandovers,
    disbursementAuthorizations,
    paymentReversals,
    safetyProofVerifications,
    auctionFinalizations,
    auctionCorrections,
    defaulterRemovals,
    finalMonthSettlements,
  };
}

/**
 * Post-cache per-caller Maker-Checker (Guardrail 10) and Partner Identity (Guardrail 11)
 * annotation and optional `?actionableOnly=true` filtering.
 * Never mutates the cached base snapshot, guaranteeing zero cross-user cache contamination.
 */
export function annotatePendingApprovalsForUser(
  base: PendingApprovalsResponse,
  caller: ApprovalCallerContext,
  actionableOnly: boolean = false,
): PendingApprovalsResponse {
  const isVerifiedPartner = caller.roles.includes(Role.PARTNER);
  const canVerifyOperationalQueues =
    isVerifiedPartner ||
    caller.roles.includes(Role.BRANCH_MANAGER) ||
    caller.roles.includes(Role.ACCOUNTANT);

  const annotatePartnerChecker = <T>(
    items: T[],
    getMakerId: (item: T) => string | null | undefined,
  ): Array<T & MakerCheckerItemFlags> => {
    const annotated = items.map((item) => {
      const makerId = getMakerId(item);
      const isOwnRequest = Boolean(makerId && makerId === caller.userId);
      const canCurrentUserApprove = isVerifiedPartner && !isOwnRequest;
      return { ...item, isOwnRequest, canCurrentUserApprove };
    });
    return actionableOnly
      ? annotated.filter((i) => i.canCurrentUserApprove)
      : annotated;
  };

  const cashHandovers = base.cashHandovers
    .map((h) => {
      const isOwnRequest = h.collectorId === caller.userId;
      const canCurrentUserApprove = canVerifyOperationalQueues && !isOwnRequest;
      return { ...h, isOwnRequest, canCurrentUserApprove };
    })
    .filter((h) => !actionableOnly || h.canCurrentUserApprove);

  const safetyProofVerifications = base.safetyProofVerifications
    .map((sp) => ({
      ...sp,
      isOwnRequest: false,
      canCurrentUserApprove: canVerifyOperationalQueues,
    }))
    .filter((sp) => !actionableOnly || sp.canCurrentUserApprove);

  const disbursementAuthorizations = annotatePartnerChecker(
    base.disbursementAuthorizations,
    (w) => w.verifiedByUserId,
  );
  const paymentReversals = annotatePartnerChecker(
    base.paymentReversals,
    (r) => r.initiatedByUserId,
  );
  const auctionFinalizations = annotatePartnerChecker(
    base.auctionFinalizations ?? [],
    (a) => a.conductedByUserId,
  );
  const auctionCorrections = annotatePartnerChecker(
    base.auctionCorrections ?? [],
    (c) => c.requestedByUserId,
  );
  const defaulterRemovals = annotatePartnerChecker(
    base.defaulterRemovals ?? [],
    (d) => d.removalRequestedByUserId,
  );
  const finalMonthSettlements = annotatePartnerChecker(
    base.finalMonthSettlements ?? [],
    (s) => s.preparedByUserId,
  );

  const countActionable = (arr: MakerCheckerItemFlags[]) =>
    arr.filter((i) => i.canCurrentUserApprove).length;

  const actionableByCurrentUserCount =
    countActionable(cashHandovers) +
    countActionable(disbursementAuthorizations) +
    countActionable(paymentReversals) +
    countActionable(safetyProofVerifications) +
    countActionable(auctionFinalizations) +
    countActionable(auctionCorrections) +
    countActionable(defaulterRemovals) +
    countActionable(finalMonthSettlements);

  const totalPendingCount =
    cashHandovers.length +
    disbursementAuthorizations.length +
    paymentReversals.length +
    safetyProofVerifications.length +
    auctionFinalizations.length +
    auctionCorrections.length +
    defaulterRemovals.length +
    finalMonthSettlements.length;

  return {
    scope: base.scope,
    summary: {
      totalPendingCount,
      actionableByCurrentUserCount,
      cashHandoversCount: cashHandovers.length,
      disbursementAuthorizationsCount: disbursementAuthorizations.length,
      paymentReversalsCount: paymentReversals.length,
      safetyProofVerificationsCount: safetyProofVerifications.length,
      auctionFinalizationsCount: auctionFinalizations.length,
      auctionCorrectionsCount: auctionCorrections.length,
      defaulterRemovalsCount: defaulterRemovals.length,
      finalMonthSettlementsCount: finalMonthSettlements.length,
      cashHandoversTotalAmount: sumBigIntStrings(
        cashHandovers.map((h) => h.totalAmount),
      ).toString(),
      disbursementsTotalAmount: sumBigIntStrings(
        disbursementAuthorizations.map((d) => d.netPayableAmount),
      ).toString(),
      reversalsTotalAmount: sumBigIntStrings(
        paymentReversals.map((r) => r.amount),
      ).toString(),
      finalMonthSettlementsTotalAmount: sumBigIntStrings(
        finalMonthSettlements.map((s) => s.netPayableAmount),
      ).toString(),
    },
    cashHandovers,
    disbursementAuthorizations,
    paymentReversals,
    safetyProofVerifications,
    auctionFinalizations,
    auctionCorrections,
    defaulterRemovals,
    finalMonthSettlements,
  };
}

export async function resolveApprovalCallerContext(
  prisma: PrismaService,
  requestingUser: JwtPayload,
): Promise<ApprovalCallerContext> {
  let roles = Array.isArray(requestingUser?.roles) ? requestingUser.roles : [];

  if (
    (roles.includes(Role.SUPER_ADMIN) || roles.includes(Role.PARTNER)) &&
    requestingUser.sub &&
    typeof prisma.user?.findUnique === 'function'
  ) {
    const dbUser = await prisma.user.findUnique({
      where: { id: requestingUser.sub },
      select: { roles: true, isActive: true },
    });
    if (dbUser) {
      if (dbUser.isActive === false) {
        roles = [];
      } else if (Array.isArray(dbUser.roles)) {
        roles = dbUser.roles;
      }
    }
  }

  return {
    userId: requestingUser.sub,
    roles,
    isPartner: roles.includes(Role.PARTNER),
  };
}
