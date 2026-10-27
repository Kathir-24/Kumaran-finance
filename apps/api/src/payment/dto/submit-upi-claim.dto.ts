import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class SubmitUpiClaimDto {
  @ApiProperty({
    example: '6cb8a9e8-e371-42c8-bf3e-c3b72216bfb8',
    description: 'UUID of the installment due being claimed',
  })
  @IsNotEmpty({ message: 'Due ID is required' })
  @IsString()
  dueId: string;

  @ApiProperty({
    example: '429188123456',
    description: 'Bank UTR / Transaction Reference Number from UPI App (GPay/PhonePe/Paytm/BHIM)',
  })
  @IsNotEmpty({ message: 'UTR / Transaction Reference number is required' })
  @IsString()
  @Length(6, 35, { message: 'UTR number must be between 6 and 35 characters' })
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'UTR must contain only alphanumeric characters, dashes, or underscores',
  })
  utrNumber: string;

  @ApiPropertyOptional({
    example: 'Paid via GPay to KVB account',
    description: 'Optional remarks or UPI handle note',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class VerifyUpiClaimDto {
  @ApiPropertyOptional({
    example: 'Verified in KVB NetBanking at 15:30',
    description: 'Optional staff verification notes',
  })
  @IsOptional()
  @IsString()
  verificationNotes?: string;
}
