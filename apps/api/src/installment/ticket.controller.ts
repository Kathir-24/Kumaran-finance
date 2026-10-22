import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ApiOkResponseEnvelope,
} from '../common/decorators/api-response-envelope.decorator';
import {
  DefaulterItemResponseDto,
  InstallmentDueResponseDto,
  PassbookResponseDto,
  RemoveDefaulterResponseDto,
} from './dto/installment-response.dto';
import { RemoveDefaulterDto } from './dto/remove-defaulter.dto';
import { InstallmentService } from './installment.service';

@ApiTags('Subscriber Tickets & Passbook')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 401, description: 'Unauthorized — Invalid or missing Bearer token' })
@ApiResponse({ status: 403, description: 'Forbidden — Insufficient role permissions or BOLA violation' })
@Controller('tickets')
export class TicketController {
  constructor(private readonly installmentService: InstallmentService) {}

  @Get('defaulters')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'List subscribers with consecutive arrears',
    description:
      'Retrieves all subscribers with 1 or more consecutive unpaid installments. Highlights subscribers with >= 3 consecutive unpaid months who are eligible for default removal. Allowed: Staff and Auditor.',
  })
  @ApiQuery({
    name: 'minConsecutiveMonths',
    required: false,
    type: Number,
    description: 'Minimum consecutive unpaid months threshold (default: 1)',
  })
  @ApiOkResponseEnvelope(DefaulterItemResponseDto, { isArray: true, description: 'Defaulters list retrieved' })
  async getDefaulters(
    @CurrentUser('branchId') branchId?: string | null,
    @Query('minConsecutiveMonths', new ParseIntPipe({ optional: true }))
    minConsecutiveMonths?: number,
  ) {
    const minMonths = minConsecutiveMonths ?? 1;
    return this.installmentService.getDefaulters(
      branchId || undefined,
      minMonths,
    );
  }

  @Get(':ticketId/dues')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'View all scheduled monthly dues for a subscriber ticket',
    description:
      'Returns the full schedule of past and upcoming monthly dues (Gross, Dividend deduction, Net payable, Paid amount, Status). Customers can only view their own ticket. Allowed: All authenticated personas.',
  })
  @ApiOkResponseEnvelope(InstallmentDueResponseDto, { isArray: true, description: 'Ticket dues schedule retrieved' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async getTicketDues(
    @Param('ticketId') ticketId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    const isCustomer = roles?.includes(Role.CUSTOMER);
    return this.installmentService.getTicketDues(
      ticketId,
      userId,
      isCustomer ? Role.CUSTOMER : undefined,
    );
  }

  @Get(':ticketId/passbook')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Get detailed real-time digital passbook statement',
    description:
      'Provides a complete passbook statement from Month 1 to N, including cumulative gross dues, dividends earned, net payable, payments made, and current outstanding balance. Customers are restricted to their own ticket. Allowed: All authenticated personas.',
  })
  @ApiOkResponseEnvelope(PassbookResponseDto, { description: 'Passbook statement retrieved' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async getPassbook(
    @Param('ticketId') ticketId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    const isCustomer = roles?.includes(Role.CUSTOMER);
    return this.installmentService.getPassbook(
      ticketId,
      userId,
      isCustomer ? Role.CUSTOMER : undefined,
    );
  }

  @Post(':id/remove-defaulter')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Company 3-Month Arrears Removal Rights (ADR-07 & ADR-12)',
    description:
      'Executes company removal rights when a subscriber has defaulted on 3 or more consecutive monthly installments (consecutiveUnpaidMonths >= 3). Transitions ticket status to REMOVED_DEF_3M. Allowed strictly: Super Admin (Partners).',
  })
  @ApiOkResponseEnvelope(RemoveDefaulterResponseDto, {
    description: 'Subscriber ticket successfully removed for 3-month default',
  })
  @ApiResponse({
    status: 400,
    description: 'Ticket has fewer than 3 consecutive unpaid months',
  })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async removeDefaulter(
    @Param('id') ticketId: string,
    @CurrentUser('sub') adminUserId: string,
    @Body() dto: RemoveDefaulterDto,
  ) {
    return this.installmentService.removeDefaulter(
      ticketId,
      adminUserId,
      dto,
    );
  }
}

