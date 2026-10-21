import { PrismaClient } from '@prisma/client';
import { seedBranchAndUsers } from './seeders/01-branch-users.seeder';
import { seedCustomers } from './seeders/02-customers.seeder';
import { seedChitGroupsAndTickets } from './seeders/03-schemes-groups.seeder';
import { seedScenarios } from './seeders/04-scenarios.seeder';

const prisma = new PrismaClient();

async function main() {
  console.log('================================================================');
  console.log('🌱 Starting Kumaran Chits Comprehensive Database Seed (All N Scenarios)');
  console.log('================================================================');

  const startTime = Date.now();

  // 1. Seed Branch & Staff Hierarchy (Maker, Checker, Field Agents, Auditor)
  const { branch, users } = await seedBranchAndUsers(prisma);

  // 2. Seed Verified Subscribers, Nominees, and KYC Documents
  const customers = await seedCustomers(prisma, branch.id);

  // 3. Seed Schemes, Chit Groups, and Unique Subscriber Tickets (ADR-13)
  const groups = await seedChitGroupsAndTickets(prisma, branch.id, customers);

  // 4. Seed All 10 Operational N Scenarios (Auctions, Dues, Tie-Breaks, Defaulters, Reversals, Safety Proof, Mature Group)
  await seedScenarios(prisma, branch.id, users, groups);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('================================================================');
  console.log(`✅ Kumaran Chits database seed completed in ${durationSec}s!`);
  console.log('================================================================');
  console.log('🔐 Staff Test Credentials:');
  console.log('   • Super Admin (Managing Partner): 9876543210 / Admin@Kumaran2026');
  console.log('   • Super Admin (Checker Partner) : 9876543211 / Admin@Kumaran2026');
  console.log('   • Branch Manager (Maker)        : 9876543212 / Admin@Kumaran2026');
  console.log('   • Desk Accountant (Maker)       : 9876543213 / Admin@Kumaran2026');
  console.log('   • Field Agent 1 (Perundurai)    : 9876543214 / Admin@Kumaran2026');
  console.log('   • Field Agent 2 (Erode)         : 9876543215 / Admin@Kumaran2026');
  console.log('   • Statutory Auditor             : 9876543216 / Admin@Kumaran2026');
  console.log('   • Default MPIN for Mobile App   : 123456');
  console.log('================================================================');
}

main()
  .catch((e) => {
    console.error('❌ Database seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
