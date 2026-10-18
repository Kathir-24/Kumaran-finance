import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class FinalizeAuctionDto {
  @ApiProperty({
    example: 14,
    description: 'Number of attending subscribers physically present at the auction',
  })
  @IsNotEmpty({ message: 'Number of subscribers present is required' })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'At least 1 subscriber must be present' })
  subscribersPresent: number;

  @ApiPropertyOptional({
    example: 'Auction conducted smoothly. Winning ticket #4 drawn under Option A tie-break.',
    description: 'Statutory notes or observations recorded in the auction proceedings',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Signed by Foreman confirmation',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  signedByForeman?: boolean = true;
}
