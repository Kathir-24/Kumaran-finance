import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Kumaran Chits database seed...');

  // 1. Seed Single Physical Branch (Head Office - Perundurai, Erode)
  const branch = await prisma.branch.upsert({
    where: { code: 'PRD' },
    update: {},
    create: {
      code: 'PRD',
      name: 'Head Office - Perundurai',
      nameTamil: 'தலைமை கிளை - பெருந்துறை',
      address: 'Main Road, Perundurai, Erode, Tamil Nadu',
      phone: '+91 98765 43210',
      isActive: true,
    },
  });
  console.log(`✅ Branch seeded: ${branch.name} (${branch.code})`);

  // 2. Seed Initial Super Admin User (Partner Account)
  const saltRounds = 12;
  const passwordHash = await bcrypt.hash('Admin@Kumaran2026', saltRounds);

  const admin = await prisma.user.upsert({
    where: { phone: '9876543210' },
    update: {},
    create: {
      branchId: branch.id,
      name: 'Kumaran Partner Admin',
      phone: '9876543210',
      email: 'admin@kumaranfinance.com',
      passwordHash,
      roles: [Role.SUPER_ADMIN],
      isActive: true,
    },
  });
  console.log(`✅ Super Admin seeded: ${admin.name} (${admin.phone})`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
