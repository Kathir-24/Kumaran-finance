import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../notification/services/sms.service';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import { decryptAesGcm, encryptAesGcm } from '../common/crypto/aes-gcm.util';
import {
  BCRYPT_SALT_ROUNDS,
  DEFAULT_JWT_ACCESS_EXPIRES_IN,
  DEFAULT_JWT_REFRESH_EXPIRES_IN,
  OTP_EXPIRY_SECONDS,
  OTP_COOLDOWN_SECONDS,
  OTP_LOCKOUT_SECONDS,
  OTP_MAX_VERIFY_ATTEMPTS,
  TOTP_ISSUER_NAME,
} from '../common/constants';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DisableTotpDto } from './dto/disable-totp.dto';
import { LoginDto } from './dto/login.dto';
import { MpinLoginDto } from './dto/mpin-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { SetMpinDto } from './dto/set-mpin.dto';
import { TotpEnableDto } from './dto/totp-enable.dto';
import { TotpVerifyDto } from './dto/totp-verify.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export interface SanitizedUser {
  id: string;
  name: string;
  phone: string;
  roles: string[];
  branchId: string | null;
  isTotpEnabled: boolean;
  hasMpin: boolean;
  lastLoginAt: Date | null;
}

export interface OtpSessionRecord {
  hashedOtp: string;
  expiresAt: number;
  attempts: number;
  entityId: string;
  name: string;
  roles: Role[];
  branchId: string | null;
  phone: string;
  isCustomer: boolean;
}

@Injectable()
export class AuthService {
  private readonly otpStore = new Map<string, OtpSessionRecord>();
  private readonly cooldownStore = new Map<string, number>();
  private readonly lockoutStore = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {}

  /**
   * Sanitizes user object to exclude confidential hashes
   */
  sanitizeUser(user: User): SanitizedUser {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      roles: user.roles,
      branchId: user.branchId,
      isTotpEnabled: user.isTotpEnabled,
      hasMpin: !!user.mpinHash,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /**
   * Authenticates staff using 10-digit mobile phone number + password.
   * If TOTP 2FA is active, returns a short-lived tempToken for 2FA step.
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        phone: dto.phone,
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

    const secret = decryptAesGcm(
      user.totpSecret,
      this.configService.get<string>('JWT_SECRET') || 'default-jwt-secret-key-32-chars-min',
    );

    const result = verifySync({
      token: dto.totpCode,
      secret,
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

    const encryptedSecret = encryptAesGcm(
      dto.secret,
      this.configService.get<string>('JWT_SECRET') || 'default-jwt-secret-key-32-chars-min',
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: encryptedSecret,
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
   * Checks if mobile number is locked out due to repeated invalid attempts
   */
  async checkOtpLockout(phone: string): Promise<{ locked: boolean; remainingSeconds: number }> {
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());

    if (useRedis && redis) {
      const ttl = await redis.ttl(`auth:otp:lockout:${phone}`);
      if (ttl > 0) {
        return { locked: true, remainingSeconds: ttl };
      }
      return { locked: false, remainingSeconds: 0 };
    }

    const expiresAt = this.lockoutStore.get(phone);
    if (expiresAt && Date.now() < expiresAt) {
      const remainingSeconds = Math.ceil((expiresAt - Date.now()) / 1000);
      return { locked: true, remainingSeconds };
    }
    if (expiresAt) {
      this.lockoutStore.delete(phone);
    }
    return { locked: false, remainingSeconds: 0 };
  }

  /**
   * Checks if mobile number is in request cooldown (60s)
   */
  async checkOtpCooldown(phone: string): Promise<{ active: boolean; remainingSeconds: number }> {
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());

    if (useRedis && redis) {
      const ttl = await redis.ttl(`auth:otp:cooldown:${phone}`);
      if (ttl > 0) {
        return { active: true, remainingSeconds: ttl };
      }
      return { active: false, remainingSeconds: 0 };
    }

