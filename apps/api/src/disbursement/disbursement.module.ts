import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { DisbursementController } from './disbursement.controller';
import { DisbursementService } from './disbursement.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [DisbursementController],
  providers: [DisbursementService],
  exports: [DisbursementService],
})
export class DisbursementModule {}
