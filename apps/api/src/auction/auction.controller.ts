import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  ApproveAuctionCorrectionResponseDto,
  AuctionDetailResponseDto,
  AuctionMinutesDto,
  AuctionResponseDto,
  EligibleBidderResponseDto,
  FinalizeAuctionResponseDto,
  MarkMinutesFiledResponseDto,
  RejectAuctionCorrectionResponseDto,
  RequestAuctionCorrectionResponseDto,
} from './dto/auction-response.dto';
import { FinalizeAuctionDto } from './dto/finalize-auction.dto';
import { MarkMinutesFiledDto } from './dto/mark-minutes-filed.dto';
import { RecordBidDto } from './dto/record-bid.dto';
import { RecordTieBreakDto } from './dto/record-tie-break.dto';
import {
  ApproveAuctionCorrectionDto,
  RejectAuctionCorrectionDto,
  RequestAuctionCorrectionDto,
} from './dto/auction-correction.dto';
import { parseOptionalPositiveIntQuery } from './helpers/auction-access.helper';

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
  async getGroupAuctions(
    @Param('chitGroupId', new ParseUUIDPipe({ version: '4' })) chitGroupId: string,
    @CurrentUser() currentUser?: JwtPayload,
  ) {
    return this.auctionService.getGroupAuctions(chitGroupId, currentUser);
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
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() currentUser?: JwtPayload,
  ) {
    return this.auctionService.findOne(id, currentUser);
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
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('month') month?: string,
    @CurrentUser() currentUser?: JwtPayload,
  ) {
    const monthNum = parseOptionalPositiveIntQuery(month, 'Installment month');
    return this.auctionService.getEligibleBiddersForIdentifier(id, monthNum, currentUser);
  }

  @Post(':id/record-bid')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Maker: Record winning auction bid and whole-rupee discount',
    description:
      'Records the in-office winning bid discount (Floor >= frozen Foreman Commission, Ceiling <= 1/4 Chit Value). Updates status to SCHEDULED and tags conductedByUserId (Maker). ID can be an Auction UUID or ChitGroup UUID (with optional month query). Allowed: Super Admin (Partner), Branch Manager (Branch-scoped).',
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
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RecordBidDto,
    @CurrentUser() currentUser: JwtPayload,
    @Query('month') month?: string,
  ) {
    const monthNum = parseOptionalPositiveIntQuery(month, 'Installment month');
    return this.auctionService.recordBidForIdentifier(
      id,
      dto,
      currentUser.sub,
      monthNum,
      currentUser,
    );
  }

  @Post(':id/tie-break')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary:
      'Option A (Physical Paper Token Draw): Record ceiling tie-break winner',
    description:
      'Records all tied ceiling bidders and the winner drawn physically by Foreman in paper token draw. Zero computer lotteries. Allowed: Super Admin (Partner), Branch Manager (Branch-scoped).',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Installment month (required if ID is ChitGroup UUID)',
  })
  @ApiOkResponseEnvelope(AuctionResponseDto, { description: 'Tie-break recorded successfully' })
  async recordTieBreak(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RecordTieBreakDto,
    @CurrentUser() currentUser: JwtPayload,
    @Query('month') month?: string,
  ) {
    const monthNum = parseOptionalPositiveIntQuery(month, 'Installment month');
    return this.auctionService.recordTieBreakForIdentifier(
      id,
      dto,
      currentUser.sub,
      monthNum,
      currentUser,
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
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RecordTieBreakDto,
    @CurrentUser() currentUser: JwtPayload,
    @Query('month') month?: string,
  ) {
    return this.recordTieBreak(id, dto, currentUser, month);
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
    @Param('id', new ParseUUIDPipe({ version: '4' })) auctionId: string,
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
  async getMinutes(
    @Param('id', new ParseUUIDPipe({ version: '4' })) auctionId: string,
    @CurrentUser() currentUser?: JwtPayload,
  ) {
    return this.auctionService.getAuctionMinutes(auctionId, currentUser);
  }

  @Get(':id/minutes/pdf')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Get statutory Auction Minutes layout for printing / PDF',
    description:
      'Returns formatted statutory auction minutes for printable dispatch and audit recordkeeping.',
  })
  @ApiOkResponseEnvelope(AuctionMinutesDto, { description: 'Minutes text layout retrieved' })
  async getMinutesPdf(
    @Param('id', new ParseUUIDPipe({ version: '4' })) auctionId: string,
    @CurrentUser() currentUser?: JwtPayload,
  ) {
    return this.auctionService.getAuctionMinutes(auctionId, currentUser);
  }

  @Patch(':auctionId/mark-filed-with-registrar')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Mark auction minutes as filed with Government Chit Registrar',
    description:
      'Records official government challan/acknowledgement reference, filing date, and staff notes, transitioning auction status to MINUTES_FILED.',
  })
  @ApiOkResponseEnvelope(MarkMinutesFiledResponseDto, { description: 'Minutes marked as filed successfully' })
  @ApiResponse({ status: 400, description: 'Auction not finalized or minutes not found' })
  @ApiResponse({ status: 404, description: 'Auction not found' })
  async markMinutesFiled(
    @Param('auctionId', new ParseUUIDPipe({ version: '4' })) auctionId: string,
    @Body() dto: MarkMinutesFiledDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.auctionService.markMinutesFiled(
      auctionId,
      dto,
      currentUser.sub,
      currentUser,
    );
  }

  @Post(':id/correction/request')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Maker: Request correction of a finalized auction (Partner strictly)',
    description:
      'Initiates an audited correction of a finalized auction discount or winner. Strictly requires two-partner approval. Fails closed if prize money has already been disbursed.',
  })
  @ApiOkResponseEnvelope(RequestAuctionCorrectionResponseDto, {
    description: 'Finalized auction correction requested successfully (pending checker partner approval)',
  })
  @ApiResponse({ status: 400, description: 'Auction not finalized, prize already disbursed, or non-divisible dividend' })
  @ApiResponse({ status: 403, description: 'Forbidden: Super Admin only' })
  @ApiResponse({ status: 404, description: 'Auction not found' })
  async requestAuctionCorrection(
    @Param('id', new ParseUUIDPipe({ version: '4' })) auctionId: string,
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
  @ApiOkResponseEnvelope(ApproveAuctionCorrectionResponseDto, {
    description: 'Finalized auction correction approved and applied successfully',
  })
  @ApiResponse({ status: 400, description: 'No pending correction request or prize already disbursed' })
  @ApiResponse({ status: 403, description: 'Maker-Checker violation or insufficient role' })
  @ApiResponse({ status: 404, description: 'Auction not found' })
  async approveAuctionCorrection(
    @Param('id', new ParseUUIDPipe({ version: '4' })) auctionId: string,
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

  @Post(':id/correction/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Checker: Reject finalized auction correction request (Independent Partner)',
    description:
      'Rejects a pending auction correction request, leaving auction and prize records unchanged. Strictly enforces Maker != Checker (maker_partner_id != checker_partner_id).',
  })
  @ApiOkResponseEnvelope(RejectAuctionCorrectionResponseDto, {
    description: 'Finalized auction correction request rejected successfully',
  })
  @ApiResponse({ status: 400, description: 'No pending correction request' })
  @ApiResponse({ status: 403, description: 'Maker-Checker violation or non-partner caller' })
  @ApiResponse({ status: 404, description: 'Auction not found' })
  async rejectAuctionCorrection(
    @Param('id', new ParseUUIDPipe({ version: '4' })) auctionId: string,
    @Body() dto: RejectAuctionCorrectionDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.auctionService.rejectAuctionCorrection(
      auctionId,
      currentUser.sub,
      dto,
      currentUser.roles,
    );
  }
}

