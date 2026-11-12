import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ALLOWED_DIRECT_UPLOAD_MIME_TYPES,
  MAX_DIRECT_UPLOAD_SIZE_BYTES,
} from '../../common/constants';
import { KycDocumentType } from './upload-customer-document.dto';

export class ConfirmCustomerDocumentDto {
  @ApiProperty({
    example: 'kyc/cust-uuid-001/AADHAAR_FRONT-a1b2c3d4.jpg',
    description: 'Private storage object key issued by /api/v1/storage/presigned-upload-url',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  key!: string;

  @ApiProperty({
    enum: KycDocumentType,
    example: KycDocumentType.AADHAAR_FRONT,
    description: 'Type of KYC identity or address proof document',
  })
  @IsEnum(KycDocumentType)
  @IsNotEmpty()
  docType!: KycDocumentType;

  @ApiProperty({
    example: 'aadhaar_front.jpg',
    description: 'File name of the uploaded scan',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({
    example: 'image/jpeg',
    enum: ALLOWED_DIRECT_UPLOAD_MIME_TYPES,
    description: 'Verified MIME type uploaded directly to object storage',
  })
  @IsString()
  @IsIn(ALLOWED_DIRECT_UPLOAD_MIME_TYPES)
  mimeType!: string;

  @ApiProperty({
    example: 425120,
    minimum: 1,
    maximum: MAX_DIRECT_UPLOAD_SIZE_BYTES,
    description: 'Uploaded file byte length (1 byte to 10 MB)',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_DIRECT_UPLOAD_SIZE_BYTES)
  sizeBytes!: number;
}
