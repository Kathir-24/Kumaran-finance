import {
  Controller,
  Get,
  Param,
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
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PdfService } from './pdf.service';

@ApiTags('Bilingual PDF Documents')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

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
    summary: 'Generate and stream bilingual 80mm subscription receipt PDF',
    description:
      'Generates pixel-accurate 80mm bilingual (English + தமிழ்) thermal subscription receipt slip and saves to private storage.',
  })
  @ApiQuery({ name: 'download', required: false, type: Boolean, description: 'Return presigned URL JSON instead of streaming PDF' })
  @ApiResponse({ status: 200, description: 'PDF stream or presigned URL returned' })
  @ApiResponse({ status: 403, description: 'Forbidden access to receipt' })
  async getReceiptPdf(
    @Param('paymentId') paymentId: string,
    @Query('download') download: boolean,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generateReceiptPdf(paymentId, currentUser);

    if (String(download) === 'true') {
      return res.json({
        key: result.key,
        presignedUrl: result.presignedUrl,
        expiresInSeconds: 900,
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="receipt-${paymentId}.pdf"`,
    );
    res.end(result.buffer);
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
  @ApiQuery({ name: 'download', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Voucher PDF stream or presigned URL returned' })
  @ApiResponse({ status: 403, description: 'Forbidden access to voucher' })
  async getVoucherPdf(
    @Param('auctionId') auctionId: string,
    @Query('download') download: boolean,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generatePayoutVoucherPdf(auctionId, currentUser);

    if (String(download) === 'true') {
      return res.json({
        key: result.key,
        presignedUrl: result.presignedUrl,
        expiresInSeconds: 900,
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="voucher-${auctionId}.pdf"`,
    );
    res.end(result.buffer);
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
  @ApiQuery({ name: 'download', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Auction minutes PDF returned' })
  @ApiResponse({ status: 403, description: 'Forbidden access to auction minutes' })
  async getMinutesPdf(
    @Param('auctionId') auctionId: string,
    @Query('download') download: boolean,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generateAuctionMinutesPdf(auctionId, currentUser);

    if (String(download) === 'true') {
      return res.json({
        key: result.key,
        presignedUrl: result.presignedUrl,
        expiresInSeconds: 900,
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="form-xvii-minutes-${auctionId}.pdf"`,
    );
    res.end(result.buffer);
  }

  @Get('passbook/:ticketId')
  @Roles(
    Role.SUPER_ADMIN,
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
  @ApiQuery({ name: 'download', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Passbook PDF returned' })
  @ApiResponse({ status: 403, description: 'Forbidden access to passbook' })
  async getPassbookPdf(
    @Param('ticketId') ticketId: string,
    @Query('download') download: boolean,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const result = await this.pdfService.generatePassbookPdf(ticketId, currentUser);

    if (String(download) === 'true') {
      return res.json({
        key: result.key,
        presignedUrl: result.presignedUrl,
        expiresInSeconds: 900,
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="form-xxi-passbook-${ticketId}.pdf"`,
    );
    res.end(result.buffer);
  }
}

