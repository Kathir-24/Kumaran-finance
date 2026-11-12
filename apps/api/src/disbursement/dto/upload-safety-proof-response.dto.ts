import { ApiProperty } from '@nestjs/swagger';

export class UploadSafetyProofResponseDto {
  @ApiProperty({ example: true, description: 'Upload operation status' })
  success: boolean;

  @ApiProperty({
    example: 'Safety proof collateral document uploaded and linked successfully.',
    description: 'Status message',
  })
  message: string;

  @ApiProperty({ example: 'auction-uuid-001', description: 'Associated auction ID' })
  auctionId: string;

  @ApiProperty({
    example: 'safety-proofs/auction-uuid-001/1729729200000_signed_cheque.jpg',
    description: 'Private S3 storage object key',
  })
  securityDocS3Key: string;

  @ApiProperty({ example: 'signed_cheque.jpg', description: 'Original uploaded file name' })
  fileName: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-23T19:00:00.000Z',
    description: 'Timestamp when document was uploaded',
  })
  uploadedAt: Date | string;
}
