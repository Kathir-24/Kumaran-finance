import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({ example: false, description: 'Active status for staff user account' })
  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;
}
