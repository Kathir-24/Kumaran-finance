import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { SetTimeout } from '../common/decorators/set-timeout.decorator';
import { DisbursementService } from './disbursement.service';
import { AuthorizePayoutDto } from './dto/authorize-payout.dto';
import { ConfirmSafetyProofDto } from './dto/confirm-safety-proof.dto';
import {
  BilingualVoucherResponseDto,
  DisbursementAuthorizationResponseDto,
  DisbursementReleaseResponseDto,
  FinalSettlementResponseDto,
  SafetyProofVerificationResponseDto,
  WinnerDisbursementItemDto,
} from './dto/disbursement-response.dto';
import { QueryDisbursementDto } from './dto/query-disbursement.dto';
import { ReleasePayoutDto } from './dto/release-payout.dto';
import { SafetyProofUrlResponseDto } from './dto/safety-proof-url-response.dto';
import { SettleFinalMonthDto } from './dto/settle-final-month.dto';
import { UploadSafetyProofResponseDto } from './dto/upload-safety-proof-response.dto';
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
  @ApiPaginatedResponseEnvelope(WinnerDisbursementItemDto, { description: 'Disbursements list returned' })
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
  @ApiOkResponseEnvelope(WinnerDisbursementItemDto, { description: 'Winner disbursement details returned' })
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

  @Post('auction/:auctionId/upload-safety-proof')
  @HttpCode(HttpStatus.CREATED)
  @SetTimeout(120_000)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Photo of signed agreement, signed blank cheques, or promissory note (JPG, PNG, WEBP, PDF up to 10 MB)',
        },
      },
    },
  })
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Maker: Upload signed blank cheques & agreement safety proof scan (Legacy Multipart Fallback)',
    description:
      'Multipart upload fallback retained for mobile offline sync and legacy clients. Web clients should use POST /api/v1/storage/presigned-upload-url followed by POST /api/v1/disbursements/auction/:auctionId/confirm-safety-proof.',
  })
  @ApiCreatedResponseEnvelope(UploadSafetyProofResponseDto, {
    description: 'Safety proof collateral scan uploaded successfully',
  })
  @ApiResponse({ status: 400, description: 'Missing file or invalid format/size' })
  @ApiResponse({ status: 404, description: 'Auction or winner record not found' })
  async uploadSafetyProof(
    @Param('auctionId') auctionId: string,
    @UploadedFile() file: any,
    @CurrentUser('sub') makerUserId: string,
  ) {
    return this.disbursementService.uploadSafetyProof(auctionId, file, makerUserId);
  }

  @Post('auction/:auctionId/confirm-safety-proof')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Maker: Confirm direct-to-S3 safety proof collateral upload (ADR-15)',
    description:
      'Verifies uploaded safety proof scan exists in private S3/local storage under safety-proof/{auctionId}/ and links securityDocS3Key to the AuctionWinner record.',
  })
  @ApiCreatedResponseEnvelope(UploadSafetyProofResponseDto, {
    description: 'Direct S3 safety proof upload confirmed and linked successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid key prefix, auction already disbursed, or object missing in storage' })
  @ApiResponse({ status: 404, description: 'Auction or winner record not found' })
  async confirmSafetyProof(
    @Param('auctionId') auctionId: string,
    @Body() dto: ConfirmSafetyProofDto,
    @CurrentUser('sub') makerUserId: string,
  ) {
    return this.disbursementService.confirmSafetyProof(auctionId, dto, makerUserId);
  }

  @Get('auction/:auctionId/safety-proof-url')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Checker: Generate 15-minute presigned viewing URL for safety proof scan',
    description:
      'Returns a secure, time-limited S3 presigned URL for Partner B (Checker) or Auditor to inspect uploaded blank cheques and agreements before clicking Authorize Payout. Allowed: Super Admin, Branch Manager, Accountant, Auditor.',
  })
  @ApiOkResponseEnvelope(SafetyProofUrlResponseDto, {
    description: 'Presigned viewing URL generated successfully',
  })
  @ApiResponse({ status: 404, description: 'Auction, winner, or uploaded document not found' })
  async getSafetyProofUrl(@Param('auctionId') auctionId: string) {
    return this.disbursementService.getSafetyProofPresignedUrl(auctionId);
  }

  @Post('auction/:auctionId/verify-safety-proof')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Maker: Verify Company Safety Proof Checklist (ADR-15)',
    description:
      'Records verification of signed agreements, signed blank cheques, promissory notes, and scanned documents. Transitions status from PENDING_VERIFICATION to VERIFIED_BY_MAKER.',
  })
  @ApiOkResponseEnvelope(SafetyProofVerificationResponseDto, { description: 'Safety proof verified and ready for authorization' })
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
  @ApiOkResponseEnvelope(DisbursementAuthorizationResponseDto, { description: 'Payout voucher authorized successfully' })
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
  @ApiOkResponseEnvelope(DisbursementReleaseResponseDto, { description: 'Prize payout released successfully' })
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
  @ApiOkResponseEnvelope(BilingualVoucherResponseDto, { description: 'Bilingual payout voucher data and text layout' })
  @ApiResponse({ status: 403, description: 'Customer attempting to access another member voucher' })
  @ApiResponse({ status: 404, description: 'Auction or winner not found' })
  async getBilingualVoucher(
    @Param('auctionId') auctionId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.disbursementService.getBilingualVoucher(auctionId, currentUser);
  }

  @Post('group/:chitGroupId/final-settlement')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Super Admin: Settle final remaining subscriber for Month N (Maturity Settlement)',
    description:
      'Settles Month N without auction. Disburses gross chit pool minus 4.00% Foreman Commission directly to the final unprized subscriber. Marks ticket isPrized = true and marks chit scheme as COMPLETED. Allowed: Super Admin.',
  })
  @ApiOkResponseEnvelope(FinalSettlementResponseDto, { description: 'Final month settlement successfully executed' })
  @ApiResponse({ status: 400, description: 'Invalid settlement request or more than 1 unprized ticket exists' })
  @ApiResponse({ status: 403, description: 'Forbidden: Super Admin exclusivity' })
  @ApiResponse({ status: 404, description: 'Chit group or ticket not found' })
  async settleFinalMonth(
    @Param('chitGroupId') chitGroupId: string,
    @Body() dto: SettleFinalMonthDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.disbursementService.settleFinalMonth(
      chitGroupId,
      dto,
      currentUser.sub,
      currentUser.roles,
    );
  }
}

