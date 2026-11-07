// ==============================================================================
// Kumaran Chits — Request Presigned Upload URL DTO
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/document-and-storage-architecture.md
// ==============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export enum UploadPurpose {
  KYC = 'KYC',
  SAFETY_PROOF = 'SAFETY_PROOF',
}

export class RequestPresignedUploadDto {
  @ApiProperty({
    description: 'Purpose of upload',
    enum: UploadPurpose,
    example: UploadPurpose.KYC,
  })
  @IsNotEmpty()
  @IsEnum(UploadPurpose)
  purpose!: UploadPurpose;

  @ApiProperty({
    description: 'Document classification type (e.g., AADHAAR_FRONT, PAN, CHEQUE, PROMISSORY_NOTE)',
    example: 'AADHAAR_FRONT',
  })
  @IsNotEmpty()
  @IsString()
  docType!: string;

  @ApiProperty({
    description: 'Original file name including extension',
    example: 'aadhaar_scan.jpg',
  })
  @IsNotEmpty()
  @IsString()
  fileName!: string;

  @ApiProperty({
    description: 'MIME type of the file to be uploaded',
    example: 'image/jpeg',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^(image\/(jpeg|png|webp)|application\/pdf)$/, {
    message: 'Allowed MIME types are image/jpeg, image/png, image/webp, application/pdf',
  })
  mimeType!: string;

  @ApiPropertyOptional({
    description: 'Customer UUID (mandatory when purpose is KYC)',
    example: 'cust-uuid-001',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Auction UUID (mandatory when purpose is SAFETY_PROOF)',
    example: 'auc-uuid-001',
  })
  @IsOptional()
  @IsString()
  auctionId?: string;
}
