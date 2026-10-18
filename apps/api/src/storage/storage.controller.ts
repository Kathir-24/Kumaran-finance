import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DocumentAccessHelper } from './helpers/document-access.helper';
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
  @ApiResponse({ status: 403, description: 'Forbidden access to file key' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async streamFile(
    @Param('key') key: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(key);
    DocumentAccessHelper.assertStorageKeyAccess(sanitizedKey, currentUser);

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