    const expiresAt = this.cooldownStore.get(phone);
    if (expiresAt && Date.now() < expiresAt) {
      const remainingSeconds = Math.ceil((expiresAt - Date.now()) / 1000);
      return { active: true, remainingSeconds };
    }
    if (expiresAt) {
      this.cooldownStore.delete(phone);
    }
    return { active: false, remainingSeconds: 0 };
  }

  /**
   * Sets OTP request cooldown (60 seconds)
   */
  async setOtpCooldown(phone: string, ttlSeconds: number = OTP_COOLDOWN_SECONDS): Promise<void> {
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());

    if (useRedis && redis) {
      await redis.set(`auth:otp:cooldown:${phone}`, String(Date.now()), 'EX', ttlSeconds);
    } else {
      this.cooldownStore.set(phone, Date.now() + ttlSeconds * 1000);
    }
  }

  /**
   * Sets brute-force lockout (300 seconds / 5 minutes)
   */
  async setOtpLockout(phone: string, ttlSeconds: number = OTP_LOCKOUT_SECONDS): Promise<void> {
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());

    if (useRedis && redis) {
      await redis.set(`auth:otp:lockout:${phone}`, String(Date.now()), 'EX', ttlSeconds);
    } else {
      this.lockoutStore.set(phone, Date.now() + ttlSeconds * 1000);
    }
  }

  /**
   * Atomically clears OTP session, and optionally cooldown and lockout (upon successful verification)
   */
  async clearOtpSession(phone: string, clearAll = false): Promise<void> {
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());

    if (useRedis && redis) {
      const keys = [`auth:otp:${phone}`];
      if (clearAll) {
        keys.push(`auth:otp:cooldown:${phone}`, `auth:otp:lockout:${phone}`);
      }
      await redis.del(...keys);
    } else {
      this.otpStore.delete(phone);
      if (clearAll) {
        this.cooldownStore.delete(phone);
        this.lockoutStore.delete(phone);
      }
    }
  }

  /**
   * Requests a 6-digit SMS OTP for mobile device onboarding
   */
  async requestOtp(dto: RequestOtpDto) {
    const trimmedPhone = dto.phone.trim();

    // Guard 1: Distributed Brute-Force Lockout check (HTTP 429)
    const lockout = await this.checkOtpLockout(trimmedPhone);
    if (lockout.locked) {
      throw new HttpException(
        `Too many invalid verification attempts. This mobile number is temporarily locked out. Please try again in ${lockout.remainingSeconds} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Guard 2: SMS Rate-limiting Cooldown check (60s) (HTTP 429)
    const cooldown = await this.checkOtpCooldown(trimmedPhone);
    if (cooldown.active) {
      throw new HttpException(
        `OTP recently requested. Please wait ${cooldown.remainingSeconds} seconds before requesting a new code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Check staff user
    const user = await this.prisma.user.findUnique({
      where: { phone: trimmedPhone },
    });

    let entityId: string;
    let name: string;
    let roles: Role[];
    let branchId: string | null;
    let isCustomer = false;

    if (user) {
      if (!user.isActive) {
        throw new UnauthorizedException('Staff account is deactivated. Please contact Super Admin.');
      }
      entityId = user.id;
      name = user.name;
      roles = user.roles;
      branchId = user.branchId;
    } else {
      // Check customer
      const customer = await this.prisma.customer.findUnique({
        where: { phone: trimmedPhone },
      });

      if (!customer) {
        throw new NotFoundException(
          'No registered staff or customer profile found with this phone number',
        );
      }

      entityId = customer.id;
      name = customer.fullName;
      roles = [Role.CUSTOMER];
      branchId = customer.branchId;
      isCustomer = true;
    }

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = crypto.createHash('sha256').update(otpCode).digest('hex');

    const otpRecord: OtpSessionRecord = {
      hashedOtp,
      expiresAt: Date.now() + OTP_EXPIRY_SECONDS * 1000,
      attempts: 0,
      entityId,
      name,
      roles,
      branchId,
      phone: trimmedPhone,
      isCustomer,
    };

    const redis = this.redisProvider?.getClient();
    if (redis && this.redisProvider?.getIsConnected()) {
      await redis.set(
        `auth:otp:${trimmedPhone}`,
        JSON.stringify(otpRecord),
        'EX',
        OTP_EXPIRY_SECONDS,
      );
    } else {
      this.otpStore.set(trimmedPhone, otpRecord);
    }

    // Activate 60-second cooldown lock
    await this.setOtpCooldown(trimmedPhone, OTP_COOLDOWN_SECONDS);

    await this.smsService.sendOtpSms(trimmedPhone, otpCode);

    // Debug OTP is restricted strictly to local automated testing (NODE_ENV === 'test' or explicit ALLOW_DEBUG_OTP === 'true')
    // It must NEVER be exposed in staging or production environments.
    const allowDebugOtp =
      process.env.NODE_ENV === 'test' ||
      (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEBUG_OTP === 'true');

    return {
      success: true,
      message: 'OTP sent successfully to registered mobile number.',
      expiresInSeconds: OTP_EXPIRY_SECONDS,
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
      ...(allowDebugOtp ? { debugOtp: otpCode } : {}),
    };
  }

  /**
   * Verifies 6-digit SMS OTP and returns setupToken or full session tokens
   */
  async verifyOtp(dto: VerifyOtpDto) {
    const trimmedPhone = dto.phone.trim();

    // Guard 1: Distributed Brute-Force Lockout check (HTTP 429)
    const lockout = await this.checkOtpLockout(trimmedPhone);
    if (lockout.locked) {
      throw new HttpException(
        `Too many invalid verification attempts. This mobile number is temporarily locked out. Please try again in ${lockout.remainingSeconds} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());
    let record: OtpSessionRecord | undefined;

    if (useRedis && redis) {
      const raw = await redis.get(`auth:otp:${trimmedPhone}`);
      if (raw) {
        try {
          record = JSON.parse(raw);
        } catch {
          record = undefined;
        }
      }
    } else {
      record = this.otpStore.get(trimmedPhone);
    }

    if (!record || Date.now() > record.expiresAt) {
      throw new BadRequestException('OTP has expired or was not requested. Please request a new OTP.');
    }

    const candidateHash = crypto.createHash('sha256').update(dto.otp.trim()).digest('hex');
    if (candidateHash !== record.hashedOtp) {
      record.attempts += 1;
      if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        // Trigger 5-minute lockout penalty and destroy active OTP session
        await this.setOtpLockout(trimmedPhone, OTP_LOCKOUT_SECONDS);
        await this.clearOtpSession(trimmedPhone, false);
        throw new HttpException(
          'Too many invalid verification attempts. This mobile number is temporarily locked out for 5 minutes.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      if (useRedis && redis) {
        const ttl = await redis.ttl(`auth:otp:${trimmedPhone}`);
        if (ttl > 0) {
          await redis.set(`auth:otp:${trimmedPhone}`, JSON.stringify(record), 'EX', ttl);
        }
      }
      throw new BadRequestException(
        `Invalid OTP code. Please enter the correct 6-digit code. ${OTP_MAX_VERIFY_ATTEMPTS - record.attempts} attempt(s) remaining.`,
      );
    }

    // Successful verification: clear active OTP session, cooldown, and lockout atomically
    await this.clearOtpSession(trimmedPhone, true);

    if (record.isCustomer) {
      return await this.generateCustomerAuthTokens({
        id: record.entityId,
        fullName: record.name,
        phone: record.phone,
        branchId: record.branchId,
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: record.entityId },
    });

    if (user?.mpinHash) {
      const tokens = await this.generateAuthTokens(user);
      return {
        verified: true,
        ...tokens,
        message: 'OTP verified successfully.',
      };
    }

    const tempPayload: JwtPayload = {
      sub: record.entityId,
      phone: record.phone,
      roles: record.roles,
      branchId: record.branchId,
      tokenType: 'mpin_setup',
    };

    const setupToken = this.jwtService.sign(tempPayload, { expiresIn: '10m' });

    return {
      verified: true,
      setupToken,
      message: 'OTP verified successfully. Please configure your 6-digit MPIN.',
    };
  }

  /**
   * Sets or updates 6-digit MPIN for mobile quick unlock
   */
  async setMpin(userIdFromAuth: string | undefined, dto: SetMpinDto) {
    let targetUserId = userIdFromAuth;

    if (dto.setupToken) {
      let payload: JwtPayload;
      try {
        payload = this.jwtService.verify<JwtPayload>(dto.setupToken);
      } catch {
        throw new UnauthorizedException('Invalid or expired MPIN setup token');
      }

      if (payload.tokenType !== 'mpin_setup' && payload.tokenType !== 'access') {
        throw new UnauthorizedException('Invalid token type for MPIN setup');
      }
      targetUserId = payload.sub;
    }

    if (!targetUserId) {
      throw new UnauthorizedException('Valid authentication token or setup token is required to set MPIN');
    }

    const mpinHash = await bcrypt.hash(dto.mpin, BCRYPT_SALT_ROUNDS);

    const user = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { mpinHash },
    });

    if (dto.setupToken) {
      const tokens = await this.generateAuthTokens(user);
      return {
        success: true,
        message: '6-digit MPIN configured successfully.',
        ...tokens,
      };
    }

    return {
      success: true,
      message: '6-digit MPIN updated successfully.',
    };
  }

  /**
   * Verifies and decodes a JWT token
   */
  verifyToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token);
  }

  /**
   * Helper to issue JWT tokens for Chit Subscribers (Role.CUSTOMER)
   */
  private async generateCustomerAuthTokens(customer: {
    id: string;
    fullName: string;
    phone: string;
    branchId: string | null;
  }) {
    const accessPayload: JwtPayload = {
      sub: customer.id,
      phone: customer.phone,
      roles: [Role.CUSTOMER],
      branchId: customer.branchId,
      tokenType: 'access',
      jti: crypto.randomUUID(),
    };

    const refreshPayload: JwtPayload = {
      sub: customer.id,
      phone: customer.phone,
      roles: [Role.CUSTOMER],
      branchId: customer.branchId,
      tokenType: 'refresh',
      jti: crypto.randomUUID(),
    };

    const jwtExpiresIn = (this.configService.get<string>('JWT_EXPIRES_IN') ??
      DEFAULT_JWT_ACCESS_EXPIRES_IN) as any;
    const refreshExpiresIn = (this.configService.get<string>(
      'REFRESH_TOKEN_EXPIRES_IN',
    ) ?? DEFAULT_JWT_REFRESH_EXPIRES_IN) as any;

    const accessToken = this.jwtService.sign(accessPayload, { expiresIn: jwtExpiresIn });
    const refreshToken = this.jwtService.sign(refreshPayload, { expiresIn: refreshExpiresIn });

    const refreshTokenHash = await this.hashRefreshToken(refreshToken);
    const now = new Date();

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        refreshTokenHash,
        lastLoginAt: now,
      },
    });

    return {
      verified: true,
      accessToken,
      refreshToken,
      user: {
        id: customer.id,
        name: customer.fullName,
        phone: customer.phone,
        roles: [Role.CUSTOMER],
        branchId: customer.branchId,
        isTotpEnabled: false,
        hasMpin: false,
        lastLoginAt: now,
      },
      message: 'OTP verified successfully. Subscriber logged in.',
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

    // Role-based handling for Chit Subscribers (Role.CUSTOMER)
    if (payload.roles?.includes(Role.CUSTOMER)) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: payload.sub },
      });

      if (!customer) {
        throw new UnauthorizedException('Session revoked or subscriber profile no longer exists');
      }

      if (!customer.refreshTokenHash) {
        throw new UnauthorizedException('Session revoked or customer logged out');
      }

      const isMatch = await this.verifyRefreshTokenHash(dto.refreshToken, customer.refreshTokenHash);
      if (!isMatch) {
        // RFC 6819 Token Reuse Trap: Token is valid JWT but does not match active session hash.
        // Immediately revoke entire session family to contain compromised chain.
        await this.prisma.customer.update({
          where: { id: customer.id },
          data: { refreshTokenHash: null },
        });
        throw new UnauthorizedException(
          'Token reuse detected. Active session revoked for security. Please sign in again.',
        );
      }

      return this.generateCustomerAuthTokens({
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        branchId: customer.branchId,
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Session revoked or user account inactive');
    }

    if (!user.refreshTokenHash) {
      throw new UnauthorizedException('Session revoked or user logged out');
    }

    const isMatch = await this.verifyRefreshTokenHash(dto.refreshToken, user.refreshTokenHash);
    if (!isMatch) {
      // RFC 6819 Token Reuse Trap: Token is valid JWT but does not match active session hash.
      // Immediately revoke entire session family to contain compromised chain.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      throw new UnauthorizedException(
        'Token reuse detected. Active session revoked for security. Please sign in again.',
      );
    }

    return this.generateAuthTokens(user);
  }

  /**
   * Invalidates active session by clearing stored refresh token hash and device FCM push token
   */
  async logout(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (user) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { refreshTokenHash: null, fcmToken: null },
      });
    } else {
      const customer = await this.prisma.customer.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (customer) {
        await this.prisma.customer.update({
          where: { id: userId },
          data: { refreshTokenHash: null, fcmToken: null },
        });
      }
    }

    return {
      success: true,
      message: 'Logged out successfully.',
    };
  }

  /**
   * Registers, updates, or clears the Firebase Cloud Messaging device push token for an authenticated user
   */
  async updateFcmToken(userId: string, fcmToken?: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken: fcmToken || null },
      select: {
        id: true,
        roles: true,
        fcmToken: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: fcmToken
        ? 'Device FCM token registered successfully.'
        : 'Device FCM token deregistered successfully.',
      fcmToken: updatedUser.fcmToken,
    };
  }

  /**
   * Retrieves profile of currently authenticated user or customer
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (user) {
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

    const customer = await this.prisma.customer.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!customer) {
      throw new NotFoundException('User profile not found');
    }

    return {
      id: customer.id,
      name: customer.fullName,
      fullNameTamil: customer.fullNameTamil,
      phone: customer.phone,
      roles: [Role.CUSTOMER],
      customerCode: customer.customerCode,
      branchId: customer.branchId,
      isTotpEnabled: false,
      hasMpin: false,
      isKycVerified: customer.isKycVerified,
      lastLoginAt: customer.lastLoginAt,
      branch: customer.branch
        ? {
            id: customer.branch.id,
            code: customer.branch.code,
            name: customer.branch.name,
            nameTamil: customer.branch.nameTamil,
          }
        : null,
    };
  }

  /**
   * Self-service password change for authenticated office staff.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Staff user not found');
    }

    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password does not match. Please verify and try again.');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        refreshTokenHash: null,
      },
    });

    return {
      success: true,
      message: 'Password successfully changed. Active refresh tokens have been revoked. Please log in with your new password.',
    };
  }

  /**
   * Helper to sign JWT access & refresh tokens and update DB state
   */
  private async generateAuthTokens(user: User) {
    const accessPayload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      roles: user.roles,
      branchId: user.branchId,
      tokenType: 'access',
      jti: crypto.randomUUID(),
    };

    const refreshPayload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      roles: user.roles,
      branchId: user.branchId,
      tokenType: 'refresh',
      jti: crypto.randomUUID(),
    };

    const jwtExpiresIn = (this.configService.get<string>('JWT_EXPIRES_IN') ??
      DEFAULT_JWT_ACCESS_EXPIRES_IN) as any;
    const refreshExpiresIn = (this.configService.get<string>(
      'REFRESH_TOKEN_EXPIRES_IN',
    ) ?? DEFAULT_JWT_REFRESH_EXPIRES_IN) as any;

    const accessToken = this.jwtService.sign(accessPayload, { expiresIn: jwtExpiresIn });
    const refreshToken = this.jwtService.sign(refreshPayload, { expiresIn: refreshExpiresIn });

    const refreshTokenHash = await this.hashRefreshToken(refreshToken);

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

  /**
   * Cryptographically hashes a JWT refresh token for secure database storage.
   * Pre-hashes with SHA-256 to eliminate bcrypt's 72-byte truncation boundary.
   */
  private async hashRefreshToken(token: string): Promise<string> {
    const preHashed = crypto.createHash('sha256').update(token).digest('hex');
    return bcrypt.hash(preHashed, BCRYPT_SALT_ROUNDS);
  }

  /**
   * Timing-safe verification of candidate refresh token against stored bcrypt hash.
   * Checks SHA-256 pre-hashed token first, with fallback to direct candidate comparison.
   */
  private async verifyRefreshTokenHash(token: string, storedHash: string): Promise<boolean> {
    const preHashed = crypto.createHash('sha256').update(token).digest('hex');
    const isMatch = await bcrypt.compare(preHashed, storedHash);
    if (isMatch) return true;
    return bcrypt.compare(token, storedHash);
  }
}
