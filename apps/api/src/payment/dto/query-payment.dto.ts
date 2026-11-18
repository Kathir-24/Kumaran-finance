import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryPaymentDto {
  @ApiPropertyOptional({
    example: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
    description: 'Filter by subscriber ticket ID',
  })
  @IsOptional()
  @IsString()
  ticketId?: string;

  @ApiPropertyOptional({
    example: '0bc6e2ef-669b-4659-be24-74765d7fe997',
    description: 'Filter by customer ID',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    example: 'd9f96b99-3ea5-4191-be71-0cecaad62354',
    description: 'Filter by chit group ID',
  })
  @IsOptional()
  @IsString()
  chitGroupId?: string;

  @ApiPropertyOptional({
    example: 'branch-prd-001',
    description: 'Filter by branch ID (Super Admin & Auditor)',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    description: 'Filter by payment method (CASH, UPI, BANK_TRANSFER, CHEQUE)',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    enum: PaymentStatus,
    description: 'Filter by payment status (INITIATED, SUCCESS, FAILED, REVERSED)',
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    description: 'Filter payments created on or after this ISO date',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-10-31T23:59:59.999Z',
    description: 'Filter payments created on or before this ISO date',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Page number for pagination',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    description: 'Maximum number of items per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
