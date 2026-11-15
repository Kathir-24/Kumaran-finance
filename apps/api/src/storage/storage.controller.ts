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
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  ALLOWED_DIRECT_UPLOAD_MIME_TYPES,
  MAX_DIRECT_UPLOAD_SIZE_BYTES,
  PRESIGNED_UPLOAD_URL_EXPIRES_IN_SECONDS,
  THROTTLE_UPLOAD_LIMIT,
  THROTTLE_UPLOAD_TTL_MS,
} from '../common/constants';
import { SetTimeout } from '../common/decorators/set-timeout.decorator';
import { ApiOkResponseEnvelope } from '../common/decorators/api-response-envelope.decorator';
import {
  LocalUploadResponseDto,
  PresignedUploadResponseDto,
  RequestPresignedUploadDto,
  UploadPurpose,
} from './dto/request-presigned-upload.dto';
import { DocumentAccessHelper } from './helpers/document-access.helper';
import { StorageKeyHelper } from './helpers/storage-key.helper';
import { readBinaryUploadBody } from './helpers/upload-stream.helper';
import { StorageService } from './storage.service';

@ApiTags('Storage & Presigned Files')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('storage')
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

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
  @ApiResponse({
    status: 201,
    description: 'Direct presigned upload URL generated successfully',
    type: PresignedUploadResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid parameters or missing identifier' })
  @ApiResponse({ status: 403, description: 'Forbidden: Unauthorized document purpose or ownership violation' })
  async requestPresignedUploadUrl(
    @Body() dto: RequestPresignedUploadDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<PresignedUploadResponseDto> {
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
          ([Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT] as Role[]).includes(r),
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
      PRESIGNED_UPLOAD_URL_EXPIRES_IN_SECONDS,
    );
    const headers =
      typeof this.storageService.getPresignedUploadHeaders === 'function'
        ? this.storageService.getPresignedUploadHeaders(dto.mimeType)
        : { 'Content-Type': dto.mimeType };

    return {
      uploadUrl,
      key,
      method: 'PUT',
      expiresInSeconds: PRESIGNED_UPLOAD_URL_EXPIRES_IN_SECONDS,
      headers,
    };
  }

  @Put('upload/*key')
  @HttpCode(HttpStatus.OK)
  @SetTimeout(120_000)
  @Throttle({ default: { limit: THROTTLE_UPLOAD_LIMIT, ttl: THROTTLE_UPLOAD_TTL_MS } })
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
  )
  @ApiConsumes('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  @ApiBody({
    schema: {
      type: 'string',
      format: 'binary',
      description: 'Raw file payload (up to 10 MB) for local storage driver PUT target',
    },
  })
  @ApiOperation({
    summary: 'Local-driver fallback PUT target for presigned-upload-url',
    description:
      'Receives raw binary PUT uploads exclusively when STORAGE_DRIVER=local (development/on-prem disk mode). Rejected when cloud S3/R2 driver is active.',
  })
  @ApiOkResponseEnvelope(LocalUploadResponseDto, {
    description: 'Binary payload written to local storage',
  })
  @ApiResponse({ status: 400, description: 'Invalid key, MIME type, empty body, or S3 driver active' })
  @ApiResponse({ status: 403, description: 'Forbidden: Unauthorized upload prefix or BOLA violation' })
  @ApiResponse({ status: 413, description: 'Payload exceeds 10 MB ceiling' })
  async uploadLocalFile(
    @Param('key') rawKey: string | string[],
    @CurrentUser() currentUser: JwtPayload,
    @Req() req: Request,
  ) {
    if (this.storageService.getActiveDriverName() !== 'local') {
      throw new BadRequestException(
        'Direct S3 presigned URL must be used when S3/R2 driver is active',
      );
    }

    const rawKeyStr = Array.isArray(rawKey)
      ? rawKey.join('/')
      : typeof rawKey === 'string'
        ? rawKey
        : '';
    const sanitizedKey = StorageKeyHelper.sanitizeKey(rawKeyStr);
    DocumentAccessHelper.assertStorageUploadAccess(sanitizedKey, currentUser);

    const rawContentType = req.headers['content-type'];
    const mimeType =
      (typeof rawContentType === 'string' ? rawContentType : '')
        .split(';')[0]
        .trim()
        .toLowerCase();

    if (
      !ALLOWED_DIRECT_UPLOAD_MIME_TYPES.includes(
        mimeType as (typeof ALLOWED_DIRECT_UPLOAD_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        `Unsupported Content-Type "${mimeType || 'missing'}". Allowed: ${ALLOWED_DIRECT_UPLOAD_MIME_TYPES.join(', ')}`,
      );
    }

    const buffer = await readBinaryUploadBody(req, MAX_DIRECT_UPLOAD_SIZE_BYTES);
    await this.storageService.uploadFile(sanitizedKey, buffer, mimeType);

    return {
      key: sanitizedKey,
      mimeType,
      sizeBytes: buffer.length,
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
    await DocumentAccessHelper.assertStorageKeyAccess(sanitizedKey, currentUser, this.prisma);

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
