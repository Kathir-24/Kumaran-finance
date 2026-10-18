import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { QueryCashBookDto } from './dto/query-cash-book.dto';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { QueryDayBookDto } from './dto/query-day-book.dto';
import { QueryDefaultersReportDto } from './dto/query-defaulters-report.dto';
import { QueryFormXviiDto } from './dto/query-form-xvii.dto';
import { QueryFormXxiDto } from './dto/query-form-xxi.dto';
import { ReportService } from './report.service';

@ApiTags('Dashboards & Statutory Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('dashboard')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Executive KPI Dashboard & Vault Metrics',
    description:
      'Provides high-level operational overview: active chits, collections by mode, prize payouts, vault cash balance, pending handovers, and arrears aging buckets. Scoped to branch for Branch Manager.',
  })
  @ApiResponse({ status: 200, description: 'Executive dashboard metrics returned' })
  async getDashboard(
    @Query() query: QueryDashboardDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportService.getExecutiveDashboard(query, currentUser);
  }

  @Get('day-book')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Day Book: Daily Collection & Disbursement Journal',
    description:
      'Aggregates ALL payment modes (Cash, UPI, Bank Transfer, Cheques) for a given date. Displays receipts, vouchers, payment mode breakdowns, and net cash flow.',
  })
  @ApiResponse({ status: 200, description: 'Day book journal returned' })
  async getDayBook(
    @Query() query: QueryDayBookDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportService.getDayBook(query, currentUser);
  }

  @Get('form-xxii')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Form XXII: Cash Book Register (Physical Cash Only) [UNVERIFIED-LEGAL]',
    description:
      'Daily register strictly isolating physical currency notes and coins in the branch safe / vault. Enforces Closing Cash in Safe = Opening Cash + Cash Inflows - Cash Outflows.',
  })
  @ApiResponse({ status: 200, description: 'Cash book register returned' })
  async getCashBookFormXxii(
    @Query() query: QueryCashBookDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportService.getCashBookFormXxii(query, currentUser);
  }

  @Get('form-xvii')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Form XVII: Auction Minutes Consolidated Register [UNVERIFIED-LEGAL]',
    description:
      'Consolidated chronological record of all auctions for a chit scheme (Months 2 to N-1). Includes winning discounts, 4% commission, dividends, tie-break draws, and statutory proceedings.',
  })
  @ApiResponse({ status: 200, description: 'Auction minutes register returned' })
  async getAuctionMinutesFormXvii(
    @Query() query: QueryFormXviiDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportService.getAuctionMinutesFormXvii(query, currentUser);
  }

  @Get('form-xxi')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.AUDITOR,
    Role.CUSTOMER,
  )
  @ApiOperation({
    summary: 'Form XXI: Subscriber Ledger Register [UNVERIFIED-LEGAL]',
    description:
      'Continuous 20-month schedule of base dues, dividend credits, payments, and arrears per ticket. Customers are strictly restricted to their own ticket passbook statement.',
  })
  @ApiResponse({ status: 200, description: 'Subscriber ledger returned' })
  async getSubscriberLedgerFormXxi(
    @Query() query: QueryFormXxiDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportService.getSubscriberLedgerFormXxi(query, currentUser);
  }

  @Get('defaulters')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Defaulters & Arrears Aging Register',
    description:
      'Lists overdue subscribers categorized into 1-month, 2-month, and 3-month (DEFAULT_3_MONTHS) default buckets. Collection agents use this for field recovery rounds; Super Admin can identify candidates for company removal rights.',
  })
  @ApiResponse({ status: 200, description: 'Defaulters aging report returned' })
  async getDefaulters(
    @Query() query: QueryDefaultersReportDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportService.getDefaultersAgingReport(query, currentUser);
  }

  @Get('audit-logs')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.AUDITOR,
    Role.CUSTOMER,
  )
  @ApiOperation({
    summary: 'Immutable Audit Trail Register',
    description:
      'Append-only record of dual-control actions (auction finalizations, reversals, safety proofs, payouts, removals). Customers can view their own account transaction logs only.',
  })
  @ApiResponse({ status: 200, description: 'Audit trail records returned' })
  async getAuditLogs(
    @Query() query: QueryAuditLogsDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportService.getAuditLogs(query, currentUser);
  }
}
