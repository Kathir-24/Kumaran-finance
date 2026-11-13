import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  ApiOkResponseEnvelope,
} from '../common/decorators/api-response-envelope.decorator';
import { AuctionService } from './auction.service';
import {
  AuctionDetailResponseDto,
  AuctionMinutesDto,
  AuctionResponseDto,
  EligibleBidderResponseDto,
  FinalizeAuctionResponseDto,
  MarkMinutesFiledResponseDto,
} from './dto/auction-response.dto';
import { FinalizeAuctionDto } from './dto/finalize-auction.dto';
import { MarkMinutesFiledDto } from './dto/mark-minutes-filed.dto';
import { RecordBidDto } from './dto/record-bid.dto';
import { RecordTieBreakDto } from './dto/record-tie-break.dto';
import {
  ApproveAuctionCorrectionDto,
  RequestAuctionCorrectionDto,
} from './dto/auction-correction.dto';

@ApiTags('Auctions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 401, description: 'Unauthorized — Invalid or missing Bearer token' })
@ApiResponse({ status: 403, description: 'Forbidden — Insufficient role permissions or BOLA violation' })
@Controller('auctions')
export class AuctionController {
  constructor(private readonly auctionService: AuctionService) {}

  @Get('group/:chitGroupId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'List all auctions and tie-break results for a chit scheme',
    description:
      'Returns past auction winners, winning discounts, universal dividend breakdowns, and paper token lot draws. Allowed: All authenticated personas.',
  })
  @ApiOkResponseEnvelope(AuctionResponseDto, { isArray: true, description: 'Auctions retrieved successfully' })
  async getGroupAuctions(@Param('chitGroupId') chitGroupId: string) {
    return this.auctionService.getGroupAuctions(chitGroupId);
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
    summary: 'Get details of a specific auction',
    description:
      'Returns auction status, winning ticket, tied bidders, and statutory minutes. Allowed: All authenticated personas.',
  })
  @ApiOkResponseEnvelope(AuctionDetailResponseDto, { description: 'Auction retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Auction not found' })
  async findOne(@Param('id') id: string) {
    return this.auctionService.findOne(id);
  }

  @Get(':id/eligible-bidders')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.AUDITOR)
  @ApiOperation({
    summary: 'Pre-Auction Defaulter Guard: List eligible non-prized subscribers',
    description:
      'ADR-07 Enforcement: Returns only active subscribers with zero arrears who have not previously won an auction. ID can be an Auction UUID or ChitGroup UUID (with optional month query). Allowed: Super Admin, Branch Manager, Auditor.',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Installment month (required if ID is ChitGroup UUID)',
  })
  @ApiOkResponseEnvelope(EligibleBidderResponseDto, { isArray: true, description: 'Eligible bidders list retrieved' })
  async getEligibleBidders(
    @Param('id') id: string,
    @Query('month') month?: string,
  ) {
    const monthNum = month ? parseInt(month, 10) : undefined;
    return this.auctionService.getEligibleBiddersForIdentifier(id, monthNum);
  }

  @Post(':id/record-bid')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Maker: Record winning auction bid and whole-rupee discount',
    description:
      'Records the in-office winning bid discount (Floor >= 4% Commission, Ceiling <= 1/4 Chit Value). Updates status to SCHEDULED and tags conductedByUserId (Maker). ID can be an Auction UUID or ChitGroup UUID (with optional month query). Allowed: Super Admin, Branch Manager.',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Installment month (required if ID is ChitGroup UUID)',
  })
  @ApiOkResponseEnvelope(AuctionResponseDto, { description: 'Bid recorded successfully' })
  @ApiResponse({
    status: 400,
    description: 'Ceiling exceeded or defaulter violation',
  })
  async recordBid(
    @Param('id') id: string,
    @Body() dto: RecordBidDto,
    @CurrentUser('sub') makerUserId: string,
    @Query('month') month?: string,
  ) {
    const monthNum = month ? parseInt(month, 10) : undefined;
    return this.auctionService.recordBidForIdentifier(
      id,
      dto,
      makerUserId,
      monthNum,
    );
  }

  @Post(':id/tie-break')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary:
      'Option A (Physical Paper Token Draw): Record ceiling tie-break winner',
    description:
      'Records all tied ceiling bidders and the winner drawn physically by Foreman in paper token draw. Zero computer lotteries. Allowed: Super Admin, Branch Manager.',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Installment month (required if ID is ChitGroup UUID)',
  })
  @ApiOkResponseEnvelope(AuctionResponseDto, { description: 'Tie-break recorded successfully' })
  async recordTieBreak(
    @Param('id') id: string,
    @Body() dto: RecordTieBreakDto,
    @CurrentUser('sub') makerUserId: string,
    @Query('month') month?: string,
  ) {
    const monthNum = month ? parseInt(month, 10) : undefined;
    return this.auctionService.recordTieBreakForIdentifier(
      id,
      dto,
      makerUserId,
      monthNum,
    );
  }

  @Post(':id/tie-break-record')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Alias for Option A Tie-Break (as in API Specification)',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Installment month (required if ID is ChitGroup UUID)',
  })
  @ApiOkResponseEnvelope(AuctionResponseDto, { description: 'Tie-break recorded successfully' })
  async recordTieBreakAlias(
    @Param('id') id: string,
    @Body() dto: RecordTieBreakDto,
    @CurrentUser('sub') makerUserId: string,
    @Query('month') month?: string,
  ) {
    return this.recordTieBreak(id, dto, makerUserId, month);
  }

  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Checker: Finalize auction and commit results (Partner strictly, Maker != Checker)',
    description:
      'Strict Maker-Checker Separation of Duties: Commits official auction results, updates winner ticket isPrized = true, and generates statutory minutes. Allowed strictly: Super Admin (Partner). Throws 403 Forbidden if finalized by the same user who recorded bids.',
  })
  @ApiOkResponseEnvelope(FinalizeAuctionResponseDto, { description: 'Auction successfully finalized' })
  @ApiResponse({
    status: 403,
    description: 'Maker-Checker separation violated or non-partner caller',
  })
  async finalize(
    @Param('id') auctionId: string,
    @CurrentUser('sub') checkerUserId: string,
    @CurrentUser('roles') userRoles: Role[],
    @Body() dto?: FinalizeAuctionDto,
  ) {
    return this.auctionService.finalizeAuction(auctionId, checkerUserId, dto, userRoles);
  }

  @Get(':id/minutes')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Get statutory Auction Minutes proceedings text',
    description:
      'Retrieves Form XVII statutory auction proceedings record with attendee count, discount, dividend, and Foreman signature flag. Allowed: Staff and Auditor.',
  })
  @ApiOkResponseEnvelope(AuctionMinutesDto, { description: 'Auction minutes retrieved' })
  @ApiResponse({ status: 404, description: 'Minutes not found' })
  async getMinutes(@Param('id') auctionId: string) {
    return this.auctionService.getAuctionMinutes(auctionId);
  }

  @Get(':id/minutes/pdf')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Get statutory Auction Minutes layout for printing / PDF',
    description:
      'Returns formatted statutory auction minutes for printable dispatch and audit recordkeeping.',
  })
  @ApiOkResponseEnvelope(AuctionMinutesDto, { description: 'Minutes text layout retrieved' })
  async getMinutesPdf(@Param('id') auctionId: string) {
    return this.auctionService.getAuctionMinutes(auctionId);
  }

  @Patch(':auctionId/mark-filed-with-registrar')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Mark auction minutes as filed with Government Chit Registrar',
    description:
      'Records official government challan/acknowledgement reference, filing date, and staff notes.',
  })
  @ApiOkResponseEnvelope(MarkMinutesFiledResponseDto, { description: 'Minutes marked as filed successfully' })
  @ApiResponse({ status: 400, description: 'Auction not finalized or minutes not found' })
  @ApiResponse({ status: 404, description: 'Auction not found' })
  async markMinutesFiled(
    @Param('auctionId') auctionId: string,
    @Body() dto: MarkMinutesFiledDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.auctionService.markMinutesFiled(auctionId, dto, currentUser.sub);
  }

  @Post(':id/correction/request')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Maker: Request correction of a finalized auction (Partner strictly)',
    description:
      'Initiates an audited correction of a finalized auction discount or winner. Strictly requires two-partner approval. Fails closed if prize money has already been disbursed.',
  })
  @ApiOkResponseEnvelope(AuctionResponseDto, {
    description: 'Finalized auction correction requested successfully (pending checker partner approval)',
  })
  @ApiResponse({ status: 400, description: 'Auction not finalized, prize already disbursed, or non-divisible dividend' })
  @ApiResponse({ status: 403, description: 'Forbidden: Super Admin only' })
  @ApiResponse({ status: 404, description: 'Auction not found' })
  async requestAuctionCorrection(
    @Param('id') auctionId: string,
    @Body() dto: RequestAuctionCorrectionDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.auctionService.requestAuctionCorrection(
      auctionId,
      currentUser.sub,
      dto,
      currentUser.roles,
    );
  }

  @Post(':id/correction/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Checker: Authorize and apply finalized auction correction (Independent Partner)',
    description:
      'Approves auction correction, recalculates universal dividends, updates winner records, and reconciles downstream monthly dues. Strictly enforces Maker != Checker (maker_partner_id != checker_partner_id).',
  })
  @ApiOkResponseEnvelope(AuctionResponseDto, {
    description: 'Finalized auction correction approved and applied successfully',
  })
  @ApiResponse({ status: 400, description: 'No pending correction request or prize already disbursed' })
  @ApiResponse({ status: 403, description: 'Maker-Checker violation or insufficient role' })
  @ApiResponse({ status: 404, description: 'Auction not found' })
  async approveAuctionCorrection(
    @Param('id') auctionId: string,
    @Body() dto: ApproveAuctionCorrectionDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.auctionService.approveAuctionCorrection(
      auctionId,
      currentUser.sub,
      dto,
      currentUser.roles,
    );
  }
}

