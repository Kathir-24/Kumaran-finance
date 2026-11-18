import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * ADR-15 (Guardrail 9): Flexible company safety proof instruments.
 * Property documents / property deeds / mortgages are strictly eliminated.
 */
export const ALLOWED_SAFETY_PROOF_TYPES = [
  'BLANK_CHEQUE',
  'SIGNED_AGREEMENT',
  'PROMISSORY_NOTE',
  'PERSONAL_GUARANTEE',
  'OTHER',
  'NONE',
] as const;

export type SafetyProofType = (typeof ALLOWED_SAFETY_PROOF_TYPES)[number];

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
    enum: ALLOWED_SAFETY_PROOF_TYPES,
    description:
      'Type of security instrument submitted (ADR-15: BLANK_CHEQUE, SIGNED_AGREEMENT, PROMISSORY_NOTE, PERSONAL_GUARANTEE, OTHER, NONE; property documents prohibited)',
  })
  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_SAFETY_PROOF_TYPES, {
    message:
      'Invalid securityType: property documents and deeds are eliminated under ADR-15. Allowed values: BLANK_CHEQUE, SIGNED_AGREEMENT, PROMISSORY_NOTE, PERSONAL_GUARANTEE, OTHER, NONE',
  })
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
    example: 'safety-proof/auction-uuid-001/a1b2c3d4-winner-ticket-07-cheques.pdf',
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
