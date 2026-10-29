import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import {
  ApiCreatedResponseEnvelope,
  ApiOkResponseEnvelope,
  ApiPaginatedResponseEnvelope,
} from '../common/decorators/api-response-envelope.decorator';
import { ActionSuccessResponseDto } from '../common/dto/action-success.dto';
import { ChitService } from './chit.service';
import { ActivateChitDto } from './dto/activate-chit.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import {
  ChitGroupDetailResponseDto,
  ChitGroupResponseDto,
  TicketResponseDto,
} from './dto/chit-response.dto';
import { CreateChitGroupDto } from './dto/create-chit-group.dto';
import { OnboardOngoingChitDto } from './dto/onboard-ongoing-chit.dto';
import { QueryChitDto } from './dto/query-chit.dto';
import { UpdateChitGroupDto } from './dto/update-chit-group.dto';

@ApiTags('Chits')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 401, description: 'Unauthorized — Invalid or missing Bearer token' })
@ApiResponse({ status: 403, description: 'Forbidden — Insufficient role permissions or BOLA violation' })
@Controller('chits')
export class ChitController {
  constructor(private readonly chitService: ChitService) {}

  @Post('new')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create a fresh chit scheme (Starts Month 1)',
    description:
      'Initializes a new chit group in DRAFT status with automatic whole-rupee math, 4.00% commission lock, and fixed 1/4 ceiling. Allowed strictly: Super Admin.',
  })
  @ApiCreatedResponseEnvelope(ChitGroupResponseDto, { description: 'Chit group created successfully' })
  @ApiResponse({ status: 409, description: 'Group code already exists' })
  async create(
    @Body() dto: CreateChitGroupDto,
    @CurrentUser('branchId') staffBranchId?: string | null,
  ) {
    return this.chitService.create(dto, staffBranchId);
  }

  @Post('onboard-ongoing')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Mid-Cycle Intake: Onboard ongoing chit from physical paper notebook (Maker)',
    description:
      'Transcribes an active ongoing chit currently tracked in paper notebooks (e.g. Month 7) with historical auction winners and member roster. Enforces 1/4 ceiling and ADR-13 ticket limit. Allowed: Super Admin, Branch Manager, Accountant (Maker). Requires Checker activation by Super Admin.',
  })
  @ApiCreatedResponseEnvelope(ChitGroupResponseDto, { description: 'Ongoing chit onboarded successfully' })
  async onboardOngoing(
    @Body() dto: OnboardOngoingChitDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('branchId') staffBranchId?: string | null,
  ) {
    return this.chitService.onboardOngoing(dto, userId, staffBranchId);
  }

  @Get()
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'List chit schemes with status & keyword filter',
    description: 'Returns paginated chit schemes. Allowed: All authenticated personas.',
  })
  @ApiPaginatedResponseEnvelope(ChitGroupResponseDto, { description: 'Chit schemes list retrieved' })
  async findAll(@Query() query: QueryChitDto) {
    return this.chitService.findAll(query);
  }

  @Get(':id')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Get chit scheme details',
    description:
      'Returns scheme parameters, financial rules, assigned tickets, and past auction progress. Allowed: All authenticated personas.',
  })
  @ApiOkResponseEnvelope(ChitGroupDetailResponseDto, { description: 'Chit scheme found' })
  @ApiResponse({ status: 404, description: 'Chit scheme not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser?: JwtPayload,
  ) {
    return this.chitService.findOne(id, currentUser);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update draft chit scheme parameters',
    description:
      'Modifies group name, scheduled dates, or auction timing. Permitted strictly while status is DRAFT. Allowed strictly: Super Admin.',
  })
  @ApiOkResponseEnvelope(ChitGroupResponseDto, { description: 'Chit group updated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot update chit: Scheme is not in DRAFT status' })
  @ApiResponse({ status: 404, description: 'Chit scheme not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateChitGroupDto,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.chitService.update(id, dto, adminUserId);
  }

  @Post(':id/tickets/assign')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Assign a ticket to a verified subscriber',
    description:
      'Assigns ticket 1..N to a customer. Strictly enforces ADR-13: a customer cannot hold 2 or more tickets in the same chit group. Allowed: Super Admin, Branch Manager.',
  })
  @ApiCreatedResponseEnvelope(TicketResponseDto, { description: 'Ticket allocated successfully' })
  @ApiResponse({ status: 409, description: 'Customer already holds a ticket or ticket taken' })
  async assignTicket(
    @Param('id') chitGroupId: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.chitService.assignTicket(chitGroupId, dto);
  }

  @Delete(':id/tickets/:ticketNumber')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Unassign a ticket before scheme activation',
    description:
      'Frees an allocated ticket in DRAFT status to fix misallocations. Prohibited once scheme is active. Allowed: Super Admin, Branch Manager.',
  })
  @ApiOkResponseEnvelope(ActionSuccessResponseDto, { description: 'Ticket unassigned successfully' })
  @ApiResponse({ status: 400, description: 'Cannot unassign ticket: Scheme is not in DRAFT status' })
  @ApiResponse({ status: 404, description: 'Chit scheme or ticket not found' })
  async unassignTicket(
    @Param('id') chitGroupId: string,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @CurrentUser('sub') staffUserId: string,
  ) {
    return this.chitService.unassignTicket(chitGroupId, ticketNumber, staffUserId);
  }

  @Get(':id/tickets')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'View all tickets in a chit group',
    description: 'Lists all assigned tickets (1..N) with customer names and prized status. Allowed: All authenticated personas.',
  })
  @ApiOkResponseEnvelope(TicketResponseDto, { isArray: true, description: 'Tickets list retrieved' })
  async getTickets(@Param('id') chitGroupId: string) {
    return this.chitService.getTickets(chitGroupId);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Lock terms and activate chit scheme',
    description:
      'Verifies that all N tickets are filled, permanently freezes 4.00% commission, and executes Month 1 rule (company ticket takes full pool, no auction, ₹0 dividend). Allowed: Super Admin.',
  })
  @ApiOkResponseEnvelope(ChitGroupResponseDto, { description: 'Chit activated successfully' })
  @ApiResponse({ status: 400, description: 'Not all tickets assigned or already active' })
  async activate(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto?: ActivateChitDto,
  ) {
    return this.chitService.activate(id, userId, dto);
  }
}

