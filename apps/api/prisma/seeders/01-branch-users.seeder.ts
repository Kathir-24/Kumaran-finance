import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedBranchAndUsers(prisma: PrismaClient) {
  console.log('  🏢 Seeding Head Office branch & staff hierarchy...');

  // 1. Single Branch: Head Office - Perundurai (ADR-01)
  const branch = await prisma.branch.upsert({
    where: { code: 'PRD' },
    update: {},
    create: {
      code: 'PRD',
      name: 'Head Office - Perundurai',
      nameTamil: 'தலைமை கிளை - பெருந்துறை',
      address: '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052',
      phone: '+91 98765 43210',
      isActive: true,
    },
  });

  const saltRounds = 10;
  const defaultPasswordHash = await bcrypt.hash('Admin@Kumaran2026', saltRounds);
  const defaultMpinHash = await bcrypt.hash('123456', saltRounds);

  // 2. Staff Hierarchy & Role Separation (All 6 RBAC Personas)
  const staffMembers = [
    // 4 Equal Partners (Super Admins & Checkers)
    {
      phone: '9876543210',
      name: 'P. Kumaran (Managing Partner)',
      roles: [Role.SUPER_ADMIN],
    },
    {
      phone: '9876543211',
      name: 'K. Senthil (Operations Partner / Checker)',
      roles: [Role.SUPER_ADMIN],
    },
    {
      phone: '9876543217',
      name: 'A. Velusamy (Finance Partner)',
      roles: [Role.SUPER_ADMIN],
    },
    {
      phone: '9876543218',
      name: 'R. Selvaraj (Compliance Partner)',
      roles: [Role.SUPER_ADMIN],
    },
    // Branch Manager (Maker for auction entries & onboarding)
    {
      phone: '9876543212',
      name: 'M. Rajendran (Branch Manager)',
      roles: [Role.BRANCH_MANAGER],
    },
    // Desk Accountant (Maker for receipts, vouchers, day closure)
    {
      phone: '9876543213',
      name: 'S. Priya (Desk Accountant)',
      roles: [Role.ACCOUNTANT],
    },
    // Field Collection Agents (Doorstep mobile app)
    {
      phone: '9876543214',
      name: 'R. Murugan (Field Collection Agent - Perundurai Route)',
      roles: [Role.COLLECTION_AGENT],
    },
    {
      phone: '9876543215',
      name: 'V. Karthik (Field Collection Agent - Erode Route)',
      roles: [Role.COLLECTION_AGENT],
    },
    // Statutory Auditor (Read-only Compliance)
    {
      phone: '9876543216',
      name: 'CA V. Natarajan (Statutory Auditor)',
      roles: [Role.AUDITOR],
    },
  ];

  const seededUsers: Record<string, any> = {};

  for (const staff of staffMembers) {
    const user = await prisma.user.upsert({
      where: { phone: staff.phone },
      update: {
        roles: staff.roles,
        name: staff.name,
      },
      create: {
        branchId: branch.id,
        name: staff.name,
        phone: staff.phone,
        passwordHash: defaultPasswordHash,
        mpinHash: defaultMpinHash,
        roles: staff.roles,
        isActive: true,
      },
    });
    seededUsers[staff.phone] = user;
  }

  console.log(`    ✅ Branch & ${Object.keys(seededUsers).length} staff users seeded.`);
  return { branch, users: seededUsers };
}
