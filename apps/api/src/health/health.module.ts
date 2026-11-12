// ==============================================================================
// Kumaran Chits — Health & Diagnostic Module
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// ==============================================================================

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [PrismaModule, JobsModule],
  controllers: [HealthController],
})
export class HealthModule {}
