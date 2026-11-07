import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifySafetyProofDto {
  @ApiProperty({
    example: true,
    description:
      'Whether company safety proof / collateral is requested for this auction winner (ADR-15: not mandatory across the board, evaluated on-demand)',
  })
  @IsNotEmpty({ message: 'isSecurityRequired flag is mandatory' })
  @IsBoolean()
  isSecurityRequired: boolean;

  @ApiPropertyOptional({
    example: 'BLANK_CHEQUE',
    description:
      'Type of security instrument submitted (e.g., BLANK_CHEQUE, SIGNED_AGREEMENT, PROMISSORY_NOTE, OTHER)',
  })
  @IsOptional()
  @IsString()
  securityType?: string;

  @ApiPropertyOptional({
    example: 'State Bank of India, Cheque #004512 & #004513, A/C: S. Sundaram',
    description:
      'Details of signed blank cheque(s) submitted: bank name, cheque numbers, and account holder',
  })
  @IsOptional()
  @IsString()
  blankChequeDetails?: string;

  @ApiProperty({
    example: true,
    description: 'Whether the chit agreement has been signed by the auction winner',
  })
  @IsNotEmpty({ message: 'agreementSigned flag is required' })
  @IsBoolean()
  agreementSigned: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether the nominee has signed the agreement / guarantee',
  })
  @IsNotEmpty({ message: 'nomineeSigned flag is required' })
  @IsBoolean()
  nomineeSigned: boolean;

  @ApiPropertyOptional({
    example: 'kyc/payouts/KCA-1L-20M-01/winner-ticket-07-cheques.pdf',
    description: 'Private S3 storage key of scanned uploaded security papers / blank cheques',
  })
  @IsOptional()
  @IsString()
  securityDocS3Key?: string;

  @ApiPropertyOptional({
    example: 'Verified customer documents and signed blank cheques in office counter',
    description: 'Maker verification remarks and observations',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
