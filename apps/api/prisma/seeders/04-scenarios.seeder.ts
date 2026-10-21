import {
  AuctionStatus,
  DisbursementMode,
  DueStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';

export async function seedScenarios(
  prisma: PrismaClient,
  branchId: string,
  users: Record<string, any>,
  groups: Record<string, any>,
) {
  console.log('  🎯 Seeding all 10 operational edge cases & N scenarios...');

  const partnerKumaran = users['9876543210'];
  const partnerSenthil = users['9876543211']; // Checker
  const branchManagerRajendran = users['9876543212']; // Maker
  const accountantPriya = users['9876543213']; // Maker
  const agentMurugan = users['9876543214']; // Collector

  // ===========================================================================
  // SCENARIO 2: Fresh Chit Scheme (KCA-1L-20M-01) — Month 1 Company Pool
  // ===========================================================================
  const group1L = groups['KCA-1L-20M-01'];
  const tickets1L = await prisma.subscriberTicket.findMany({
    where: { chitGroupId: group1L.id },
    orderBy: { ticketNumber: 'asc' },
  });

  // Month 1: Full pool taken by company customer ticket (Ticket #1), no auction, ₹0 dividend
  await prisma.subscriberTicket.update({
    where: { id: tickets1L[0].id },
    data: { isPrized: true },
  });

  // Seed Month 1 Dues for all 20 tickets (gross 5000, dividend 0, net 5000)
  for (const t of tickets1L) {
    const isPaid = t.ticketNumber <= 12; // 12 tickets paid, 8 unpaid
    const due = await prisma.installmentDue.upsert({
      where: {
        ticketId_installmentMonth: {
          ticketId: t.id,
          installmentMonth: 1,
        },
      },
      update: {
        paidAmount: isPaid ? 5000n : 0n,
        status: isPaid ? DueStatus.PAID : DueStatus.UNPAID,
      },
      create: {
        chitGroupId: group1L.id,
        ticketId: t.id,
        installmentMonth: 1,
        dueDate: new Date('2026-10-15'),
        grossAmount: 5000n,
        dividendDeduction: 0n,
        netPayableAmount: 5000n,
        paidAmount: isPaid ? 5000n : 0n,
        status: isPaid ? DueStatus.PAID : DueStatus.UNPAID,
      },
    });

    if (isPaid) {
      const receiptNumber = `KC-REC-PRD-2026-1L-M1-${String(t.ticketNumber).padStart(3, '0')}`;
      const existingReceipt = await prisma.receipt.findUnique({
        where: { receiptNumber },
      });

      if (!existingReceipt) {
        await prisma.payment.create({
          data: {
            branchId,
            recordedByUserId: accountantPriya.id,
            customerId: t.customerId,
            amount: 5000n,
            paymentMethod: PaymentMethod.CASH,
            paymentStatus: PaymentStatus.SUCCESS,
            cashHandoverStatus: 'ACKNOWLEDGED',
            cashHandoverAcknowledgedByUserId: partnerKumaran.id,
            cashHandoverAcknowledgedAt: new Date('2026-10-15T18:00:00Z'),
            allocations: {
              create: {
                ticketId: t.id,
                installmentDueId: due.id,
                amountAllocated: 5000n,
              },
            },
            receipt: {
              create: {
                branchId,
                receiptNumber,
                isBilingual: true,
              },
            },
          },
        });
      }
    }
  }

  // ===========================================================================
  // SCENARIO 3: Active Mid-Flight Group (KCB-2L-20M-01) — Months 1-4
  // ===========================================================================
  const group2L = groups['KCB-2L-20M-01'];
  const tickets2L = await prisma.subscriberTicket.findMany({
    where: { chitGroupId: group2L.id },
    orderBy: { ticketNumber: 'asc' },
  });

  // Month 1: Company Ticket #1
  await prisma.subscriberTicket.update({
    where: { id: tickets2L[0].id },
    data: { isPrized: true },
  });

  // Month 2 Auction: Won by Ticket #3 at ₹30,000 discount (Commission 8000, Div 22000 => 1100/ticket, Prize 1,70,000)
  const auctionM2 = await prisma.auction.upsert({
    where: {
      chitGroupId_installmentMonth: {
        chitGroupId: group2L.id,
        installmentMonth: 2,
      },
    },
    update: {},
    create: {
      chitGroupId: group2L.id,
      installmentMonth: 2,
      auctionDate: new Date('2026-08-15'),
      status: AuctionStatus.MINUTES_FILED,
      bidDiscount: 30000n,
      foremanCommissionRate: new Prisma.Decimal('4.00'),
      foremanCommissionAmount: 8000n,
      totalDividend: 22000n,
      dividendPerTicket: 1100n,
      prizeMoney: 170000n,
      conductedByUserId: branchManagerRajendran.id,
      finalizedByUserId: partnerSenthil.id,
      winner: {
        create: {
          ticketId: tickets2L[2].id, // Ticket #3
          wasTieBreakWinner: false,
          disbursementStatus: 'DISBURSED',
          disbursementMode: DisbursementMode.BANK_TRANSFER_NEFT,
          disbursedAmount: 170000n,
          paymentReference: 'NEFT-KVB-20260818-0994',
          disbursedAt: new Date('2026-08-18'),
          authorizedByUserId: partnerSenthil.id,
          verifiedByUserId: branchManagerRajendran.id,
        },
      },
      minutes: {
        create: {
          subscribersPresent: 18,
          minutesText: 'Month 2 auction conducted smoothly in Head Office. Ticket #3 emerged as winning bidder.',
          signedByForeman: true,
          filedAtRegistrar: true,
          filedDate: new Date('2026-08-20'),
          filingReference: 'ROC/ERD/M2/104',
        },
      },
    },
  });
  await prisma.subscriberTicket.update({
    where: { id: tickets2L[2].id },
    data: { isPrized: true, prizedAuctionId: auctionM2.id },
  });

  // Month 3 Auction: Won by Ticket #6 at ₹40,000 discount (Comm 8000, Div 32000 => 1600/ticket, Prize 1,60,000)
  // WITH COMPANY SAFETY PROOF CHECKLIST (ADR-15)
  const auctionM3 = await prisma.auction.upsert({
    where: {
      chitGroupId_installmentMonth: {
        chitGroupId: group2L.id,
        installmentMonth: 3,
      },
    },
    update: {},
    create: {
      chitGroupId: group2L.id,
      installmentMonth: 3,
      auctionDate: new Date('2026-09-15'),
      status: AuctionStatus.MINUTES_FILED,
      bidDiscount: 40000n,
      foremanCommissionRate: new Prisma.Decimal('4.00'),
      foremanCommissionAmount: 8000n,
      totalDividend: 32000n,
      dividendPerTicket: 1600n,
      prizeMoney: 160000n,
      conductedByUserId: branchManagerRajendran.id,
      finalizedByUserId: partnerSenthil.id,
      winner: {
        create: {
          ticketId: tickets2L[5].id, // Ticket #6
          wasTieBreakWinner: false,
          isSecurityRequired: true,
          securityType: 'BLANK_CHEQUE',
          blankChequeDetails: 'Karur Vysya Bank Perundurai, Cheque No: 440219, Account: M. Palanisamy',
          agreementSigned: true,
          nomineeSigned: true,
          securityDocS3Key: 'security/2L-M3-t6/agreement-signed.pdf',
          disbursementStatus: 'DISBURSED',
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          disbursedAmount: 160000n,
          paymentReference: 'CHQ-KVB-440219',
          disbursedAt: new Date('2026-09-18'),
          authorizedByUserId: partnerSenthil.id,
          verifiedByUserId: branchManagerRajendran.id,
        },
      },
      minutes: {
        create: {
          subscribersPresent: 19,
          minutesText: 'Month 3 auction finalized. Cheque security and promissory notes verified.',
          signedByForeman: true,
          filedAtRegistrar: true,
          filedDate: new Date('2026-09-22'),
          filingReference: 'ROC/ERD/M3/188',
        },
      },
    },
  });
  await prisma.subscriberTicket.update({
    where: { id: tickets2L[5].id },
    data: { isPrized: true, prizedAuctionId: auctionM3.id },
  });

  // Month 4 Auction: Completed, won by Ticket #8 at ₹36,000 discount (Prize 1,64,000, Div 1400/ticket)
  const auctionM4 = await prisma.auction.upsert({
    where: {
      chitGroupId_installmentMonth: {
        chitGroupId: group2L.id,
        installmentMonth: 4,
      },
    },
    update: {},
    create: {
      chitGroupId: group2L.id,
      installmentMonth: 4,
      auctionDate: new Date('2026-10-15'),
      status: AuctionStatus.COMPLETED,
      bidDiscount: 36000n,
      foremanCommissionRate: new Prisma.Decimal('4.00'),
      foremanCommissionAmount: 8000n,
      totalDividend: 28000n,
      dividendPerTicket: 1400n,
      prizeMoney: 164000n,
      conductedByUserId: branchManagerRajendran.id,
      finalizedByUserId: partnerSenthil.id,
      winner: {
        create: {
          ticketId: tickets2L[7].id, // Ticket #8
          wasTieBreakWinner: false,
          disbursementStatus: 'PENDING_VERIFICATION',
        },
      },
    },
  });

  // Seed Month 4 Dues for Group 2L (gross 10000, dividend 1400, net 8600)
  for (const t of tickets2L) {
    await prisma.installmentDue.upsert({
      where: {
        ticketId_installmentMonth: {
          ticketId: t.id,
          installmentMonth: 4,
        },
      },
      update: {
        paidAmount: 0n,
        status: DueStatus.UNPAID,
      },
      create: {
        chitGroupId: group2L.id,
        ticketId: t.id,
        installmentMonth: 4,
        dueDate: new Date('2026-10-25'),
        grossAmount: 10000n,
        dividendDeduction: 1400n,
        netPayableAmount: 8600n,
        paidAmount: 0n,
        status: DueStatus.UNPAID,
      },
    });
  }

  // ===========================================================================
  // SCENARIO 4: 25% Ceiling Tie-Break Protocol (KCA-1L-20M-02) — ADR-06 Option A
  // ===========================================================================
  const groupTie = groups['KCA-1L-20M-02'];
  const ticketsTie = await prisma.subscriberTicket.findMany({
    where: { chitGroupId: groupTie.id },
    orderBy: { ticketNumber: 'asc' },
  });

  // Month 2 Auction: 3 bidders bid ceiling of ₹25,000 (Ticket #2, #5, #7)
  const auctionTie = await prisma.auction.upsert({
    where: {
      chitGroupId_installmentMonth: {
        chitGroupId: groupTie.id,
        installmentMonth: 2,
      },
    },
    update: {},
    create: {
      chitGroupId: groupTie.id,
      installmentMonth: 2,
      auctionDate: new Date('2026-10-10'),
      status: AuctionStatus.COMPLETED,
      bidDiscount: 25000n, // Max ceiling = 100000 / 4
      foremanCommissionRate: new Prisma.Decimal('4.00'),
      foremanCommissionAmount: 4000n,
      totalDividend: 21000n,
      dividendPerTicket: 1050n,
      prizeMoney: 75000n,
      conductedByUserId: branchManagerRajendran.id,
      finalizedByUserId: partnerSenthil.id,
      winner: {
        create: {
          ticketId: ticketsTie[6].id, // Ticket #7
          wasTieBreakWinner: true,
          disbursementStatus: 'APPROVED',
          disbursedAmount: 75000n,
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          paymentReference: 'CHQ-KVB-789012',
        },
      },
      tieBidders: {
        create: [
          {
            ticketId: ticketsTie[1].id, // Ticket #2
            bidDiscount: 25000n,
            tokenNumber: 1,
            isWinner: false,
          },
          {
            ticketId: ticketsTie[4].id, // Ticket #5
            bidDiscount: 25000n,
            tokenNumber: 2,
            isWinner: false,
          },
          {
            ticketId: ticketsTie[6].id, // Ticket #7
            bidDiscount: 25000n,
            tokenNumber: 3,
            isWinner: true,
          },
        ],
      },
      minutes: {
        create: {
          subscribersPresent: 20,
          minutesText: 'Three subscribers tied at 25% ceiling of ₹25,000. Physical paper tokens drawn in front of members. Ticket #7 was selected.',
          signedByForeman: true,
        },
      },
    },
  });
  await prisma.subscriberTicket.update({
    where: { id: ticketsTie[6].id },
    data: { isPrized: true, prizedAuctionId: auctionTie.id },
  });

  // ===========================================================================
  // SCENARIO 5: Defaulters & Arrears Ineligibility (ADR-07) in Group 2L
  // ===========================================================================
  // Ticket #5: 1 month overdue (ineligible to bid)
  await prisma.subscriberTicket.update({
    where: { id: tickets2L[4].id },
    data: { consecutiveUnpaidMonths: 1 },
  });
  // Ticket #9: 3 consecutive months unpaid (Removal rights triggered)
  await prisma.subscriberTicket.update({
    where: { id: tickets2L[8].id },
    data: {
      consecutiveUnpaidMonths: 3,
      status: 'DEFAULT_3_MONTHS',
    },
  });

  // ===========================================================================
  // SCENARIO 6: Mid-Cycle Notebook Onboarding (KCC-5L-25M-LEGACY) — ADR-14
  // ===========================================================================
  const groupLegacy = groups['KCC-5L-25M-LEGACY'];
  const ticketsLegacy = await prisma.subscriberTicket.findMany({
    where: { chitGroupId: groupLegacy.id },
    orderBy: { ticketNumber: 'asc' },
  });

  // Months 1 to 6 imported from handwritten ledger as historical entries
  for (let m = 1; m <= 6; m++) {
    const historicalWinnerTicket = ticketsLegacy[m - 1];
    await prisma.auction.upsert({
      where: {
        chitGroupId_installmentMonth: {
          chitGroupId: groupLegacy.id,
          installmentMonth: m,
        },
      },
      update: {},
      create: {
        chitGroupId: groupLegacy.id,
        installmentMonth: m,
        auctionDate: new Date(2026, 3 + m - 1, 15),
        status: AuctionStatus.COMPLETED,
        isHistoricalEntry: true,
        bidDiscount: 100000n,
        foremanCommissionRate: new Prisma.Decimal('4.00'),
        foremanCommissionAmount: 20000n,
        totalDividend: 80000n,
        dividendPerTicket: 3200n,
        prizeMoney: 400000n,
        winner: {
          create: {
            ticketId: historicalWinnerTicket.id,
            wasTieBreakWinner: false,
            disbursementStatus: 'DISBURSED',
            disbursedAmount: 400000n,
          },
        },
      },
    });

    await prisma.subscriberTicket.update({
      where: { id: historicalWinnerTicket.id },
      data: { isPrized: true },
    });
  }

  // ===========================================================================
  // SCENARIO 7 & 8: Doorstep Field Collections, Branch Handover & Maker-Checker Reversals
  // ===========================================================================
  // Agent Murugan collected cash from Customer #4 for Group 1L Month 1
  const existingFieldReceipt = await prisma.receipt.findUnique({
    where: { receiptNumber: 'KC-REC-PRD-2026-FLD-00091' },
  });
  if (!existingFieldReceipt) {
    await prisma.payment.create({
      data: {
        branchId,
        recordedByUserId: agentMurugan.id,
        customerId: tickets1L[3].customerId,
        amount: 5000n,
        paymentMethod: PaymentMethod.CASH,
        paymentStatus: PaymentStatus.SUCCESS,
        cashHandoverStatus: 'PENDING_HANDOVER', // Pending evening branch handover
        receipt: {
          create: {
            branchId,
            receiptNumber: 'KC-REC-PRD-2026-FLD-00091',
            isBilingual: true,
          },
        },
      },
    });
  }

  // Accidental entry by Murugan: Approved Reversal (Maker: Murugan, Checker: Partner Senthil)
  const existingRevReceipt = await prisma.receipt.findUnique({
    where: { receiptNumber: 'KC-REC-PRD-2026-REV-00012' },
  });
  let paymentReversed = existingRevReceipt
    ? await prisma.payment.findUnique({ where: { id: existingRevReceipt.paymentId } })
    : null;
  if (!paymentReversed) {
    paymentReversed = await prisma.payment.create({
      data: {
        branchId,
        recordedByUserId: agentMurugan.id,
        customerId: tickets1L[4].customerId,
        amount: 5000n,
        paymentMethod: PaymentMethod.CASH,
        paymentStatus: PaymentStatus.REVERSED,
        cashHandoverStatus: 'ACKNOWLEDGED',
        receipt: {
          create: {
            branchId,
            receiptNumber: 'KC-REC-PRD-2026-REV-00012',
            isBilingual: true,
          },
        },
        reversal: {
          create: {
            reason: 'Erroneous subscriber phone entered during field collection',
            status: 'APPROVED',
            initiatedByUserId: agentMurugan.id,
            approvedByUserId: partnerSenthil.id, // Maker != Checker
            reversedAt: new Date(),
          },
        },
      },
    });
  }

  // Second Payment Reversal in REQUESTED status (Pending for Admin UI test review)
  const existingPenReceipt = await prisma.receipt.findUnique({
    where: { receiptNumber: 'KC-REC-PRD-2026-PEN-00033' },
  });
  if (!existingPenReceipt) {
    await prisma.payment.create({
      data: {
        branchId,
        recordedByUserId: accountantPriya.id,
        customerId: tickets1L[5].customerId,
        amount: 5000n,
        paymentMethod: PaymentMethod.UPI,
        transactionRef: 'UPI/2026/1029192931',
        paymentStatus: PaymentStatus.SUCCESS,
        receipt: {
          create: {
            branchId,
            receiptNumber: 'KC-REC-PRD-2026-PEN-00033',
            isBilingual: true,
          },
        },
        reversal: {
          create: {
            reason: 'Duplicate UPI credit received from bank gateway reconciliation',
            status: 'REQUESTED',
            initiatedByUserId: accountantPriya.id, // Maker
            notes: 'Awaiting Managing Partner authorization',
          },
        },
      },
    });
  }

  // ===========================================================================
  // SCENARIO 9: Mature Group Final Settlement (KCA-1L-20M-MATURE) — Month N Rule
  // ===========================================================================
  const groupMature = groups['KCA-1L-20M-MATURE'];
  const ticketsMature = await prisma.subscriberTicket.findMany({
    where: { chitGroupId: groupMature.id },
    orderBy: { ticketNumber: 'asc' },
  });

  // Month 20 settled directly to final non-prized subscriber without auction
  const finalSubscriber = ticketsMature[19]; // Ticket #20
  await prisma.subscriberTicket.update({
    where: { id: finalSubscriber.id },
    data: { isPrized: true },
  });

  // ===========================================================================
  // SCENARIO 10: Immutable Audit Log Trail
  // ===========================================================================
  const auditLogs = [
    {
      userId: partnerSenthil.id,
      action: 'PAYMENT_REVERSAL_APPROVED',
      entityType: 'PaymentReversal',
      entityId: paymentReversed.id,
      oldValue: { status: 'REQUESTED' },
      newValue: { status: 'APPROVED', approvedBy: partnerSenthil.id },
    },
    {
      userId: branchManagerRajendran.id,
      action: 'TIE_BREAK_DRAWN',
      entityType: 'AuctionTieBidder',
      entityId: auctionTie.id,
      oldValue: { tiedCount: 3, ceilingDiscount: 25000 },
      newValue: { drawnWinnerTicket: 7 },
    },
    {
      userId: partnerKumaran.id,
      action: 'AUCTION_FINALIZED',
      entityType: 'Auction',
      entityId: auctionM3.id,
      oldValue: { status: 'SCHEDULED' },
      newValue: { status: 'MINUTES_FILED', prizeMoney: 160000 },
    },
  ];

  for (const log of auditLogs) {
    await prisma.auditLog.create({
      data: {
        userId: log.userId,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        oldValue: log.oldValue,
        newValue: log.newValue,
      },
    });
  }

  console.log('    ✅ All 10 N-Scenarios seeded across all 17 database models.');
}
