import { ApiProperty } from '@nestjs/swagger';

export class ActionSuccessResponseDto {
  @ApiProperty({
    description: 'Operational status or confirmation message',
    example: 'Action completed successfully',
  })
  message: string;
}
