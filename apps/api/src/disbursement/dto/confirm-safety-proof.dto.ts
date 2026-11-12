import { ApiProperty } from '@nestjs/swagger';
import {
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

export class ConfirmSafetyProofDto {
  @ApiProperty({
    example: 'safety-proof/auc-uuid-001/a1b2c3d4-signed_blank_cheques.jpg',
    description: 'Private storage object key issued by /api/v1/storage/presigned-upload-url',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  key!: string;

  @ApiProperty({
    example: 'signed_blank_cheques.jpg',
    description: 'File name of the uploaded collateral scan',
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
    example: 512000,
    minimum: 1,
    maximum: MAX_DIRECT_UPLOAD_SIZE_BYTES,
    description: 'Uploaded file byte length (1 byte to 10 MB)',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_DIRECT_UPLOAD_SIZE_BYTES)
  sizeBytes!: number;
}
