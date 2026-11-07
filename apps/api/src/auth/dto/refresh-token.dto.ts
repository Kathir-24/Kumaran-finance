import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Cryptographic refresh token issued during login',
  })
  @IsNotEmpty({ message: 'Refresh token is required' })
  @IsString()
  refreshToken: string;

  @ApiPropertyOptional({
    example: 'WEB',
    enum: ['WEB', 'MOBILE', 'DESKTOP'],
    description: 'Client device platform type for concurrent session isolation',
    default: 'WEB',
  })
  @IsOptional()
  @IsString()
  @IsIn(['WEB', 'MOBILE', 'DESKTOP'])
  clientType?: 'WEB' | 'MOBILE' | 'DESKTOP';
}
