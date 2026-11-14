// ==============================================================================
// Kumaran Chits — Sync Missing Seed Documents to MinIO Dev Bucket
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Purpose: Populates binary objects in MinIO for seed-created customer KYC and security docs
// ==============================================================================

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { createS3Client, resolveS3Config } from './backup-utils';

async function main() {
  const config = resolveS3Config();
  const s3 = createS3Client(config);
  const prisma = new PrismaClient();

  console.log(`[SYNC] Verifying binary objects in MinIO bucket '${config.bucket}' for all database document references...`);

  const [customerDocs, winners] = await Promise.all([
    prisma.customerDocument.findMany({ select: { id: true, s3Key: true, fileName: true } }),
    prisma.auctionWinner.findMany({
      where: { securityDocS3Key: { not: null } },
      select: { id: true, securityDocS3Key: true },
    }),
  ]);

  console.log(`[SYNC] Found ${customerDocs.length} CustomerDocument rows, ${winners.length} AuctionWinner security docs.`);

  // Sample minimal valid JPEG buffer (1x1 pixel)
  const sampleJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x09, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
    0x3f, 0x00, 0x37, 0xff, 0xd9,
  ]);

  // Sample minimal valid PDF buffer
  const samplePdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 300 144]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000102 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n185\n%%EOF\n',
  );

  let uploadedCount = 0;

  for (const doc of customerDocs) {
    try {
      await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: doc.s3Key }));
    } catch {
      const isPdf = doc.s3Key.endsWith('.pdf');
      const body = isPdf ? samplePdf : sampleJpeg;
      const mime = isPdf ? 'application/pdf' : 'image/jpeg';
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: doc.s3Key,
          Body: body,
          ContentType: mime,
        }),
      );
      uploadedCount++;
    }
  }

  for (const w of winners) {
    if (!w.securityDocS3Key) continue;
    try {
      await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: w.securityDocS3Key }));
    } catch {
      const isPdf = w.securityDocS3Key.endsWith('.pdf');
      const body = isPdf ? samplePdf : sampleJpeg;
      const mime = isPdf ? 'application/pdf' : 'image/jpeg';
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: w.securityDocS3Key,
          Body: body,
          ContentType: mime,
        }),
      );
      uploadedCount++;
    }
  }

  console.log(`[SYNC] Completed! Uploaded ${uploadedCount} missing binary documents into MinIO.`);
  await prisma.$disconnect();
}

main().catch(console.error);
