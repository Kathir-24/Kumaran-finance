import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { VersioningType } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';

async function exportOpenApi() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    logger: false,
  });

  app.setGlobalPrefix('api', {
    exclude: ['health', 'api/docs'],
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Kumaran Chits — Operations API')
    .setDescription(
      'Official backend RESTful API for Kumaran Finance (Head Office: Perundurai, Erode, Tamil Nadu). ' +
        'Enforces 64-bit integer Rupees (BigInt), 4% commission lock, fixed 1/4 ceiling, and Maker-Checker dual control.',
    )
    .setVersion('1.0.0')
    .addServer('/api/v1', 'Version 1 Base URL')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter staff JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Health', 'System health checks')
    .addTag('Auth', 'Staff identity, MPIN, and TOTP 2FA')
    .addTag('Customers', 'Customer intake, KYC, and Nominees')
    .addTag('Chits', 'Chit schemes, tickets, and mid-cycle onboarding')
    .addTag('Auctions', 'In-office auctions, bidding, and tie-breakers')
    .addTag('Installment Dues', 'Monthly installment schedules and arrears')
    .addTag('Subscriber Tickets & Passbook', 'Digital passbook and ticket ledger')
    .addTag('Collections & Cash Handover', 'Doorstep field collections and end-of-day branch handover')
    .addTag('Payments, Receipts & Reversals', 'Office counter payments, bilingual receipts, and dual-control reversals')
    .addTag('Prize Disbursements & Safety Proof', 'Prize settlement, safety proof checklist, and bilingual payout vouchers')
    .addTag('Dashboards & Statutory Reports', 'Form XXII, Form XVII, Form XXI, and executive dashboards')
    .addTag('Storage & Presigned Files', 'Encrypted document uploads and 15-minute presigned URLs')
    .addTag('Bilingual PDF Documents', 'On-demand 80mm receipts, A5 vouchers, minutes, and passbooks')
    .addTag('Background Jobs & Daily Maintenance', 'BullMQ queues, midnight arrears, and settlement reconciliation')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const outputPath = path.resolve(__dirname, '../../../docs/03-architecture/openapi-spec.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

  console.log(`[SUCCESS] OpenAPI JSON successfully written to: ${outputPath}`);
  console.log(`[METRICS] Total Documented Endpoints/Paths: ${Object.keys(document.paths).length}`);

  let operationCount = 0;
  for (const pathKey of Object.keys(document.paths)) {
    const pathObj = (document.paths as any)[pathKey];
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
      if (pathObj[method]) {
        operationCount++;
      }
    }
  }
  console.log(`[METRICS] Total Documented HTTP Operations: ${operationCount}`);

  await app.close();
}

exportOpenApi().catch((err) => {
  console.error('[ERROR] Failed to export OpenAPI specification:', err);
  process.exit(1);
});
