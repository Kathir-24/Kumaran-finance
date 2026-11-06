import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChitController } from './chit.controller';
import { ChitService } from './chit.service';

@Module({
  imports: [PrismaModule, AuthModule, JobsModule],
  controllers: [ChitController],
  providers: [ChitService],
  exports: [ChitService],
})
export class ChitModule {}
