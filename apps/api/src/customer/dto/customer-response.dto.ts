import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BranchSummaryDto } from '../../auth/dto/auth-response.dto';

export class NomineeResponseDto {
  @ApiProperty({ example: 'nominee-uuid-001', description: 'Nominee unique ID' })
  id: string;

  @ApiProperty({ example: 'cust-uuid-001', description: 'Linked customer ID' })
  customerId: string;

  @ApiProperty({ example: 'Kavitha S', description: 'Nominee full name in English' })
  name: string;

  @ApiProperty({ type: String, example: 'கவிதா சு', description: 'Nominee full name in Tamil', nullable: true })
  nameTamil?: string | null;

  @ApiProperty({ example: 'SPOUSE', description: 'Relationship with subscriber' })
  relationship: string;

  @ApiProperty({ example: '9443212345', description: 'Nominee contact number' })
  phone: string;

  @ApiProperty({ type: String, example: '1234', description: 'Masked Aadhaar (last 4 digits)', nullable: true })
  aadhaarLast4?: string | null;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-22T07:28:14.000Z', description: 'Creation timestamp' })
  createdAt: Date | string;
}

export class CustomerCountsDto {
  @ApiProperty({ example: 2, description: 'Number of active ticket holdings' })
  tickets: number;

  @ApiProperty({ example: 1, description: 'Number of registered nominees' })
  nominees: number;

  @ApiProperty({ example: 3, description: 'Number of uploaded KYC documents' })
  documents: number;
}

export class CustomerResponseDto {
  @ApiProperty({ example: 'cust-uuid-001', description: 'Customer unique ID' })
  id: string;

  @ApiProperty({ example: 'KC-CUST-00101', description: 'Sequential customer identification code' })
  customerCode: string;

  @ApiProperty({ example: 'Sundaram S', description: 'Full name in English' })
  fullName: string;

  @ApiProperty({ type: String, example: 'சுந்தரம் சு', description: 'Full name in Tamil', nullable: true })
  fullNameTamil?: string | null;

  @ApiProperty({ example: '9842712345', description: 'Primary contact phone' })
  phone: string;

  @ApiProperty({ type: String, example: '9443212345', description: 'Alternate phone number', nullable: true })
  altPhone?: string | null;

  @ApiProperty({ example: '14/2, Gandhi Nagar', description: 'Address line 1' })
  addressLine1: string;

  @ApiProperty({ type: String, example: 'Near Bus Stand', description: 'Address line 2', nullable: true })
  addressLine2?: string | null;

  @ApiProperty({ example: 'Perundurai', description: 'Town or city' })
  city: string;

  @ApiProperty({ example: '638052', description: 'Postal pincode' })
  pincode: string;

  @ApiProperty({ type: String, example: 'ABCDE1234F', description: 'Income Tax PAN', nullable: true })
  panNumber?: string | null;

  @ApiProperty({ type: String, example: '4821', description: 'Masked Aadhaar (last 4 digits)', nullable: true })
  aadhaarLast4?: string | null;

  @ApiProperty({ example: false, description: 'Whether KYC verification is approved' })
  isKycVerified: boolean;

  @ApiPropertyOptional({ example: 1, description: 'Record version for optimistic concurrency control' })
  version?: number;

  @ApiProperty({ type: String, example: 'branch-prd-001', description: 'Branch ID', nullable: true })
  branchId?: string | null;

  @ApiProperty({ type: BranchSummaryDto, nullable: true, description: 'Home branch details' })
  branch?: BranchSummaryDto | null;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-22T07:28:14.000Z', description: 'Registration timestamp' })
  createdAt: Date | string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-22T07:28:14.000Z', description: 'Last updated timestamp' })
  updatedAt: Date | string;
}


export class CustomerListItemDto extends CustomerResponseDto {
  @ApiProperty({ type: CustomerCountsDto, description: 'Associated entity counts' })
  _count?: CustomerCountsDto;
}

export class CustomerDetailResponseDto extends CustomerResponseDto {
  @ApiProperty({ type: [NomineeResponseDto], description: 'List of linked nominees' })
  nominees: NomineeResponseDto[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Subscribed chit tickets and group details',
  })
  tickets: any[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Uploaded KYC and surety documents',
  })
  documents: any[];
}

export class CustomerFcmUpdateResponseDto {
  @ApiProperty({ example: true, description: 'Whether the update succeeded' })
  success: boolean;

  @ApiProperty({ example: 'Customer device FCM token registered successfully.', description: 'Status message' })
  message: string;

  @ApiProperty({ example: 'cust-uuid-001', description: 'Customer ID' })
  customerId: string;

  @ApiProperty({ type: String, example: 'fcm-device-token-string', description: 'Registered device push token', nullable: true })
  fcmToken?: string | null;
}

export class CustomerDocumentResponseDto {
  @ApiProperty({ example: 'doc-uuid-001', description: 'Document unique ID' })
  id: string;

  @ApiProperty({ example: 'cust-uuid-001', description: 'Customer ID' })
  customerId: string;

  @ApiProperty({ example: 'AADHAAR_FRONT', description: 'Document type' })
  docType: string;

  @ApiProperty({ example: 'aadhaar_front.jpg', description: 'Original file name' })
  fileName: string;

  @ApiProperty({ example: false, description: 'Whether staff verified this document' })
  verified: boolean;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-23T10:00:00.000Z', description: 'Upload timestamp' })
  uploadedAt: Date | string;
}

export class DocumentPresignedUrlResponseDto {
  @ApiProperty({
    example: 'https://storage.kumaranfinance.in/kyc/cust-001/AADHAAR_FRONT-xyz.jpg?token=...',
    description: 'Time-limited 15-minute viewing URL',
  })
  url: string;

  @ApiProperty({ example: 900, description: 'URL expiration duration in seconds (15 minutes)' })
  expiresInSeconds: number;
}

