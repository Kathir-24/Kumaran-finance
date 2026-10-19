import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuctionModule } from './auction/auction.module';
import { AuthModule } from './auth/auth.module';
import { ChitModule } from './chit/chit.module';
import { CollectionModule } from './collection/collection.module';
import { validateEnv } from './config/env.validation';
import { CustomerModule } from './customer/customer.module';
import { DisbursementModule } from './disbursement/disbursement.module';
import { HealthController } from './health/health.controller';
import { InstallmentModule } from './installment/installment.module';
import { JobsModule } from './jobs/jobs.module';
import { PaymentModule } from './payment/payment.module';
import { PdfModule } from './pdf/pdf.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportModule } from './report/report.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
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
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
