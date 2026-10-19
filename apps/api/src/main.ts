import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { BigIntInterceptor } from './common/interceptors/bigint.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());

  // Global routing prefix with exemptions for health checks and API documentation
  app.setGlobalPrefix('api', {
    exclude: ['health', 'api/docs'],
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

  // Global BigInt serializer for PostgreSQL whole-rupee integers
  app.useGlobalInterceptors(new BigIntInterceptor());

  // Swagger OpenAPI Documentation
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
    .addTag('Payments', 'Collections, dues, and bilingual receipts')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Kumaran Chits API Documentation',
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Kumaran Chits API running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation at: http://localhost:${port}/api/docs`);
}
void bootstrap();
