import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StorageKeyHelper } from './helpers/storage-key.helper';
import { StorageService } from './storage.service';

@ApiTags('Storage & Presigned Files')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('file/:key(*)')
  @ApiOperation({
    summary: 'Stream a stored file securely (Local storage driver fallback)',
    description:
      'Provides authenticated file streaming for locally stored KYC scans, receipts, vouchers, and minutes.',
  })
  @ApiResponse({ status: 200, description: 'File stream returned' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async streamFile(
    @Param('key') key: string,
    @Req() _req: Request,
    @Res() res: Response,
  ) {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(key);
    const result = await this.storageService.getFile(sanitizedKey);

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', result.sizeBytes);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sanitizedKey.split('/').pop() || 'document'}"`,
    );

    res.end(result.buffer);
  }
}
