import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_EXPOSED_HEADERS,
  CORS_MAX_AGE_SECONDS,
  DEFAULT_CORS_ORIGINS,
} from './common/constants';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { BigIntInterceptor } from './common/interceptors/bigint.interceptor';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { BullBoardAuthMiddleware } from './jobs/bull-board/bull-board-auth.middleware';
import { BullBoardService } from './jobs/bull-board/bull-board.service';
import { initSentry } from './common/sentry/sentry.config';

async function bootstrap() {
  // 0. Initialize Sentry APM & Crash Monitoring (Safe bypass if SENTRY_DSN is unset)
  initSentry();

  const app = await NestFactory.create(AppModule, new ExpressAdapter());

  // 1. Security Headers via Helmet
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false, // Allows PDF rendering and Swagger assets
      contentSecurityPolicy: false, // Allows Swagger UI inline scripts without CDN failures
      xFrameOptions: { action: 'sameorigin' }, // Prevents clickjacking while allowing passbook iframes from same origin
    }),
  );

  // 2. Strict CORS Configuration
  const configuredOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : DEFAULT_CORS_ORIGINS;

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow non-browser requests (mobile Flutter apps, curl, server-to-server) where origin is undefined
      if (!origin || configuredOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    methods: CORS_ALLOWED_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: CORS_EXPOSED_HEADERS,
    credentials: true,
    maxAge: CORS_MAX_AGE_SECONDS,
  });

  // Global routing prefix with exemptions for root, health checks, API docs, Bull Board queue monitor, and Prometheus metrics
  app.setGlobalPrefix('api', {
    exclude: ['', '/', 'health', 'health/(.*)', 'metrics', 'api/docs', 'admin/queues', 'admin/queues/(.*)'],
  });

  // Enable URI Versioning (Default: '1' -> /api/v1/...)
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global DTO input validation & sanitization
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global BigInt serializer & Standardized Success Response Envelope
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(
    new BigIntInterceptor(),
    new TransformResponseInterceptor(reflector),
  );

  // Global standardized error exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Kumaran Chits — Operations API')
    .setDescription(
      'Official backend RESTful API for Kumaran Finance (Head Office: Perundurai, Erode, Tamil Nadu). ' +
        'Enforces 64-bit integer Rupees (BigInt), 4% commission lock, fixed 1/4 ceiling, and Maker-Checker dual control.',
    )
    .setVersion('1.0.0')
    .addServer('/', 'Default Base URL')

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
    .addBasicAuth(
      {
        type: 'http',
        scheme: 'basic',
        description: 'Enter HTTP Basic Auth credentials for Prometheus metrics',
      },
      'basic',
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
    .addTag('Observability & Metrics', 'Prometheus metrics, latency histograms, and system telemetry')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Kumaran Chits API Documentation',
  });

  // 6. Mount Bull Board Queue Monitor UI under /admin/queues with Super Admin Basic Auth
  const bullBoardService = app.get(BullBoardService);
  const bullBoardAuthMiddleware = app.get(BullBoardAuthMiddleware);
  app.use('/admin/queues', (req: any, res: any, next: any) => {
    bullBoardAuthMiddleware.use(req, res, () => {
      bullBoardService.getRouter()(req, res, next);
    });
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Kumaran Chits API running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation at: http://localhost:${port}/api/docs`);
  console.log(`📊 Bull Board Queue Monitor at: http://localhost:${port}/admin/queues`);
  console.log(`📈 Prometheus Metrics Exporter at: http://localhost:${port}/metrics`);
}
void bootstrap();
