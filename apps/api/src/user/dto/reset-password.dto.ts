import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiPropertyOptional({
    example: 'TempPass@2026',
    description:
      'Custom temporary password. If omitted, the system generates a secure 12-character temporary password.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Temporary password must be at least 8 characters long' })
  temporaryPassword?: string;
}

export class ResetPasswordResponseDto {
  @ApiProperty({ example: true, description: 'Operation success status' })
  success: boolean;

  @ApiProperty({
    example: 'Staff password successfully reset. Active sessions revoked.',
    description: 'Status message',
  })
  message: string;

  @ApiProperty({
    example: 'TempPass@2026',
    description: 'Temporary password assigned to the staff user',
  })
  temporaryPassword: string;
}
