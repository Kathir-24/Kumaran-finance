import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export enum KycDocumentType {
  AADHAAR_FRONT = 'AADHAAR_FRONT',
  AADHAAR_BACK = 'AADHAAR_BACK',
  PAN = 'PAN',
  PHOTO = 'PHOTO',
  SIGNATURE = 'SIGNATURE',
}

export class UploadCustomerDocumentDto {
  @ApiProperty({
    enum: KycDocumentType,
    example: KycDocumentType.AADHAAR_FRONT,
    description: 'Type of KYC identity or address proof document',
  })
  @IsEnum(KycDocumentType)
  @IsNotEmpty()
  docType: KycDocumentType;
}
