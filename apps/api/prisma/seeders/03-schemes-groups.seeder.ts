import { ChitStatus, InitializationMode, Prisma, PrismaClient } from '@prisma/client';

export async function seedChitGroupsAndTickets(
  prisma: PrismaClient,
  branchId: string,
  customers: any[],
) {
  console.log('  📜 Seeding chit groups & subscriber ticket assignments...');

  const groupsDef = [
    {
      code: 'KCA-1L-20M-01',
      name: '₹1 Lakh 20 Months Scheme A',
      nameTamil: 'ரூ.1 லட்சம் 20 மாத திட்டம் அ',
      chitValue: 100000n,
      durationMonths: 20,
      totalTickets: 20,
      baseInstallment: 5000n,
      maxDiscountCeiling: 25000n,
      initMode: InitializationMode.NEW_GROUP,
      onboardedAtMonth: 1,
      status: ChitStatus.ACTIVE,
      sanctionOrderNumber: 'ROC/ERD/CHIT/2026/00142',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2028-05-01'),
    },
    {
      code: 'KCB-2L-20M-01',
      name: '₹2 Lakh 20 Months Scheme B',
      nameTamil: 'ரூ.2 லட்சம் 20 மாத திட்டம் ஆ',
      chitValue: 200000n,
      durationMonths: 20,
      totalTickets: 20,
      baseInstallment: 10000n,
      maxDiscountCeiling: 50000n,
      initMode: InitializationMode.NEW_GROUP,
      onboardedAtMonth: 1,
      status: ChitStatus.ACTIVE,
      sanctionOrderNumber: 'ROC/ERD/CHIT/2026/00178',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2028-02-01'),
    },
    {
      code: 'KCA-1L-20M-02',
      name: '₹1 Lakh 20 Months Scheme A (Tie-Break Demo)',
      nameTamil: 'ரூ.1 லட்சம் 20 மாத திட்டம் அ (குலுக்கல்)',
      chitValue: 100000n,
      durationMonths: 20,
      totalTickets: 20,
      baseInstallment: 5000n,
      maxDiscountCeiling: 25000n,
      initMode: InitializationMode.NEW_GROUP,
      onboardedAtMonth: 1,
      status: ChitStatus.ACTIVE,
      sanctionOrderNumber: 'ROC/ERD/CHIT/2026/00205',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2028-04-01'),
    },
    {
      code: 'KCC-5L-25M-LEGACY',
      name: '₹5 Lakh 25 Months Ongoing (Notebook Migration)',
      nameTamil: 'ரூ.5 லட்சம் 25 மாத குறிப்பேடு பரிமாற்றம்',
      chitValue: 500000n,
      durationMonths: 25,
      totalTickets: 25,
      baseInstallment: 20000n,
      maxDiscountCeiling: 125000n,
      initMode: InitializationMode.ONGOING_GROUP,
      onboardedAtMonth: 7,
      status: ChitStatus.ACTIVE,
      sanctionOrderNumber: 'ROC/ERD/CHIT/2026/00089',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2028-04-01'),
    },
    {
      code: 'KCA-1L-20M-MATURE',
      name: '₹1 Lakh 20 Months Completed Group',
      nameTamil: 'ரூ.1 லட்சம் 20 மாத நிறைவு பெற்ற திட்டம்',
      chitValue: 100000n,
      durationMonths: 20,
      totalTickets: 20,
      baseInstallment: 5000n,
      maxDiscountCeiling: 25000n,
      initMode: InitializationMode.NEW_GROUP,
      onboardedAtMonth: 1,
      status: ChitStatus.COMPLETED,
      sanctionOrderNumber: 'ROC/ERD/CHIT/2025/00034',
      startDate: new Date('2025-02-01'),
      endDate: new Date('2026-09-01'),
    },
  ];

  const seededGroups: Record<string, any> = {};

  for (const g of groupsDef) {
    const group = await prisma.chitGroup.upsert({
      where: { groupCode: g.code },
      update: {
        status: g.status,
      },
      create: {
        branchId,
        groupCode: g.code,
        groupName: g.name,
        groupNameTamil: g.nameTamil,
        chitValue: g.chitValue,
        durationMonths: g.durationMonths,
        totalTickets: g.totalTickets,
        baseInstallment: g.baseInstallment,
        foremanCommissionRate: new Prisma.Decimal('4.00'),
        maxDiscountCeiling: g.maxDiscountCeiling,
        initMode: g.initMode,
        onboardedAtMonth: g.onboardedAtMonth,
        status: g.status,
        sanctionOrderNumber: g.sanctionOrderNumber,
        sanctionDate: new Date('2026-01-15'),
        startDate: g.startDate,
        endDate: g.endDate,
      },
    });

    // Populate subscriber tickets for each group (Ticket 1 to totalTickets)
    // Satisfies ADR-13: strictly 1 ticket per customer in this group
    for (let ticketNo = 1; ticketNo <= g.totalTickets; ticketNo++) {
      const assignedCustomer = customers[(ticketNo - 1) % customers.length];

      await prisma.subscriberTicket.upsert({
        where: {
          chitGroupId_ticketNumber: {
            chitGroupId: group.id,
            ticketNumber: ticketNo,
          },
        },
        update: {},
        create: {
          chitGroupId: group.id,
          customerId: assignedCustomer.id,
          ticketNumber: ticketNo,
          isPrized: false,
          consecutiveUnpaidMonths: 0,
          status: 'ACTIVE',
        },
      });
    }

    seededGroups[g.code] = group;
  }

  console.log(`    ✅ 5 Chit Groups and all subscriber tickets seeded successfully.`);
  return seededGroups;
}
