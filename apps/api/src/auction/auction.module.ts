import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuctionController } from './auction.controller';
import { AuctionService } from './auction.service';

@Module({
  imports: [PrismaModule, AuthModule, JobsModule],
  controllers: [AuctionController],
  providers: [AuctionService],
  exports: [AuctionService],
})
export class AuctionModule {}
