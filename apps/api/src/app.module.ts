import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CustomerModule } from './customer/customer.module';
import { ChitModule } from './chit/chit.module';
import { AuctionModule } from './auction/auction.module';
import { InstallmentModule } from './installment/installment.module';
import { CollectionModule } from './collection/collection.module';
import { PaymentModule } from './payment/payment.module';
import { validateEnv } from './config/env.validation';

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
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
