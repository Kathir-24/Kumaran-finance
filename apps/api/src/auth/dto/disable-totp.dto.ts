import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DisableTotpDto {
  @ApiProperty({
    example: 'Admin@Kumaran2026',
    description: 'Current user password to authorize 2FA deactivation',
  })
  @IsNotEmpty({ message: 'Password is required to disable 2FA' })
  @IsString()
  password: string;
}
