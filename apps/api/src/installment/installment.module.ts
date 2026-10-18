import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InstallmentController } from './installment.controller';
import { InstallmentService } from './installment.service';
import { TicketController } from './ticket.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [InstallmentController, TicketController],
  providers: [InstallmentService],
  exports: [InstallmentService],
})
export class InstallmentModule {}
