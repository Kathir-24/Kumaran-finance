import {
  Controller,
  Get,
  MessageEvent,
  Query,
  Sse,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { interval, Observable } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  ApiOkResponseEnvelope,
} from '../common/decorators/api-response-envelope.decorator';
import { SetTimeout } from '../common/decorators/set-timeout.decorator';
import { ReportEtagInterceptor } from '../common/interceptors/report-etag.interceptor';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { QueryCashBookDto } from './dto/query-cash-book.dto';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { QueryDayBookDto } from './dto/query-day-book.dto';
import { QueryDefaultersReportDto } from './dto/query-defaulters-report.dto';
import { QueryFormXviiDto } from './dto/query-form-xvii.dto';
import { QueryFormXxiDto } from './dto/query-form-xxi.dto';
import { QueryPendingApprovalsDto } from './dto/query-pending-approvals.dto';
import {
  AuditLogsReportResponseDto,
  DayBookReportResponseDto,
  DefaultersReportResponseDto,
  ExecutiveDashboardKpiResponseDto,
  FormXviiReportResponseDto,
  FormXxiReportResponseDto,
  FormXxiiReportResponseDto,
  PendingApprovalsResponseDto,
} from './dto/report-response.dto';
import { ReportService } from './report.service';

@ApiTags('Dashboards & Statutory Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 401, description: 'Unauthorized — Invalid or missing Bearer token' })
@ApiResponse({ status: 403, description: 'Forbidden — Insufficient role permissions or BOLA violation' })
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
  @ApiOkResponseEnvelope(ExecutiveDashboardKpiResponseDto, { description: 'Executive dashboard metrics returned' })
  async getDashboard(
    @Query() query: QueryDashboardDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportService.getExecutiveDashboard(query, currentUser);
  }

  @Get('pending-approvals')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Aggregated Maker-Checker Pending Approvals Queue',
    description:
      'Aggregates pending operational items requiring partner or branch manager action: unacknowledged cash handovers, prize disbursement authorizations, payment reversal requests, and pending safety proof verifications. Scoped to branch for Branch Manager.',
  })
  @ApiOkResponseEnvelope(PendingApprovalsResponseDto, {
    description: 'Aggregated pending approvals queue returned',
  })
  async getPendingApprovals(
    @Query() query: QueryPendingApprovalsDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportService.getPendingApprovals(currentUser, query);
  }

  @Sse('approvals-stream')
  @SetTimeout(0)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Real-Time Server-Sent Events (SSE) Stream for Pending Approvals',
    description:
      'Streams live pending approval counters and alerts to web dashboard and mobile app via SSE every 15 seconds. Scoped to user branch permissions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Live Server-Sent Events stream emitting approval summary events',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          example: 'data: {"type":"APPROVALS_UPDATE","summary":{"totalPendingCount":3},"timestamp":"2026-10-22T07:28:14.000Z"}\n\n',
        },
      },
    },
  })
  streamPendingApprovals(
    @Query() query: QueryPendingApprovalsDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Observable<MessageEvent> {
    return interval(15000).pipe(
      startWith(0),
      switchMap(async () => {
        const approvals = await this.reportService.getPendingApprovals(
          currentUser,
          query,
        );
        return {
          data: {
            type: 'APPROVALS_UPDATE',
            summary: approvals.summary,
            timestamp: new Date().toISOString(),
          },
        } as MessageEvent;
      }),
    );
  }

  @Get('day-book')
  @UseInterceptors(ReportEtagInterceptor)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Day Book: Daily Collection & Disbursement Journal',
    description:
      'Aggregates ALL payment modes (Cash, UPI, Bank Transfer, Cheques) for a given date. Displays receipts, vouchers, payment mode breakdowns, and net cash flow.',
  })
  @ApiOkResponseEnvelope(DayBookReportResponseDto, { description: 'Day book journal returned' })
  async getDayBook(
    @Query() query: QueryDayBookDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportService.getDayBook(query, currentUser);
  }

  @Get('form-xxii')
  @UseInterceptors(ReportEtagInterceptor)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Form XXII: Cash Book Register (Physical Cash Only) [UNVERIFIED-LEGAL]',
    description:
      'Daily register strictly isolating physical currency notes and coins in the branch safe / vault. Enforces Closing Cash in Safe = Opening Cash + Cash Inflows - Cash Outflows.',
  })
  @ApiOkResponseEnvelope(FormXxiiReportResponseDto, { description: 'Cash book register returned' })
  async getCashBookFormXxii(
    @Query() query: QueryCashBookDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportService.getCashBookFormXxii(query, currentUser);
  }

  @Get('form-xvii')
  @UseInterceptors(ReportEtagInterceptor)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Form XVII: Auction Minutes Consolidated Register [UNVERIFIED-LEGAL]',
    description:
      'Consolidated chronological record of all auctions for a chit scheme (Months 2 to N-1). Includes winning discounts, 4% commission, dividends, tie-break draws, and statutory proceedings.',
  })
  @ApiOkResponseEnvelope(FormXviiReportResponseDto, { description: 'Auction minutes register returned' })
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
  @ApiOkResponseEnvelope(FormXxiReportResponseDto, { description: 'Subscriber ledger returned' })
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
  @ApiOkResponseEnvelope(DefaultersReportResponseDto, { description: 'Defaulters aging report returned' })
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
  @ApiOkResponseEnvelope(AuditLogsReportResponseDto, { description: 'Audit trail records returned' })
  async getAuditLogs(
    @Query() query: QueryAuditLogsDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportService.getAuditLogs(query, currentUser);
  }
}

