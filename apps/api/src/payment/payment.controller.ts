import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
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
import {
  THROTTLE_UPI_CLAIM_LIMIT,
  THROTTLE_UPI_CLAIM_TTL_MS,
} from '../common/constants';
import { ApproveReversalDto } from './dto/approve-reversal.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  BilingualReceiptResponseDto,
  PaymentDetailResponseDto,
  PaymentRecordDto,
  PaymentReversalResponseDto,
  PendingUpiClaimItemDto,
  RecordPaymentResponseDto,
  SubmitUpiClaimResponseDto,
  VerifyUpiClaimResponseDto,
} from './dto/payment-response.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { RejectReversalDto } from './dto/reject-reversal.dto';
import { RequestReversalDto } from './dto/request-reversal.dto';
import { SubmitUpiClaimDto, VerifyUpiClaimDto } from './dto/submit-upi-claim.dto';
import { PaymentService } from './payment.service';

@ApiTags('Payments, Receipts & Reversals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 401, description: 'Unauthorized — Invalid or missing Bearer token' })
@ApiResponse({ status: 403, description: 'Forbidden — Insufficient role permissions or BOLA violation' })
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
  )
  @ApiOperation({
    summary: 'Record discrete payment (Office Counter or Direct)',
    description:
      'Records discrete payment for an installment due. Enforces ADR-07: Exact Inet matching, single discrete payment, zero partials, zero doubles. Generates bilingual receipt.',
  })
  @ApiCreatedResponseEnvelope(RecordPaymentResponseDto, { description: 'Payment recorded and receipt issued' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Optional unique UUID to prevent duplicate payments on retry (ADR-07)',
  })
  @ApiHeader({
    name: 'x-idempotency-key',
    required: false,
    description: 'Alternative lowercase HTTP header for idempotency key',
  })
  @ApiResponse({
    status: 400,
    description: 'Partial payment, duplicate payment, or invalid scheme state',
  })
  @ApiResponse({
    status: 404,
    description: 'Subscriber ticket or installment due not found',
  })
  async recordPayment(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() currentUser: JwtPayload,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
    @Headers('x-idempotency-key') xIdempotencyKeyHeader?: string,
  ) {
    if (!dto.idempotencyKey) {
      const headerKey = idempotencyKeyHeader?.trim() || xIdempotencyKeyHeader?.trim();
      if (headerKey) {
        dto.idempotencyKey = headerKey;
      }
    }
    return this.paymentService.recordPayment(
      dto,
      currentUser.sub,
      currentUser.branchId,
    );
  }

  @Get()
  @Roles(
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Query and list payments with filters and pagination',
    description:
      'List payments filtered by ticket, customer, scheme, mode, date range, or status. Customers are scoped strictly to their own payments.',
  })
  @ApiPaginatedResponseEnvelope(PaymentRecordDto, { description: 'Payments list returned' })
  async queryPayments(
    @Query() query: QueryPaymentDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.paymentService.queryPayments(query, currentUser);
  }

  @Get('pending-upi-claims')
  @Roles(Role.PARTNER, Role.BRANCH_MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'List pending UPI payment claims awaiting bank statement verification',
    description: 'Returns paginated claims in INITIATED status with customer and due details for Accounting Desk action.',
  })
  @ApiQuery({ name: 'branchId', required: false, type: String, description: 'Filter by branch ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  @ApiPaginatedResponseEnvelope(PendingUpiClaimItemDto, {
    description: 'Pending UPI claims retrieved successfully',
  })
  async getPendingUpiClaims(
    @CurrentUser() currentUser: JwtPayload,
    @Query('branchId') branchIdQuery?: string,
    @Query('page', new ParseIntPipe({ optional: true })) pageQuery?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limitQuery?: number,
  ) {
    const isPartner = currentUser.roles.includes(Role.PARTNER);
    const branchId = isPartner ? branchIdQuery : (currentUser.branchId || undefined);
    const page = Math.max(1, pageQuery || 1);
    const limit = Math.min(100, Math.max(1, limitQuery || 20));
    return this.paymentService.getPendingUpiClaims(branchId, { page, limit });
  }

  @Get(':id')
  @Roles(
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Get payment record details by ID',
    description:
      'Retrieves single payment details including allocation, installment due, receipt, and reversal status. Customers scoped strictly to self.',
  })
  @ApiOkResponseEnvelope(PaymentDetailResponseDto, { description: 'Payment record returned' })
  @ApiResponse({
    status: 403,
    description: 'Customer attempting to access another member record',
  })
  @ApiResponse({ status: 404, description: 'Payment record not found' })
  async getPaymentById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.paymentService.getPaymentById(id, currentUser);
  }

  @Get(':id/receipt')
  @Roles(
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Generate bilingual receipt (English + தமிழ்)',
    description:
      'Returns formatted bilingual receipt (English + தமிழ்) matching approved template with whole-rupee breakdown, chit code, ticket number, and collector details.',
  })
  @ApiOkResponseEnvelope(BilingualReceiptResponseDto, {
    description: 'Bilingual receipt data and formatted text layout',
  })
  @ApiResponse({
    status: 403,
    description: 'Customer attempting to access another member receipt',
  })
  @ApiResponse({ status: 404, description: 'Receipt not found' })
  async getReceipt(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.paymentService.getBilingualReceipt(id, currentUser);
  }

  @Post(':id/request-reversal')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.PARTNER)
  @ApiOperation({
    summary: 'Maker: Request payment reversal with justification (Partner strictly)',
    description:
      'Initiates payment reversal request with mandatory reason code (e.g. wrong ticket, cheque bounce, duplicate entry). Strictly requires two-partner approval: one Partner initiates, a different Partner approves.',
  })
  @ApiOkResponseEnvelope(PaymentReversalResponseDto, {
    description: 'Payment reversal requested successfully',
  })
  @ApiResponse({
    status: 400,
    description:
      'Payment already reversed, not success, or request already pending',
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async requestReversal(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RequestReversalDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.paymentService.requestReversal(id, dto, userId);
  }

  @Post(':id/approve-reversal')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.PARTNER)
  @ApiOperation({
    summary: 'Checker: Authorize payment reversal (Partner strictly)',
    description:
      'Approves payment reversal, updates Payment to REVERSED, restores InstallmentDue strictly to UNPAID, and logs AuditLog. Strictly enforces Maker != Checker (maker_user_id != checker_user_id).',
  })
  @ApiOkResponseEnvelope(PaymentReversalResponseDto, {
    description:
      'Payment reversal approved and installment restored to UNPAID',
  })
  @ApiResponse({ status: 400, description: 'No pending reversal request found' })
  @ApiResponse({
    status: 403,
    description: 'Maker-Checker violation or insufficient role',
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async approveReversal(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApproveReversalDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.paymentService.approveReversal(
      id,
      dto,
      currentUser.sub,
      currentUser.roles,
    );
  }

  @Post(':id/reject-reversal')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.PARTNER)
  @ApiOperation({
    summary: 'Checker: Reject payment reversal request (Partner strictly)',
    description:
      'Rejects reversal request and retains payment in SUCCESS status. Strictly enforces Maker != Checker.',
  })
  @ApiOkResponseEnvelope(PaymentReversalResponseDto, {
    description: 'Payment reversal request rejected',
  })
  @ApiResponse({ status: 400, description: 'No pending reversal request found' })
  @ApiResponse({
    status: 403,
    description: 'Maker-Checker violation or insufficient role',
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async rejectReversal(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectReversalDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.paymentService.rejectReversal(
      id,
      dto,
      currentUser.sub,
      currentUser.roles,
    );
  }

  @Post('upi-claim')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: THROTTLE_UPI_CLAIM_LIMIT, ttl: THROTTLE_UPI_CLAIM_TTL_MS } })
  @Roles(Role.CUSTOMER, Role.PARTNER, Role.BRANCH_MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Submit customer UPI payment claim (Bank UTR self-report)',
    description:
      'Records bank UTR reference from deep-link payment in INITIATED status. Desk Accountant verifies bank credit before receipt is issued.',
  })
  @ApiCreatedResponseEnvelope(SubmitUpiClaimResponseDto, {
    description: 'UPI claim recorded pending bank statement verification',
  })
  @ApiResponse({ status: 400, description: 'Installment already paid or invalid scheme state' })
  @ApiResponse({ status: 409, description: 'Bank UTR already submitted or active pending claim exists' })
  @ApiResponse({ status: 429, description: 'Too many UPI claim submissions. Please wait 15 minutes.' })
  async submitUpiClaim(
    @Body() dto: SubmitUpiClaimDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.paymentService.submitUpiClaim(dto, currentUser);
  }

  @Post(':id/verify-upi-claim')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.PARTNER, Role.BRANCH_MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Verify customer UPI claim against bank statement & issue receipt',
    description:
      'Staff confirms bank credit for UTR. Transitions payment to SUCCESS, issues sequential bilingual receipt, and marks due PAID. Strictly enforces Maker != Checker.',
  })
  @ApiOkResponseEnvelope(VerifyUpiClaimResponseDto, {
    description: 'UPI claim verified, receipt issued, due settled',
  })
  @ApiResponse({ status: 400, description: 'Invalid claim state or already paid' })
  @ApiResponse({ status: 403, description: 'Maker != Checker violation or insufficient role' })
  async verifyUpiClaim(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto?: VerifyUpiClaimDto,
  ) {
    return this.paymentService.verifyUpiClaim(
      id,
      currentUser.sub,
      currentUser.roles,
      currentUser.branchId,
      dto,
    );
  }
}

