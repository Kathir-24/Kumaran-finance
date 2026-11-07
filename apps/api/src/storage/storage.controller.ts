// ==============================================================================
// Kumaran Chits — Encrypted Document & Media Storage Controller
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/document-and-storage-architecture.md
// ==============================================================================

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
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
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RequestPresignedUploadDto, UploadPurpose } from './dto/request-presigned-upload.dto';
import { DocumentAccessHelper } from './helpers/document-access.helper';
import { StorageKeyHelper } from './helpers/storage-key.helper';
import { StorageService } from './storage.service';

@ApiTags('Storage & Presigned Files')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('presigned-upload-url')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
  )
  @ApiOperation({
    summary: 'Request a time-limited direct presigned upload URL (S3 PUT)',
    description:
      'Generates a cryptographically signed S3 PUT URL (5-minute expiry) allowing clients to upload directly to object storage, bypassing API server memory buffering.',
  })
  @ApiResponse({ status: 201, description: 'Direct presigned upload URL generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid parameters or missing identifier' })
  @ApiResponse({ status: 403, description: 'Forbidden: Unauthorized document purpose or ownership violation' })
  async requestPresignedUploadUrl(
    @Body() dto: RequestPresignedUploadDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    let key: string;
    const ext = dto.fileName.split('.').pop() || 'jpg';

    if (dto.purpose === UploadPurpose.KYC) {
      if (!dto.customerId) {
        throw new BadRequestException('customerId is required for KYC uploads');
      }
      if (
        currentUser.roles.includes(Role.CUSTOMER) &&
        !currentUser.roles.some((r) => r !== Role.CUSTOMER) &&
        currentUser.sub !== dto.customerId
      ) {
        throw new ForbiddenException(
          'Subscribers are only permitted to upload KYC documents for their own account',
        );
      }
      key = StorageKeyHelper.kycDocument(dto.customerId, dto.docType, ext);
    } else if (dto.purpose === UploadPurpose.SAFETY_PROOF) {
      if (!dto.auctionId) {
        throw new BadRequestException('auctionId is required for safety proof uploads');
      }
      if (
        !currentUser.roles.some((r) =>
          [Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT].includes(r),
        )
      ) {
        throw new ForbiddenException('Only staff can upload auction safety proofs');
      }
      key = StorageKeyHelper.safetyProofDoc(dto.auctionId, dto.fileName);
    } else {
      throw new BadRequestException('Unsupported upload purpose');
    }

    const uploadUrl = await this.storageService.getPresignedUploadUrl(
      key,
      dto.mimeType,
      300,
    );

    return {
      uploadUrl,
      key,
      method: 'PUT',
      expiresInSeconds: 300,
      headers: {
        'Content-Type': dto.mimeType,
      },
    };
  }

  @Get('file/*key')
  @ApiOperation({
    summary: 'Stream or redirect to a stored file securely',
    description:
      'Provides authenticated file streaming for locally stored documents or HTTP 302 redirect to presigned S3/CDN URLs.',
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
    description: 'Stream raw binary buffer directly from origin API server',
  })
  @ApiResponse({
    status: 200,
    description: 'Stored document binary stream returned',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 302, description: 'Redirected to presigned S3 / CDN media edge' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden access to file key' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async streamFile(
    @Param('key') rawKey: string | string[],
    @Query('redirect') redirect: string,
    @Query('stream') stream: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ) {
    const rawKeyStr = Array.isArray(rawKey)
      ? rawKey.join('/')
      : typeof rawKey === 'string'
        ? rawKey
        : '';
    const sanitizedKey = StorageKeyHelper.sanitizeKey(rawKeyStr);
    DocumentAccessHelper.assertStorageKeyAccess(sanitizedKey, currentUser);

    if (
      String(stream) !== 'true' &&
      (String(redirect) === 'true' || this.storageService.getActiveDriverName() === 's3')
    ) {
      const presignedUrl = await this.storageService.getPresignedUrl(sanitizedKey);
      res.redirect(presignedUrl);
      return;
    }

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
