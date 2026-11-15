import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CompleteOnboardingDto {
  @ApiProperty({
    description: 'Temporary restricted onboarding token issued during first login with temporary password',
  })
  @IsNotEmpty({ message: 'Temporary onboarding token is required' })
  @IsString()
  tempToken: string;

  @ApiProperty({
    example: 'NewSecurePassword#2026',
    description: 'New permanent staff password (min 8 characters)',
  })
  @IsNotEmpty({ message: 'New password is required' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  newPassword: string;
}
