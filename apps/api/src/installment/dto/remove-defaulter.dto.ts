import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RemoveDefaulterDto {
  @ApiProperty({
    example:
      'Subscriber has defaulted on 3 consecutive monthly installments (Months 4, 5, 6) despite repeated formal notices. Company removal rights exercised per ADR-07 and ADR-12.',
    description:
      'Documented reason and justification for exercising company 3-month default removal rights for audit and legal compliance',
  })
  @IsNotEmpty({ message: 'Defaulter removal reason is required' })
  @IsString()
  @MinLength(10, { message: 'Removal reason must be at least 10 characters' })
  reason: string;
}
