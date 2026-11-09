import { ApiProperty } from '@nestjs/swagger';

export class SafetyProofUrlResponseDto {
  @ApiProperty({
    example: 'https://storage.kumaranfinance.in/safety-proofs/...',
    description: 'Time-limited S3 presigned URL for viewing the safety proof collateral scan',
  })
  url: string;

  @ApiProperty({
    example: 900,
    description: 'URL expiration duration in seconds (15 minutes)',
  })
  expiresInSeconds: number;

  @ApiProperty({
    example: 'safety-proofs/auction-uuid-001/1729729200000_signed_cheque.jpg',
    description: 'Underlying private S3 storage object key',
  })
  securityDocS3Key: string;
}
