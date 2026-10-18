import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { DisableTotpDto } from './dto/disable-totp.dto';
import { LoginDto } from './dto/login.dto';
import { MpinLoginDto } from './dto/mpin-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SetMpinDto } from './dto/set-mpin.dto';
import { TotpEnableDto } from './dto/totp-enable.dto';
import { TotpVerifyDto } from './dto/totp-verify.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('web/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Office staff credentials login',
    description:
      'Authenticates staff via phone/email and password. Returns JWT tokens or a tempToken if 2FA TOTP is required.',
  })
  @ApiResponse({ status: 200, description: 'Login successful or 2FA challenge issued' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or inactive account' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('web/verify-totp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Microsoft Authenticator TOTP code',
    description: 'Validates 6-digit code against RFC 6238 TOTP secret and issues full JWT tokens.',
  })
  @ApiResponse({ status: 200, description: 'TOTP verified, JWT tokens issued' })
  @ApiResponse({ status: 401, description: 'Invalid or expired code or session' })
  async verifyTotp(@Body() dto: TotpVerifyDto) {
    return this.authService.verifyTotp(dto);
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Rotates 15-minute access token and 7-day refresh token.',
  })
  @ApiResponse({ status: 200, description: 'Tokens rotated successfully' })
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
    description: 'Clears the refresh token hash in database, invalidating the session.',
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@CurrentUser('sub') userId: string) {
    return this.authService.logout(userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Returns profile, roles, and branch details of authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'Profile retrieved' })
  async getProfile(@CurrentUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Post('totp/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Initiate Microsoft Authenticator 2FA setup',
    description: 'Generates RFC 6238 Base32 secret and otpauth URI for QR code scanning.',
  })
  @ApiResponse({ status: 200, description: 'TOTP setup parameters returned' })
  async setupTotp(@CurrentUser('sub') userId: string) {
    return this.authService.setupTotp(userId);
  }

  @Post('totp/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Confirm and enable Microsoft Authenticator 2FA',
    description: 'Verifies the 6-digit code with the generated secret and permanently locks 2FA.',
  })
  @ApiResponse({ status: 200, description: '2FA enabled' })
  @ApiResponse({ status: 400, description: 'Invalid verification code' })
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
  @ApiResponse({ status: 200, description: '2FA disabled' })
  @ApiResponse({ status: 401, description: 'Invalid password' })
  async disableTotp(@CurrentUser('sub') userId: string, @Body() dto: DisableTotpDto) {
    return this.authService.disableTotp(userId, dto);
  }

  @Post('mobile/login-mpin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mobile quick unlock with 6-digit MPIN',
    description: 'Quick biometric/MPIN login for field collection agents on mobile.',
  })
  @ApiResponse({ status: 200, description: 'MPIN verified, tokens issued' })
  @ApiResponse({ status: 401, description: 'Invalid phone or MPIN' })
  async loginMpin(@Body() dto: MpinLoginDto) {
    return this.authService.loginMpin(dto);
  }

  @Post('mobile/set-mpin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Set or change 6-digit MPIN',
    description: 'Configures 6-digit MPIN hash for quick mobile unlock.',
  })
  @ApiResponse({ status: 200, description: 'MPIN saved successfully' })
  async setMpin(@CurrentUser('sub') userId: string, @Body() dto: SetMpinDto) {
    return this.authService.setMpin(userId, dto);
  }
}
