import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateKycDto {
  @ApiProperty({
    example: true,
    description: 'Set true to verify customer KYC or false to revoke verification',
  })
  @IsNotEmpty({ message: 'isKycVerified boolean is required' })
  @IsBoolean()
  isKycVerified: boolean;
}
