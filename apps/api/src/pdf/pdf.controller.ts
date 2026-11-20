import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
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
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  PRESIGNED_URL_EXPIRES_IN_SECONDS,
  THROTTLE_PDF_LIMIT,
  THROTTLE_PDF_TTL_MS,
} from '../common/constants';
import { SetTimeout } from '../common/decorators/set-timeout.decorator';
import { FontResolverHelper } from './helpers/font-resolver.helper';
import { GeneratedPdfResult, PdfService } from './pdf.service';

@ApiTags('Bilingual PDF Documents')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Throttle({ default: { limit: THROTTLE_PDF_LIMIT, ttl: THROTTLE_PDF_TTL_MS } })
@SetTimeout(30000)
@ApiResponse({ status: 429, description: 'Too many PDF generation requests. Please wait a minute.' })
@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  private deliverPdfResponse(
    res: Response,
    result: GeneratedPdfResult,
    prefix: string,
    rawId: string,
    download?: boolean,
    redirect?: string,
    stream?: string,
  ): void {
    // Prevent browser/proxy caching of sensitive PDFs and 15-minute presigned bearer URLs across all modes
    res.setHeader('Cache-Control', 'private, no-store');

    if (String(download) === 'true') {
      res.json({
        key: result.key,
        presignedUrl: result.presignedUrl,
        expiresInSeconds: PRESIGNED_URL_EXPIRES_IN_SECONDS,
      });
      return;
    }

    if (String(redirect) === 'true' && String(stream) !== 'true') {
      res.redirect(result.presignedUrl);
      return;
    }

    const safeId = FontResolverHelper.sanitizeDispositionSegment(rawId, 'document');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${prefix}-${safeId}.pdf"`,
    );
    res.end(result.buffer);
  }

  @Get('receipt/:paymentId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Generate and stream bilingual subscription receipt PDF',
    description:
      'Generates pixel-accurate A5 bilingual (English + தமிழ்) subscription receipt document and saves to private storage.',
  })
  @ApiQuery({
    name: 'download',
    required: false,
    type: Boolean,
    description: 'Return presigned URL JSON instead of streaming PDF binary',
  })
  @ApiQuery({
    name: 'redirect',
    required: false,
    type: Boolean,
    description: 'Redirect directly to presigned S3/CDN URL (HTTP 302)',
  })
  @ApiQuery({
    name: 'stream',
    required: false,
    type: Boolean,
    description: 'Stream raw PDF binary buffer directly from origin API server',
  })
  @ApiResponse({
    status: 200,
    description: 'Bilingual receipt PDF stream or presigned URL JSON',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
          description: 'Bilingual subscription receipt digital PDF document binary stream',
        },
      },
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            key: { type: 'string', example: 'receipts/PRD/2026/KC-REC-PRD-2026-00001.pdf' },
            presignedUrl: { type: 'string', example: 'https://storage.kumaranfinance.in/receipts/PRD/2026/KC-REC-PRD-2026-00001.pdf?sig=...' },
            expiresInSeconds: { type: 'number', example: 900 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 302, description: 'Redirected to presigned S3 / CDN media edge' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden access to receipt' })
  async getReceiptPdf(
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Query('download') download: boolean,
    @Query('redirect') redirect: string,
    @Query('stream') stream: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generateReceiptPdf(paymentId, currentUser);
    this.deliverPdfResponse(res, result, 'receipt', paymentId, download, redirect, stream);
  }

  @Get('voucher/:auctionId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Generate and stream bilingual prize payout voucher PDF',
    description:
      'Generates bilingual (English + தமிழ்) prize disbursement voucher with safety proof checklist stamps and dual-control signatures.',
  })
  @ApiQuery({
    name: 'download',
    required: false,
    type: Boolean,
    description: 'Return presigned URL JSON instead of streaming PDF binary',
  })
  @ApiQuery({
    name: 'redirect',
    required: false,
    type: Boolean,
    description: 'Redirect directly to presigned S3/CDN URL (HTTP 302)',
  })
  @ApiQuery({
    name: 'stream',
    required: false,
    type: Boolean,
    description: 'Stream raw PDF binary buffer directly from origin API server',
  })
  @ApiResponse({
    status: 200,
    description: 'Payout voucher PDF stream or presigned URL JSON',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
          description: 'A5 landscape prize disbursement voucher PDF binary stream',
        },
      },
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            key: { type: 'string', example: 'vouchers/PRD/2026/KC-VOU-PRD-2026-KCA-1L-20M-01-00004.pdf' },
            presignedUrl: { type: 'string', example: 'https://storage.kumaranfinance.in/vouchers/...?sig=...' },
            expiresInSeconds: { type: 'number', example: 900 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 302, description: 'Redirected to presigned S3 / CDN media edge' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden access to voucher' })
  async getVoucherPdf(
    @Param('auctionId', new ParseUUIDPipe()) auctionId: string,
    @Query('download') download: boolean,
    @Query('redirect') redirect: string,
    @Query('stream') stream: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generatePayoutVoucherPdf(auctionId, currentUser);
    this.deliverPdfResponse(res, result, 'voucher', auctionId, download, redirect, stream);
  }

  @Get('minutes/:auctionId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Generate and stream Form XVII statutory auction minutes PDF',
    description:
      'Generates statutory Form XVII auction minutes with financial breakdown, tie-break paper token table, and Foreman declaration.',
  })
  @ApiQuery({
    name: 'download',
    required: false,
    type: Boolean,
    description: 'Return presigned URL JSON instead of streaming PDF binary',
  })
  @ApiQuery({
    name: 'redirect',
    required: false,
    type: Boolean,
    description: 'Redirect directly to presigned S3/CDN URL (HTTP 302)',
  })
  @ApiQuery({
    name: 'stream',
    required: false,
    type: Boolean,
    description: 'Stream raw PDF binary buffer directly from origin API server',
  })
  @ApiResponse({
    status: 200,
    description: 'Auction minutes PDF stream or presigned URL JSON',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
          description: 'Statutory Form XVII auction minutes PDF binary stream',
        },
      },
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            key: { type: 'string', example: 'minutes/group-uuid/month-4.pdf' },
            presignedUrl: { type: 'string', example: 'https://storage.kumaranfinance.in/minutes/...?sig=...' },
            expiresInSeconds: { type: 'number', example: 900 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 302, description: 'Redirected to presigned S3 / CDN media edge' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden access to auction minutes' })
  async getMinutesPdf(
    @Param('auctionId', new ParseUUIDPipe()) auctionId: string,
    @Query('download') download: boolean,
    @Query('redirect') redirect: string,
    @Query('stream') stream: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generateAuctionMinutesPdf(auctionId, currentUser);
    this.deliverPdfResponse(res, result, 'form-xvii-minutes', auctionId, download, redirect, stream);
  }

  @Get('passbook/:ticketId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Generate and stream Form XXI continuous 20-month passbook statement PDF',
    description:
      'Generates Form XXI continuous subscriber passbook statement with monthly dues schedule, dividend deductions, paid amounts, and arrears.',
  })
  @ApiQuery({
    name: 'download',
    required: false,
    type: Boolean,
    description: 'Return presigned URL JSON instead of streaming PDF binary',
  })
  @ApiQuery({
    name: 'redirect',
    required: false,
    type: Boolean,
    description: 'Redirect directly to presigned S3/CDN URL (HTTP 302)',
  })
  @ApiQuery({
    name: 'stream',
    required: false,
    type: Boolean,
    description: 'Stream raw PDF binary buffer directly from origin API server',
  })
  @ApiResponse({
    status: 200,
    description: 'Passbook statement PDF stream or presigned URL JSON',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
          description: 'Continuous subscriber passbook statement PDF binary stream',
        },
      },
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            key: { type: 'string', example: 'passbooks/group-uuid/ticket-7.pdf' },
            presignedUrl: { type: 'string', example: 'https://storage.kumaranfinance.in/passbooks/...?sig=...' },
            expiresInSeconds: { type: 'number', example: 900 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 302, description: 'Redirected to presigned S3 / CDN media edge' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden access to passbook' })
  async getPassbookPdf(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Query('download') download: boolean,
    @Query('redirect') redirect: string,
    @Query('stream') stream: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generatePassbookPdf(ticketId, currentUser);
    this.deliverPdfResponse(res, result, 'form-xxi-passbook', ticketId, download, redirect, stream);
  }

  @Post('async/passbook/:ticketId')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(
    Role.SUPER_ADMIN,
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Enqueue asynchronous Form XXI continuous passbook statement PDF generation (PERF-01)',
    description:
      'Enqueues continuous subscriber passbook statement rendering to BullMQ background queue to prevent blocking the event loop.',
  })
  @ApiResponse({
    status: 202,
    description: 'Passbook PDF generation enqueued successfully',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
        status: { type: 'string', example: 'QUEUED' },
        checkStatusUrl: {
          type: 'string',
          example: '/api/v1/pdf/async/status/f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden access to passbook' })
  async enqueuePassbookPdf(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return await this.pdfService.enqueueAsyncPdfGeneration(
      'PASSBOOK',
      ticketId,
      currentUser,
    );
  }

  @Get('async/status/:jobId')
  @Header('Cache-Control', 'private, no-store')
  @Roles(
    Role.SUPER_ADMIN,
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Check status of an asynchronous PDF generation job (PERF-01)',
    description:
      'Retrieves the current execution status (QUEUED, COMPLETED, FAILED) and presigned download URL when ready.',
  })
  @ApiResponse({
    status: 200,
    description: 'PDF generation status and presigned download URL',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        status: { type: 'string', example: 'COMPLETED' },
        key: { type: 'string' },
        presignedUrl: { type: 'string' },
        expiresInSeconds: { type: 'number', example: 900 },
        completedAt: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Job not found or expired' })
  async getAsyncPdfStatus(@Param('jobId') jobId: string) {
    return await this.pdfService.getAsyncPdfStatus(jobId);
  }

  @Get('statutory/form-i/:chitGroupId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Generate and stream statutory Form I previous sanction application PDF',
    description:
      'Generates statutory Form I previous sanction application with Annexure Statement of 12 Particulars under Section 4(2) and Rule 3 of the Tamil Nadu Chit Funds Rules, 1984.',
  })
  @ApiQuery({ name: 'download', required: false, type: Boolean })
  @ApiQuery({ name: 'redirect', required: false, type: Boolean })
  @ApiQuery({ name: 'stream', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Statutory Form I PDF binary stream or presigned URL JSON' })
  async getFormISanctionPdf(
    @Param('chitGroupId', new ParseUUIDPipe()) chitGroupId: string,
    @Query('download') download: boolean,
    @Query('redirect') redirect: string,
    @Query('stream') stream: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generateFormISanctionPdf(chitGroupId, currentUser);
    this.deliverPdfResponse(res, result, 'form-i-sanction', chitGroupId, download, redirect, stream);
  }

  @Get('statutory/form-ii/:chitGroupId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Generate and stream statutory Form II chit agreement registration application PDF',
    description:
      'Generates statutory Form II chit agreement registration application under Section 7 and Rule 5 of the Tamil Nadu Chit Funds Rules, 1984.',
  })
  @ApiQuery({ name: 'download', required: false, type: Boolean })
  @ApiQuery({ name: 'redirect', required: false, type: Boolean })
  @ApiQuery({ name: 'stream', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Statutory Form II PDF binary stream or presigned URL JSON' })
  async getFormIiRegistrationPdf(
    @Param('chitGroupId', new ParseUUIDPipe()) chitGroupId: string,
    @Query('download') download: boolean,
    @Query('redirect') redirect: string,
    @Query('stream') stream: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generateFormIiRegistrationPdf(chitGroupId, currentUser);
    this.deliverPdfResponse(res, result, 'form-ii-registration', chitGroupId, download, redirect, stream);
  }

  @Get('statutory/form-v/:chitGroupId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Generate and stream statutory Form V 100% subscription declaration PDF',
    description:
      'Generates statutory Form V declaration under Section 9(1) and Rule 10 certifying that 100% of tickets specified in the chit agreement are fully subscribed.',
  })
  @ApiQuery({ name: 'download', required: false, type: Boolean })
  @ApiQuery({ name: 'redirect', required: false, type: Boolean })
  @ApiQuery({ name: 'stream', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Statutory Form V PDF binary stream or presigned URL JSON' })
  async getFormVDeclarationPdf(
    @Param('chitGroupId', new ParseUUIDPipe()) chitGroupId: string,
    @Query('download') download: boolean,
    @Query('redirect') redirect: string,
    @Query('stream') stream: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generateFormVDeclarationPdf(chitGroupId, currentUser);
    this.deliverPdfResponse(res, result, 'form-v-declaration', chitGroupId, download, redirect, stream);
  }

  @Get('statutory/form-vii/:chitGroupId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Generate and stream statutory Form VII chit agreement furnishing certificate PDF',
    description:
      'Generates statutory Form VII certificate under Section 10(2) and Rule 12 certifying that a true copy of the chit agreement was furnished to every subscriber.',
  })
  @ApiQuery({ name: 'download', required: false, type: Boolean })
  @ApiQuery({ name: 'redirect', required: false, type: Boolean })
  @ApiQuery({ name: 'stream', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Statutory Form VII PDF binary stream or presigned URL JSON' })
  async getFormViiCertificatePdf(
    @Param('chitGroupId', new ParseUUIDPipe()) chitGroupId: string,
    @Query('download') download: boolean,
    @Query('redirect') redirect: string,
    @Query('stream') stream: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generateFormViiCertificatePdf(chitGroupId, currentUser);
    this.deliverPdfResponse(res, result, 'form-vii-certificate', chitGroupId, download, redirect, stream);
  }

  @Get('statutory/form-ix/:auctionId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Generate and stream statutory Form IX auction draw notice PDF',
    description:
      'Generates statutory Form IX notice to subscribers of chit draw under Section 16 and Rule 16 of the Tamil Nadu Chit Funds Rules, 1984.',
  })
  @ApiQuery({ name: 'ticketId', required: false, type: String })
  @ApiQuery({ name: 'download', required: false, type: Boolean })
  @ApiQuery({ name: 'redirect', required: false, type: Boolean })
  @ApiQuery({ name: 'stream', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Statutory Form IX PDF binary stream or presigned URL JSON' })
  async getFormIxNoticePdf(
    @Param('auctionId', new ParseUUIDPipe()) auctionId: string,
    @Query('ticketId') ticketId: string,
    @Query('download') download: boolean,
    @Query('redirect') redirect: string,
    @Query('stream') stream: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generateFormIxNoticePdf(auctionId, currentUser, ticketId);
    this.deliverPdfResponse(res, result, 'form-ix-notice', auctionId, download, redirect, stream);
  }
}
