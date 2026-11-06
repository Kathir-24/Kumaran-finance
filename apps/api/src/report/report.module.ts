import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { StatutoryReportService } from './statutory-report.service';

@Module({
  imports: [PrismaModule, JobsModule],
  controllers: [ReportController],
  providers: [ReportService, StatutoryReportService],
  exports: [ReportService, StatutoryReportService],
})
export class ReportModule {}
