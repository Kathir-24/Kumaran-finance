import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class BranchSummaryDto {
  @ApiProperty({ example: 'branch-prd-001', description: 'Branch unique ID' })
  id: string;

  @ApiProperty({ example: 'PRD', description: 'Branch short code' })
  code: string;

  @ApiProperty({ example: 'Head Office - Perundurai', description: 'Branch name in English' })
  name: string;

  @ApiProperty({ type: String, example: 'தலைமை அலுவலகம் - பெருந்துறை', description: 'Branch name in Tamil', nullable: true })
  nameTamil?: string | null;
}

export class SanitizedUserDto {
  @ApiProperty({ example: 'user-uuid-001', description: 'User unique ID' })
  id: string;

  @ApiProperty({ example: 'K. Sengottaiyan', description: 'Staff full name' })
  name: string;

  @ApiProperty({ example: '9842100001', description: 'Primary mobile number' })
  phone: string;

  @ApiProperty({
    enum: Role,
    isArray: true,
    example: [Role.SUPER_ADMIN],
    description: 'Assigned system roles',
  })
  roles: Role[];

  @ApiProperty({ type: String, example: 'branch-prd-001', description: 'Assigned branch ID', nullable: true })
  branchId?: string | null;

  @ApiProperty({ example: true, description: 'Whether the staff member is a verified business partner', required: false })
  isPartner?: boolean;

  @ApiProperty({ example: false, description: 'Whether Microsoft Authenticator TOTP is enabled' })
  isTotpEnabled: boolean;

  @ApiProperty({ example: true, description: 'Whether 6-digit MPIN is configured' })
  hasMpin: boolean;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-22T07:28:14.000Z', description: 'Last login timestamp', nullable: true })
  lastLoginAt?: Date | string | null;
}

export class UserProfileResponseDto extends SanitizedUserDto {
  @ApiProperty({ type: BranchSummaryDto, nullable: true, description: 'Assigned branch details' })
  branch?: BranchSummaryDto | null;

  @ApiProperty({ type: String, example: 'கே. செங்கோட்டையன்', description: 'Full name in Tamil', nullable: true, required: false })
  fullNameTamil?: string | null;

  @ApiProperty({ example: 'KC-CUST-00042', description: 'Customer unique registration code (for subscribers)', required: false })
  customerCode?: string;

  @ApiProperty({ example: true, description: 'Whether subscriber KYC is verified', required: false })
  isKycVerified?: boolean;
}

export class AuthTokensResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: '15-minute JWT access token',
  })
  accessToken: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: '7-day rotating JWT refresh token',
  })
  refreshToken: string;

  @ApiProperty({ type: SanitizedUserDto, description: 'Authenticated user profile' })
  user: SanitizedUserDto;
}

export class TotpChallengeResponseDto {
  @ApiProperty({ example: true, description: 'Indicates 2FA verification challenge is required' })
  requireTotp: boolean;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: '5-minute temporary token for TOTP verification step',
  })
  tempToken: string;

  @ApiProperty({
    example: 'Two-factor authentication required. Please enter code from Microsoft Authenticator.',
    description: 'User guidance message',
  })
  message: string;
}

export class TotpSetupResponseDto {
  @ApiProperty({ example: 'JBSWY3DPEHPK3PXP', description: 'RFC 6238 Base32 TOTP secret' })
  secret: string;

  @ApiProperty({
    example: 'otpauth://totp/Kumaran%20Chits:9842100001?secret=JBSWY3DPEHPK3PXP&issuer=Kumaran%20Chits',
    description: 'otpauth URI for QR code generation',
  })
  otpauthUri: string;

  @ApiProperty({ example: 'Kumaran Chits', description: 'TOTP issuer name' })
  issuer: string;

  @ApiProperty({ example: '9842100001', description: 'User account identifier (phone)' })
  account: string;

  @ApiProperty({
    example: 'Scan this URI or enter the secret key into Microsoft Authenticator, then call /auth/totp/enable with the 6-digit code.',
    description: 'Client setup instructions',
  })
  instructions: string;
}

export class TotpStatusResponseDto {
  @ApiProperty({ example: true, description: 'Whether the action succeeded' })
  success: boolean;

  @ApiProperty({ example: 'Two-factor authentication (TOTP) successfully enabled for your account.', description: 'Status message' })
  message: string;
}

export class FcmTokenUpdateResponseDto {
  @ApiProperty({ example: true, description: 'Whether the action succeeded' })
  success: boolean;

  @ApiProperty({ example: 'Device FCM token registered successfully.', description: 'Status message' })
  message: string;

  @ApiProperty({ type: String, example: 'fcm-device-token-string', description: 'Registered device push token', nullable: true })
  fcmToken?: string | null;
}

export class RequestOtpResponseDto {
  @ApiProperty({ example: true, description: 'Whether OTP was successfully dispatched' })
  success: boolean;

  @ApiProperty({ example: 'OTP sent successfully to registered mobile number.', description: 'Status message' })
  message: string;

  @ApiProperty({ example: 300, description: 'OTP expiration period in seconds' })
  expiresInSeconds: number;

  @ApiProperty({
    example: '123456',
    description: 'Generated OTP for automated local testing (only returned when NODE_ENV !== production)',
    required: false,
  })
  debugOtp?: string;
}

export class VerifyOtpResponseDto {
  @ApiProperty({ example: true, description: 'Whether OTP verification was successful' })
  verified: boolean;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsIn...',
    description: 'Scoped setup token for configuring MPIN (issued when first-time staff onboarding)',
    required: false,
  })
  setupToken?: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsIn...',
    description: 'Full JWT access token (issued for customers or staff with pre-existing MPIN)',
    required: false,
  })
  accessToken?: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsIn...',
    description: 'Rotating refresh token',
    required: false,
  })
  refreshToken?: string;

  @ApiProperty({
    type: UserProfileResponseDto,
    description: 'Authenticated user or customer profile',
    required: false,
  })
  user?: any;

  @ApiProperty({ example: 'OTP verified successfully.', description: 'Status message' })
  message: string;
}

