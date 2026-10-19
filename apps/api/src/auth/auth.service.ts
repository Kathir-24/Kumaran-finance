import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { PrismaService } from '../prisma/prisma.service';
import {
  BCRYPT_SALT_ROUNDS,
  DEFAULT_JWT_ACCESS_EXPIRES_IN,
  DEFAULT_JWT_REFRESH_EXPIRES_IN,
  TOTP_ISSUER_NAME,
} from '../common/constants';
import { DisableTotpDto } from './dto/disable-totp.dto';
import { LoginDto } from './dto/login.dto';
import { MpinLoginDto } from './dto/mpin-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SetMpinDto } from './dto/set-mpin.dto';
import { TotpEnableDto } from './dto/totp-enable.dto';
import { TotpVerifyDto } from './dto/totp-verify.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export interface SanitizedUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  roles: string[];
  branchId: string | null;
  isTotpEnabled: boolean;
  hasMpin: boolean;
  lastLoginAt: Date | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Sanitizes user object to exclude confidential hashes
   */
  sanitizeUser(user: User): SanitizedUser {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      roles: user.roles,
      branchId: user.branchId,
      isTotpEnabled: user.isTotpEnabled,
      hasMpin: !!user.mpinHash,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /**
   * Authenticates staff using username/email/phone + password.
   * If TOTP 2FA is active, returns a short-lived tempToken for 2FA step.
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ phone: dto.identifier }, { email: dto.identifier }],
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials or inactive account');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials or inactive account');
    }

    // Step 2: Check if TOTP 2FA is required for this staff member
    if (user.isTotpEnabled && user.totpSecret) {
      const tempPayload: JwtPayload = {
        sub: user.id,
        phone: user.phone,
        email: user.email,
        roles: user.roles,
        branchId: user.branchId,
        tokenType: 'totp_pending',
      };

      const tempToken = this.jwtService.sign(tempPayload, { expiresIn: '5m' });
      return {
        requireTotp: true,
        tempToken,
        message: 'Two-factor authentication required. Please enter code from Microsoft Authenticator.',
      };
    }

    // Direct login without TOTP
    return this.generateAuthTokens(user);
  }

  /**
   * Verifies 6-digit rotating code from Microsoft Authenticator (RFC 6238)
   */
  async verifyTotp(dto: TotpVerifyDto) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(dto.tempToken);
    } catch {
      throw new UnauthorizedException('Temporary 2FA session expired or invalid');
    }

    if (payload.tokenType !== 'totp_pending') {
      throw new UnauthorizedException('Invalid token type for TOTP verification');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive || !user.totpSecret || !user.isTotpEnabled) {
      throw new UnauthorizedException('User account invalid or 2FA not configured');
    }

    const result = verifySync({
      token: dto.totpCode,
      secret: user.totpSecret,
    });

    if (!result.valid) {
      throw new UnauthorizedException('Invalid or expired 6-digit TOTP code');
    }

    return this.generateAuthTokens(user);
  }

  /**
   * Quick unlock using 6-digit MPIN for field collection agents
   */
  async loginMpin(dto: MpinLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (!user || !user.isActive || !user.mpinHash) {
      throw new UnauthorizedException('Invalid phone or MPIN not configured');
    }

    const isMpinValid = await bcrypt.compare(dto.mpin, user.mpinHash);
    if (!isMpinValid) {
      throw new UnauthorizedException('Invalid phone or MPIN');
    }

    return this.generateAuthTokens(user);
  }

  /**
   * Generates a new Base32 secret and otpauth URI for Microsoft Authenticator QR code
   */
  async setupTotp(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = generateSecret();
    const otpauthUri = generateURI({
      issuer: TOTP_ISSUER_NAME,
      label: user.phone,
      secret,
    });

    return {
      secret,
      otpauthUri,
      issuer: TOTP_ISSUER_NAME,
      account: user.phone,
      instructions:
        'Scan this URI or enter the secret key into Microsoft Authenticator, then call /auth/totp/enable with the 6-digit code.',
    };
  }

  /**
   * Verifies the 6-digit code and activates TOTP for the user account
   */
  async enableTotp(userId: string, dto: TotpEnableDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const result = verifySync({
      token: dto.code,
      secret: dto.secret,
    });

    if (!result.valid) {
      throw new BadRequestException(
        'Invalid verification code. Please check Microsoft Authenticator and try again.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: dto.secret,
        isTotpEnabled: true,
      },
    });

    return {
      success: true,
      message: 'Two-factor authentication (TOTP) successfully enabled for your account.',
    };
  }

  /**
   * Disables TOTP 2FA after verifying the user's password
   */
  async disableTotp(userId: string, dto: DisableTotpDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password. 2FA cannot be disabled.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: null,
        isTotpEnabled: false,
      },
    });

    return {
      success: true,
      message: 'Two-factor authentication has been disabled.',
    };
  }

  /**
   * Sets or updates 6-digit MPIN for mobile quick unlock
   */
  async setMpin(userId: string, dto: SetMpinDto) {
    const mpinHash = await bcrypt.hash(dto.mpin, BCRYPT_SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { mpinHash },
    });

    return {
      success: true,
      message: '6-digit MPIN updated successfully.',
    };
  }

  /**
   * Rotates access and refresh tokens
   */
  async refreshToken(dto: RefreshTokenDto) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(dto.refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid token type for refresh operation');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Session revoked or user account inactive');
    }

    const isMatch = await bcrypt.compare(dto.refreshToken, user.refreshTokenHash);
    if (!isMatch) {
      throw new UnauthorizedException('Refresh token revoked or invalid');
    }

    return this.generateAuthTokens(user);
  }

  /**
   * Invalidates active session by clearing stored refresh token hash
   */
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    return {
      success: true,
      message: 'Logged out successfully.',
    };
  }

  /**
   * Retrieves profile of currently authenticated user
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return {
      ...this.sanitizeUser(user),
      branch: user.branch
        ? {
            id: user.branch.id,
            code: user.branch.code,
            name: user.branch.name,
            nameTamil: user.branch.nameTamil,
          }
        : null,
    };
  }

  /**
   * Helper to sign JWT access & refresh tokens and update DB state
   */
  private async generateAuthTokens(user: User) {
    const accessPayload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      email: user.email,
      roles: user.roles,
      branchId: user.branchId,
      tokenType: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      email: user.email,
      roles: user.roles,
      branchId: user.branchId,
      tokenType: 'refresh',
    };

    const jwtExpiresIn = (this.configService.get<string>('JWT_EXPIRES_IN') ??
      DEFAULT_JWT_ACCESS_EXPIRES_IN) as any;
    const refreshExpiresIn = (this.configService.get<string>(
      'REFRESH_TOKEN_EXPIRES_IN',
    ) ?? DEFAULT_JWT_REFRESH_EXPIRES_IN) as any;

    const accessToken = this.jwtService.sign(accessPayload, { expiresIn: jwtExpiresIn });
    const refreshToken = this.jwtService.sign(refreshPayload, { expiresIn: refreshExpiresIn });

    const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash,
        lastLoginAt: new Date(),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
    };
  }
}
