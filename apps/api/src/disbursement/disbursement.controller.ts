import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { DisbursementService } from './disbursement.service';
import { AuthorizePayoutDto } from './dto/authorize-payout.dto';
import { QueryDisbursementDto } from './dto/query-disbursement.dto';
import { ReleasePayoutDto } from './dto/release-payout.dto';
import { VerifySafetyProofDto } from './dto/verify-safety-proof.dto';

@ApiTags('Prize Disbursements & Safety Proof')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 401, description: 'Unauthorized — Invalid or missing Bearer token' })
@ApiResponse({ status: 403, description: 'Forbidden — Insufficient role permissions or BOLA violation' })
@Controller('disbursements')
export class DisbursementController {
  constructor(private readonly disbursementService: DisbursementService) {}

  @Get()
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'List prize disbursements across chit schemes with filters and pagination',
    description:
      'Returns prize winners, disbursement statuses, payout modes, and release references. Allowed: Staff and Auditor.',
  })
  @ApiResponse({ status: 200, description: 'Disbursements list returned' })
  async queryDisbursements(
    @Query() query: QueryDisbursementDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.disbursementService.queryDisbursements(query, currentUser);
  }

  @Get('auction/:auctionId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Get prize disbursement details for a specific auction winner',
    description:
      'Returns winner details, safety checklist status, authorized payout mode, and release timestamps. Customers scoped strictly to self.',
  })
  @ApiResponse({ status: 200, description: 'Winner disbursement details returned' })
  @ApiResponse({ status: 403, description: 'Customer attempting to access another member record' })
  @ApiResponse({ status: 404, description: 'Auction or winner not found' })
  async getWinnerDisbursement(
    @Param('auctionId') auctionId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.disbursementService.getWinnerDisbursement(
      auctionId,
      currentUser,
    );
  }

  @Post('auction/:auctionId/verify-safety-proof')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Maker: Verify Company Safety Proof Checklist (ADR-15)',
    description:
      'Records verification of signed agreements, signed blank cheques, promissory notes, and scanned documents. Transitions status from PENDING_VERIFICATION to VERIFIED_BY_MAKER.',
  })
  @ApiResponse({ status: 200, description: 'Safety proof verified and ready for authorization' })
  @ApiResponse({ status: 400, description: 'Auction not finalized or invalid status transition' })
  @ApiResponse({ status: 404, description: 'Auction or winner not found' })
  async verifySafetyProof(
    @Param('auctionId') auctionId: string,
    @Body() dto: VerifySafetyProofDto,
    @CurrentUser('sub') makerUserId: string,
  ) {
    return this.disbursementService.verifySafetyProof(
      auctionId,
      dto,
      makerUserId,
    );
  }

  @Post('auction/:auctionId/authorize-payout')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Checker: Authorize prize money payout voucher (Super Admin strictly)',
    description:
      'Authorizes prize payout mode (Cheque, NEFT/RTGS/IMPS, Cash) and whole-rupee amount. Enforces Maker != Checker (verifiedByUserId != authorizedByUserId) and blocks Branch Manager.',
  })
  @ApiResponse({ status: 200, description: 'Payout voucher authorized successfully' })
  @ApiResponse({ status: 400, description: 'Safety proof not verified yet or invalid transition' })
  @ApiResponse({ status: 403, description: 'Maker-Checker violation or insufficient role' })
  @ApiResponse({ status: 404, description: 'Auction or winner not found' })
  async authorizePayout(
    @Param('auctionId') auctionId: string,
    @Body() dto: AuthorizePayoutDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.disbursementService.authorizePayout(
      auctionId,
      dto,
      currentUser.sub,
      currentUser.roles,
    );
  }

  @Post('auction/:auctionId/disburse')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Release prize money disbursement and record official reference',
    description:
      'Records transaction reference (Cheque number, Bank UTR, or Cash voucher) and release timestamp. Transitions status to DISBURSED.',
  })
  @ApiResponse({ status: 200, description: 'Prize payout released successfully' })
  @ApiResponse({ status: 400, description: 'Payout not authorized yet' })
  @ApiResponse({ status: 404, description: 'Auction or winner not found' })
  async releasePayout(
    @Param('auctionId') auctionId: string,
    @Body() dto: ReleasePayoutDto,
    @CurrentUser('sub') releaseUserId: string,
  ) {
    return this.disbursementService.releasePayout(
      auctionId,
      dto,
      releaseUserId,
    );
  }

  @Get('auction/:auctionId/voucher')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Generate bilingual prize disbursement voucher (English + தமிழ்)',
    description:
      'Returns formatted bilingual prize payout voucher with whole-rupee calculation breakdown, payout mode, transaction reference, and sign-off blocks. Customers scoped strictly to self.',
  })
  @ApiResponse({ status: 200, description: 'Bilingual payout voucher data and text layout' })
  @ApiResponse({ status: 403, description: 'Customer attempting to access another member voucher' })
  @ApiResponse({ status: 404, description: 'Auction or winner not found' })
  async getBilingualVoucher(
    @Param('auctionId') auctionId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.disbursementService.getBilingualVoucher(auctionId, currentUser);
  }
}
