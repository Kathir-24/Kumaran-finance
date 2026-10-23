import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuctionModule } from './auction/auction.module';
import { AuthModule } from './auth/auth.module';
import { BranchModule } from './branch/branch.module';
import { ChitModule } from './chit/chit.module';
import { CollectionModule } from './collection/collection.module';
import {
  THROTTLE_DEFAULT_LIMIT,
  THROTTLE_DEFAULT_TTL_MS,
} from './common/constants';
import { validateEnv } from './config/env.validation';
import { CustomerModule } from './customer/customer.module';
import { DisbursementModule } from './disbursement/disbursement.module';
import { HealthController } from './health/health.controller';
import { InstallmentModule } from './installment/installment.module';
import { JobsModule } from './jobs/jobs.module';
import { MetricsModule } from './metrics/metrics.module';
import { HttpMetricsInterceptor } from './metrics/interceptors/http-metrics.interceptor';
import { NotificationModule } from './notification/notification.module';
import { PaymentModule } from './payment/payment.module';
import { PdfModule } from './pdf/pdf.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportModule } from './report/report.module';
import { SentryService } from './common/sentry/sentry.service';
import { StorageModule } from './storage/storage.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: THROTTLE_DEFAULT_TTL_MS,
        limit: THROTTLE_DEFAULT_LIMIT,
      },
    ]),
    PrismaModule,
    AuthModule,
    BranchModule,
    UserModule,
    CustomerModule,
    ChitModule,
    AuctionModule,
    InstallmentModule,
    CollectionModule,
    PaymentModule,
    DisbursementModule,
    ReportModule,
    StorageModule,
    PdfModule,
    JobsModule,
    MetricsModule,
    NotificationModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    SentryService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [SentryService],
})
export class AppModule {}
