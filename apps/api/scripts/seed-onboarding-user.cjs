const { PrismaClient, Role } = require('@prisma/client');
const crypto = require('crypto');

function encryptAesGcm(plaintext, secretKey) {
  const key = crypto.createHash('sha256').update(secretKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public',
      },
    },
  });

  const testPhone = '9842100088';
  const passwordHash = '$2b$10$hoboKiB5sv2samNZ7kYZxuqbgOoS14Vui7zIK3BJXQZPbMR2CPG1u'; // TempPassword#123
  const totpPlainSecret = '4POMBZGFMEFPXRIIF7BVGDMFCSODUERH';
  const jwtSecret = 'kumaran-chits-dev-secret-key-replace-in-production-2026';

  let branch = await prisma.branch.findFirst({ where: { code: 'PRD' } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        code: 'PRD',
        name: 'Perundurai Head Office',
        nameTamil: 'பெருந்துறை தலைமை அலுவலகம்',
        address: 'Main Road, Perundurai',
        phone: '9842100000',
      },
    });
  }

  await prisma.session.deleteMany({ where: { user: { phone: testPhone } } });
  await prisma.user.deleteMany({ where: { phone: testPhone } });

  const encryptedTotp = encryptAesGcm(totpPlainSecret, jwtSecret);

  const user = await prisma.user.create({
    data: {
      phone: testPhone,
      name: 'Browser Onboarding Staff',
      passwordHash,
      roles: [Role.SUPER_ADMIN],
      isPartner: true,
      branchId: branch.id,
      isActive: true,
      mustChangePassword: true,
      isTotpEnabled: true,
      totpSecret: encryptedTotp,
    },
  });

  console.log('SEEDED_USER_ID:', user.id);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
