import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RejectReversalDto {
  @ApiProperty({
    example: 'Bank statement confirmed that cheque cleared successfully on 18-Oct-2026',
    description: 'Mandatory reason for rejecting the reversal request',
  })
  @IsNotEmpty({ message: 'Rejection reason is required' })
  @IsString()
  @MinLength(5, { message: 'Rejection reason must be at least 5 characters' })
  rejectionReason: string;
}
