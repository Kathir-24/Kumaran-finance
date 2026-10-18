import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChitController } from './chit.controller';
import { ChitService } from './chit.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ChitController],
  providers: [ChitService],
  exports: [ChitService],
})
export class ChitModule {}
