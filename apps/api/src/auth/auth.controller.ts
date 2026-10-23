import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  THROTTLE_AUTH_LIMIT,
  THROTTLE_AUTH_TTL_MS,
  THROTTLE_OTP_LIMIT,
  THROTTLE_OTP_TTL_MS,
} from '../common/constants';
import {
  ApiOkResponseEnvelope,
} from '../common/decorators/api-response-envelope.decorator';
import { ActionSuccessResponseDto } from '../common/dto/action-success.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  AuthTokensResponseDto,
  FcmTokenUpdateResponseDto,
  RequestOtpResponseDto,
  TotpSetupResponseDto,
  TotpStatusResponseDto,
  UserProfileResponseDto,
  VerifyOtpResponseDto,
} from './dto/auth-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DisableTotpDto } from './dto/disable-totp.dto';
import { LoginDto } from './dto/login.dto';
import { MpinLoginDto } from './dto/mpin-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { SetMpinDto } from './dto/set-mpin.dto';
import { TotpEnableDto } from './dto/totp-enable.dto';
import { TotpVerifyDto } from './dto/totp-verify.dto';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('web/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: THROTTLE_AUTH_LIMIT, ttl: THROTTLE_AUTH_TTL_MS } })
  @ApiOperation({
    summary: 'Office staff credentials login',
    description:
      'Authenticates staff via 10-digit Indian mobile number and password. Returns JWT tokens or a tempToken if 2FA TOTP is required.',
  })
  @ApiOkResponseEnvelope(AuthTokensResponseDto, {
    description: 'Login successful (returns JWT tokens) or 2FA challenge issued (returns tempToken)',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials or inactive account' })
  @ApiResponse({ status: 429, description: 'Too many login attempts. Account locked for 15 minutes.' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('web/verify-totp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: THROTTLE_OTP_LIMIT, ttl: THROTTLE_OTP_TTL_MS } })
  @ApiOperation({
    summary: 'Verify Microsoft Authenticator TOTP code',
    description: 'Validates 6-digit code against RFC 6238 TOTP secret and issues full JWT tokens.',
  })
  @ApiOkResponseEnvelope(AuthTokensResponseDto, {
    description: 'TOTP verified, JWT tokens issued',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired code or session' })
  @ApiResponse({ status: 429, description: 'Too many verification attempts' })
  async verifyTotp(@Body() dto: TotpVerifyDto) {
    return this.authService.verifyTotp(dto);
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Rotates 15-minute access token and 7-day refresh token.',
  })
  @ApiOkResponseEnvelope(AuthTokensResponseDto, {
    description: 'Tokens rotated successfully',
  })
  @ApiResponse({ status: 401, description: 'Invalid or revoked refresh token' })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Revoke active session',
    description: 'Clears the refresh token hash and device FCM push token in database, invalidating the session.',
  })
  @ApiOkResponseEnvelope(ActionSuccessResponseDto, {
    description: 'Logged out successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid Bearer token' })
  async logout(@CurrentUser('sub') userId: string) {
    return this.authService.logout(userId);
  }

  @Patch('fcm-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Register or clear user device FCM push token',
    description:
      'Updates the Firebase Cloud Messaging push token for the authenticated user for real-time mobile push notifications and instant Maker-Checker approvals. Pass null/empty to deregister.',
  })
  @ApiOkResponseEnvelope(FcmTokenUpdateResponseDto, {
    description: 'Device FCM token updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid Bearer token' })
  async updateFcmToken(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateFcmTokenDto,
  ) {
    return this.authService.updateFcmToken(userId, dto.fcmToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Returns profile, roles, and branch details of authenticated user or customer.',
  })
  @ApiOkResponseEnvelope(UserProfileResponseDto, {
    description: 'Profile retrieved',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid Bearer token' })
  async getProfile(@CurrentUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Self-service password update for staff user',
    description:
      'Allows authenticated office staff to change their web portal password by verifying their current password. Revokes active refresh token sessions.',
  })
  @ApiOkResponseEnvelope(ActionSuccessResponseDto, {
    description: 'Password changed successfully',
  })
  @ApiResponse({ status: 400, description: 'New password too short or invalid' })
  @ApiResponse({ status: 401, description: 'Incorrect current password or missing Bearer token' })
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  @Post('totp/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Initiate Microsoft Authenticator 2FA setup',
    description: 'Generates RFC 6238 Base32 secret and otpauth URI for QR code scanning.',
  })
  @ApiOkResponseEnvelope(TotpSetupResponseDto, {
    description: 'TOTP setup parameters returned',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid Bearer token' })
  async setupTotp(@CurrentUser('sub') userId: string) {
    return this.authService.setupTotp(userId);
  }

  @Post('totp/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Throttle({ default: { limit: THROTTLE_OTP_LIMIT, ttl: THROTTLE_OTP_TTL_MS } })
  @ApiOperation({
    summary: 'Confirm and enable Microsoft Authenticator 2FA',
    description: 'Verifies the 6-digit code with the generated secret and permanently locks 2FA.',
  })
  @ApiOkResponseEnvelope(TotpStatusResponseDto, {
    description: '2FA enabled',
  })
  @ApiResponse({ status: 400, description: 'Invalid verification code' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid Bearer token' })
  @ApiResponse({ status: 429, description: 'Too many verification attempts' })
  async enableTotp(@CurrentUser('sub') userId: string, @Body() dto: TotpEnableDto) {
    return this.authService.enableTotp(userId, dto);
  }

  @Post('totp/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Disable 2FA',
    description: 'Requires current password to disable two-factor authentication.',
  })
  @ApiOkResponseEnvelope(TotpStatusResponseDto, {
    description: '2FA disabled',
  })
  @ApiResponse({ status: 401, description: 'Invalid password or unauthorized' })
  async disableTotp(@CurrentUser('sub') userId: string, @Body() dto: DisableTotpDto) {
    return this.authService.disableTotp(userId, dto);
  }

  @Post('mobile/request-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: THROTTLE_OTP_LIMIT, ttl: THROTTLE_OTP_TTL_MS } })
  @ApiOperation({
    summary: 'Request 6-digit SMS OTP for mobile device registration or login',
    description:
      'Dispatches a TRAI DLT-compliant SMS OTP (Template ID 1407169823412093847) to registered phone number for field agents, partners, or customers.',
  })
  @ApiOkResponseEnvelope(RequestOtpResponseDto, {
    description: 'SMS OTP dispatched successfully',
  })
  @ApiResponse({ status: 404, description: 'Phone number not registered' })
  @ApiResponse({ status: 429, description: 'Too many OTP requests. Please wait 5 minutes.' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Post('mobile/verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: THROTTLE_OTP_LIMIT, ttl: THROTTLE_OTP_TTL_MS } })
  @ApiOperation({
    summary: 'Verify 6-digit SMS OTP for mobile device registration or login',
    description:
      'Validates 6-digit SMS OTP. For subscribers, returns full JWT tokens. For staff, returns an mpin_setup token if first-time setup or full tokens if MPIN is already configured.',
  })
  @ApiOkResponseEnvelope(VerifyOtpResponseDto, {
    description: 'OTP verified successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 429, description: 'Too many verification attempts' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('mobile/login-mpin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: THROTTLE_AUTH_LIMIT, ttl: THROTTLE_AUTH_TTL_MS } })
  @ApiOperation({
    summary: 'Mobile quick unlock with 6-digit MPIN',
    description: 'Quick biometric/MPIN login for field collection agents on mobile.',
  })
  @ApiOkResponseEnvelope(AuthTokensResponseDto, {
    description: 'MPIN verified, tokens issued',
  })
  @ApiResponse({ status: 401, description: 'Invalid phone or MPIN' })
  @ApiResponse({ status: 429, description: 'Too many MPIN attempts. Account locked for 15 minutes.' })
  async loginMpin(@Body() dto: MpinLoginDto) {
    return this.authService.loginMpin(dto);
  }

  @Post('mobile/set-mpin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set or change 6-digit MPIN for mobile quick unlock',
    description:
      'Configures 6-digit MPIN for quick mobile unlock. Accepts setupToken from verify-otp during onboarding, or an active Bearer JWT when changing MPIN in account settings.',
  })
  @ApiOkResponseEnvelope(ActionSuccessResponseDto, {
    description: 'MPIN saved successfully or full auth tokens issued',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid setup token / Bearer token' })
  async setMpin(
    @Body() dto: SetMpinDto,
    @Headers('authorization') authHeader?: string,
  ) {
    let userId: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      try {
        const payload = this.authService.verifyToken(token);
        userId = payload.sub;
      } catch {
        // Fall back to dto.setupToken
      }
    }
    return this.authService.setMpin(userId, dto);
  }
}

