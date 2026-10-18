import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReleasePayoutDto {
  @ApiProperty({
    example: 'IOB-CHQ-009182',
    description:
      'Official transaction reference: Cheque number, Bank UTR (NEFT/RTGS/IMPS), or Cash voucher number',
  })
  @IsNotEmpty({ message: 'Payment reference is mandatory for prize payout release' })
  @IsString()
  paymentReference: string;

  @ApiPropertyOptional({
    example: '2026-10-18T11:30:00.000Z',
    description: 'Actual release timestamp (defaults to current date and time)',
  })
  @IsOptional()
  @IsDateString()
  disbursedAt?: string;

  @ApiPropertyOptional({
    example: 'Handed over Account Payee Cheque #009182 to subscriber in person at branch counter',
    description: 'Cashier or accountant payout release notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
