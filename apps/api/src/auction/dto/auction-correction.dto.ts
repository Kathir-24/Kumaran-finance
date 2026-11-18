import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';
import {
  MAX_SAFE_WHOLE_RUPEE,
  parseStrictWholeRupeeValue,
} from '../../common/utils/whole-rupee.util';

export class RequestAuctionCorrectionDto {
  @ApiProperty({
    type: 'integer',
    example: 24000,
    description:
      'Corrected winning auction bid discount in whole integer Rupees (must produce an exact whole-Rupee dividend)',
  })
  @IsNotEmpty({ message: 'Corrected bid discount is required' })
  @Transform(({ value }) => parseStrictWholeRupeeValue(value))
  @IsInt({ message: 'Corrected bid discount must be a whole Rupee integer amount (zero paise/decimals)' })
  @IsPositive({ message: 'Corrected bid discount must be a positive whole number' })
  @Max(MAX_SAFE_WHOLE_RUPEE, {
    message: 'Bid discount exceeds maximum safe whole-Rupee integer limit',
  })
  correctedBidDiscount: number;

  @ApiPropertyOptional({
    example: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
    description:
      'UUID of the corrected winning subscriber ticket (optional if winner ticket is unchanged)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Corrected winning ticket ID must be a valid UUID' })
  correctedWinningTicketId?: string;

  @ApiProperty({
    example: 'Tie-break ticket number data entry error corrected per physical branch token register',
    description: 'Mandatory justification reason for the finalized auction correction',
  })
  @IsNotEmpty({ message: 'Correction reason is required' })
  @IsString()
  @MaxLength(500, { message: 'Correction reason cannot exceed 500 characters' })
  reason: string;

  @ApiPropertyOptional({
    example: 'Verified against physical token draw record witnessed by 4 members',
    description: 'Additional administrative remarks or notes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Notes cannot exceed 500 characters' })
  notes?: string;
}

export class ApproveAuctionCorrectionDto {
  @ApiPropertyOptional({
    example: 'Reviewed and confirmed against physical token draw register and bank statements',
    description: 'Checker Partner notes upon approving auction correction',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Notes cannot exceed 500 characters' })
  notes?: string;
}

export class RejectAuctionCorrectionDto {
  @ApiProperty({
    example: 'Correction request rejected after comparing physical token register and member signatures',
    description: 'Mandatory justification reason for rejecting the auction correction request',
  })
  @IsNotEmpty({ message: 'Rejection reason is required' })
  @IsString()
  @MaxLength(500, { message: 'Rejection reason cannot exceed 500 characters' })
  reason: string;

  @ApiPropertyOptional({
    example: 'Verified by Partner B against physical lot draw sheet',
    description: 'Additional administrative remarks or notes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Notes cannot exceed 500 characters' })
  notes?: string;
}
