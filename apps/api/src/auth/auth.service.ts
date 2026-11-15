import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
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
import { REDIS_RELEASE_LOCK_LUA } from '../common/utils/redis-lock.util';
import { isTokenIssuedBeforeRevocation, isTokenRevokedInRedis } from './utils/token-revocation.util';
import {
  BCRYPT_SALT_ROUNDS,
  DEFAULT_JWT_ACCESS_EXPIRES_IN,
  DEFAULT_JWT_REFRESH_EXPIRES_IN,
  OTP_EXPIRY_SECONDS,
  OTP_COOLDOWN_SECONDS,
  OTP_LOCKOUT_SECONDS,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_MAX_DAILY_REQUESTS,
  OTP_DAILY_WINDOW_SECONDS,
  TOTP_ISSUER_NAME,
} from '../common/constants';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
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
  isPartner?: boolean;
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
  private readonly dailyQuotaStore = new Map<string, { count: number; expiresAt: number }>();
  private readonly inFlightRefreshes = new Map<string, Promise<any>>();
  private readonly consumedSetupTokens = new Set<string>();
  private readonly consumedOnboardingTokens = new Set<string>();
  private readonly localTotpSetupStore = new Map<string, string>();
  private readonly localTotpAttemptsStore = new Map<string, number>();

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
      isPartner: user.isPartner ?? false,
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

    // Step 2: Check if staff account requires first-login permanent password configuration
    if (user.mustChangePassword) {
      const tempPayload: JwtPayload = {
        sub: user.id,
        phone: user.phone,
        roles: user.roles,
        branchId: user.branchId,
        tokenType: 'onboarding_restricted',
      };
      const tempToken = this.jwtService.sign(tempPayload, { expiresIn: '15m' });
      return {
        mustChangePassword: true,
        tempToken,
        message:
          'Initial temporary password detected. You must configure a new permanent password to complete onboarding.',
      };
    }

    // Step 3: Check if TOTP 2FA is required for this staff member
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
    return this.generateAuthTokens(user, dto.clientType || 'WEB');
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
      epochTolerance: 30,
    });

    if (!result.valid) {
      throw new UnauthorizedException('Invalid or expired 6-digit TOTP code');
    }

    if (user.mustChangePassword) {
      const tempPayload: JwtPayload = {
        sub: user.id,
        phone: user.phone,
        roles: user.roles,
        branchId: user.branchId,
        tokenType: 'onboarding_restricted',
      };
      const tempToken = this.jwtService.sign(tempPayload, { expiresIn: '15m' });
      return {
        mustChangePassword: true,
        tempToken,
        message:
          'Initial temporary password detected. You must configure a new permanent password to complete onboarding.',
      };
    }

    return this.generateAuthTokens(user, 'WEB');
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

    if (user.mustChangePassword) {
      throw new UnauthorizedException(
        'Initial password setup required. Please log in with your temporary password and complete onboarding.',
      );
    }

    const isMpinValid = await bcrypt.compare(dto.mpin, user.mpinHash);
    if (!isMpinValid) {
      throw new UnauthorizedException('Invalid phone or MPIN');
    }

    return this.generateAuthTokens(user, dto.clientType || 'MOBILE');
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

    const hasRedisProvider = Boolean(this.redisProvider);
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());
    if (hasRedisProvider && (!useRedis || !redis)) {
      throw new ServiceUnavailableException('2FA setup service is temporarily unavailable');
    }
    if (useRedis && redis) {
      await redis.set(`auth:totp_setup:${userId}`, secret, 'EX', 600);
    } else {
      this.localTotpSetupStore.set(`auth:totp_setup:${userId}`, secret);
    }

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

    const hasRedisProvider = Boolean(this.redisProvider);
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());
    if (hasRedisProvider && (!useRedis || !redis)) {
      throw new ServiceUnavailableException('2FA verification service is temporarily unavailable');
    }

    // Factor replacement guard: require current password if already enrolled
    if (user.isTotpEnabled) {
      if (!dto.password) {
        throw new UnauthorizedException(
          'Current account password is required to replace existing TOTP 2FA factor',
        );
      }
      const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid password. 2FA factor replacement rejected.');
      }
    }

    // F10: Verify setup challenge with bounded retries before atomic consumption
    const challengeKey = `auth:totp_setup:${userId}`;
    const attemptsKey = `auth:totp_attempts:${userId}`;
    let cachedSetupSecret: string | null = null;
    if (useRedis && redis) {
      cachedSetupSecret = await redis.get(challengeKey);
    } else {
      cachedSetupSecret = this.localTotpSetupStore.get(challengeKey) ?? null;
    }

    if (!cachedSetupSecret) {
      throw new BadRequestException(
        'TOTP setup challenge expired or not initiated. Please call /auth/totp/setup first.',
      );
    }
    if (cachedSetupSecret !== dto.secret) {
      throw new BadRequestException('Provided secret does not match the active setup challenge.');
    }

    const result = verifySync({
      token: dto.code,
      secret: dto.secret,
      epochTolerance: 30,
    });

    if (!result.valid) {
      let attempts = 1;
      if (useRedis && redis) {
        attempts = await redis.incr(attemptsKey);
        if (attempts === 1) {
          await redis.expire(attemptsKey, 600);
        }
        if (attempts >= 3) {
          await redis.del(challengeKey, attemptsKey);
          throw new BadRequestException(
            'Too many invalid verification attempts. TOTP setup challenge expired. Please initiate setup again.',
          );
        }
      } else {
        const cur = (this.localTotpAttemptsStore.get(attemptsKey) ?? 0) + 1;
        this.localTotpAttemptsStore.set(attemptsKey, cur);
        attempts = cur;
        if (attempts >= 3) {
          this.localTotpSetupStore.delete(challengeKey);
          this.localTotpAttemptsStore.delete(attemptsKey);
          throw new BadRequestException(
            'Too many invalid verification attempts. TOTP setup challenge expired. Please initiate setup again.',
          );
        }
      }
      throw new BadRequestException(
        `Invalid verification code. Please check Microsoft Authenticator and try again. (${3 - attempts} attempt(s) remaining)`,
      );
    }

    // Code verified successfully: atomically consume the setup challenge and attempts
    // F10: Atomic compare-and-delete prevents race conditions and concurrent double-claims
    if (useRedis && redis) {
      const claimLua = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          redis.call("del", KEYS[1])
          redis.call("del", KEYS[2])
          return 1
        else
          return 0
        end
      `;
      let claimed: number = 0;
      if (typeof (redis as any).eval === 'function') {
        claimed = Number(await (redis as any).eval(claimLua, 2, challengeKey, attemptsKey, dto.secret));
      } else {
        const val = await redis.get(challengeKey);
        if (val === dto.secret) {
          await redis.del(challengeKey, attemptsKey);
          claimed = 1;
        }
      }
      if (claimed !== 1) {
        throw new BadRequestException('TOTP setup challenge has already been consumed or expired.');
      }
    } else {
      const stored = this.localTotpSetupStore.get(challengeKey);
      if (stored !== dto.secret) {
        throw new BadRequestException('TOTP setup challenge has already been consumed or expired.');
      }
      this.localTotpSetupStore.delete(challengeKey);
      this.localTotpAttemptsStore.delete(attemptsKey);
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

    // Revoke previous sessions on factor change to contain any hijacked chains
    await this.revokeUserSessions(userId);

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

    await this.revokeUserSessions(userId);

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

  private getMaxDailyOtpRequests(): number {
    const configured = this.configService.get<number>('MAX_DAILY_OTP_REQUESTS');
    return configured && configured > 0 ? configured : OTP_MAX_DAILY_REQUESTS;
  }

  /**
   * Checks if mobile number has exceeded rolling 24-hour OTP request quota
   */
  async checkDailyOtpQuota(phone: string): Promise<{
    allowed: boolean;
    currentCount: number;
    remaining: number;
    maxDaily: number;
    resetInSeconds: number;
  }> {
    const maxDaily = this.getMaxDailyOtpRequests();
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());

    if (useRedis && redis) {
      const key = `auth:otp:daily:${phone}`;
      const [countStr, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
      const currentCount = countStr ? parseInt(countStr, 10) : 0;
      const resetInSeconds = ttl > 0 ? ttl : OTP_DAILY_WINDOW_SECONDS;

      if (currentCount >= maxDaily) {
        return {
          allowed: false,
          currentCount,
          remaining: 0,
          maxDaily,
          resetInSeconds,
        };
      }
      return {
        allowed: true,
        currentCount,
        remaining: maxDaily - currentCount,
        maxDaily,
        resetInSeconds,
      };
    }

    const record = this.dailyQuotaStore.get(phone);
    const now = Date.now();
    if (record && now < record.expiresAt) {
      const resetInSeconds = Math.ceil((record.expiresAt - now) / 1000);
      if (record.count >= maxDaily) {
        return {
          allowed: false,
          currentCount: record.count,
          remaining: 0,
          maxDaily,
          resetInSeconds,
        };
      }
      return {
        allowed: true,
        currentCount: record.count,
        remaining: maxDaily - record.count,
        maxDaily,
        resetInSeconds,
      };
    }

    if (record) {
      this.dailyQuotaStore.delete(phone);
    }
    return {
      allowed: true,
      currentCount: 0,
      remaining: maxDaily,
      maxDaily,
      resetInSeconds: OTP_DAILY_WINDOW_SECONDS,
    };
  }

  /**
   * Increments daily OTP request counter with a rolling 24-hour expiration
   */
  async incrementDailyOtpCount(phone: string): Promise<number> {
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(
      redis &&
        this.redisProvider?.getIsConnected() &&
        typeof redis.incr === 'function',
    );

    if (useRedis && redis) {
      const key = `auth:otp:daily:${phone}`;
      const newCount = await redis.incr(key);
      if (newCount === 1 && typeof redis.expire === 'function') {
        await redis.expire(key, OTP_DAILY_WINDOW_SECONDS);
      }
      return newCount;
    }

    const record = this.dailyQuotaStore.get(phone);
    const now = Date.now();
    if (record && now < record.expiresAt) {
      record.count += 1;
      return record.count;
    }

    const newRecord = { count: 1, expiresAt: now + OTP_DAILY_WINDOW_SECONDS * 1000 };
    this.dailyQuotaStore.set(phone, newRecord);
    return 1;
  }

  /**
   * Decrements daily OTP request counter when upstream telecom dispatch fails
   */
  async decrementDailyOtpCount(phone: string): Promise<void> {
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(
      redis &&
        this.redisProvider?.getIsConnected() &&
        typeof redis.decr === 'function',
    );

    if (useRedis && redis) {
      const key = `auth:otp:daily:${phone}`;
      const count = await redis.decr(key);
      if (count <= 0) {
        await redis.del(key);
      }
      return;
    }

    const record = this.dailyQuotaStore.get(phone);
    if (record && record.count > 0) {
      record.count -= 1;
      if (record.count <= 0) {
        this.dailyQuotaStore.delete(phone);
      }
    }
  }

  /**
   * Requests a 6-digit SMS OTP for mobile device onboarding
   */
  async requestOtp(dto: RequestOtpDto) {
    const trimmedPhone = dto.phone.trim();

    // Guard 0: Daily 24-Hour SMS OTP Quota check (HTTP 429)
    const dailyQuota = await this.checkDailyOtpQuota(trimmedPhone);
    if (!dailyQuota.allowed) {
      throw new HttpException(
        `Daily OTP request limit exceeded for this mobile number (maximum ${dailyQuota.maxDaily} requests per 24 hours). Please try again in ${Math.ceil(dailyQuota.resetInSeconds / 3600)} hours or contact branch staff.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

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
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());
    if (useRedis && redis) {
      await redis.set(
        `auth:otp:${trimmedPhone}`,
        JSON.stringify(otpRecord),
        'EX',
        OTP_EXPIRY_SECONDS,
      );
    } else {
      this.otpStore.set(trimmedPhone, otpRecord);
    }

    // Activate 60-second cooldown lock and increment daily counter
    await this.setOtpCooldown(trimmedPhone, OTP_COOLDOWN_SECONDS);
    await this.incrementDailyOtpCount(trimmedPhone);

    let dispatchResult: any;
    try {
      dispatchResult = await this.smsService.sendOtpSms(trimmedPhone, otpCode);
    } catch (smsErr: any) {
      // Rollback cooldown, daily count, and active OTP session so user is not penalized or locked out by telecom partition
      await this.decrementDailyOtpCount(trimmedPhone);
      if (useRedis && redis) {
        await redis.del(`auth:otp:${trimmedPhone}`, `auth:otp:cooldown:${trimmedPhone}`);
      } else {
        this.otpStore.delete(trimmedPhone);
        this.cooldownStore.delete(trimmedPhone);
      }
      throw new BadGatewayException(
        `Telecom SMS Gateway error (504 Timeout): ${smsErr.message || 'TRAI DLT gateway unreachable'}. Please try again.`,
      );
    }

    if (dispatchResult && (dispatchResult === false || dispatchResult.success === false)) {
      await this.decrementDailyOtpCount(trimmedPhone);
      if (useRedis && redis) {
        await redis.del(`auth:otp:${trimmedPhone}`, `auth:otp:cooldown:${trimmedPhone}`);
      } else {
        this.otpStore.delete(trimmedPhone);
        this.cooldownStore.delete(trimmedPhone);
      }
      throw new BadGatewayException(
        `Telecom SMS Gateway timed out (504): ${dispatchResult.error || 'TRAI DLT gateway unreachable'}. Please try again.`,
      );
    }

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
      dailyRemaining: Math.max(0, dailyQuota.remaining - 1),
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
      const customer = await this.prisma.customer.findUnique({
        where: { id: record.entityId },
      });
      if (!customer) {
        throw new UnauthorizedException('Customer account invalid or deactivated');
      }
      return await this.generateCustomerAuthTokens(
        {
          id: customer.id,
          fullName: customer.fullName,
          phone: customer.phone,
          branchId: customer.branchId,
        },
        dto.clientType || 'MOBILE',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: record.entityId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account invalid or deactivated');
    }

    // F16: Enforce onboarding password setup before granting full session via OTP
    if (user.mustChangePassword) {
      const onboardingPayload: JwtPayload = {
        sub: user.id,
        phone: user.phone,
        roles: user.roles,
        branchId: user.branchId,
        tokenType: 'onboarding_restricted',
      };
      const tempToken = this.jwtService.sign(onboardingPayload, { expiresIn: '15m' });
      return {
        verified: true,
        mustChangePassword: true,
        tempToken,
        message: 'Initial password setup required before logging in.',
      };
    }

    if (user.mpinHash) {
      const tokens = await this.generateAuthTokens(user, dto.clientType || 'MOBILE');
      return {
        verified: true,
        ...tokens,
        message: 'OTP verified successfully.',
      };
    }

    const tempPayload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      roles: user.roles,
      branchId: user.branchId,
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

      if (payload.tokenType !== 'mpin_setup') {
        throw new UnauthorizedException(
          'Invalid token type for MPIN setup. Single-use onboarding setup token required.',
        );
      }

      targetUserId = payload.sub;

      // Fail-closed verification store check for single-use consumption
      const hasRedisProvider = Boolean(this.redisProvider);
      const redis = this.redisProvider?.getClient();
      const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());
      if (hasRedisProvider && (!useRedis || !redis)) {
        throw new ServiceUnavailableException('Setup verification store is temporarily unavailable');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: targetUserId },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User account invalid or deactivated');
      }

      if (user.mustChangePassword) {
        throw new BadRequestException('Initial password setup required before configuring MPIN.');
      }

      // F01: Validate setup challenge against current account revocation state before consumption
      if (useRedis && redis && (await isTokenRevokedInRedis(redis, payload))) {
        throw new UnauthorizedException(
          'MPIN setup token has been revoked. Please request a new OTP.',
        );
      }

      if (
        user.tokenRevokedBefore &&
        isTokenIssuedBeforeRevocation(payload, user.tokenRevokedBefore.getTime().toString())
      ) {
        throw new UnauthorizedException(
          'MPIN setup token has been revoked. Please request a new OTP.',
        );
      }

      // Atomically consume setup token once to prevent replay
      const tokenKey = `auth:consumed_setup_token:${payload.jti || payload.sub + ':' + (payload.iat || Date.now())}`;
      if (useRedis && redis) {
        const setOk = await redis.set(tokenKey, '1', 'EX', 600, 'NX');
        if (setOk !== 'OK') {
          throw new UnauthorizedException(
            'MPIN setup token has already been consumed. Please request a new OTP.',
          );
        }
      } else {
        if (this.consumedSetupTokens.has(tokenKey)) {
          throw new UnauthorizedException(
            'MPIN setup token has already been consumed. Please request a new OTP.',
          );
        }
        this.consumedSetupTokens.add(tokenKey);
      }
    }

    if (!targetUserId) {
      throw new UnauthorizedException('Valid authentication token or setup token is required to set MPIN');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account invalid or deactivated');
    }

    if (user.mustChangePassword) {
      throw new BadRequestException('Initial password setup required before configuring MPIN.');
    }

    const mpinHash = await bcrypt.hash(dto.mpin, BCRYPT_SALT_ROUNDS);

    const updatedUser = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { mpinHash },
    });

    if (dto.setupToken) {
      const tokens = await this.generateAuthTokens(updatedUser, 'MOBILE');
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
   * Completes initial staff onboarding by exchanging restricted onboarding token for active credentials
   */
  async completeOnboarding(dto: CompleteOnboardingDto) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(dto.tempToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired onboarding token');
    }

    if (payload.tokenType !== 'onboarding_restricted') {
      throw new UnauthorizedException('Invalid token type for onboarding completion');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account invalid or deactivated');
    }

    if (!user.mustChangePassword) {
      throw new BadRequestException('Onboarding has already been completed for this account');
    }

    if (
      user.tokenRevokedBefore &&
      isTokenIssuedBeforeRevocation(payload, user.tokenRevokedBefore.getTime().toString())
    ) {
      throw new UnauthorizedException('Onboarding session has been revoked');
    }

    // Atomically consume onboarding token to prevent token reuse
    const hasRedisProvider = Boolean(this.redisProvider);
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());
    if (hasRedisProvider && (!useRedis || !redis)) {
      throw new ServiceUnavailableException('Onboarding verification store is temporarily unavailable');
    }

    const tokenHash = crypto.createHash('sha256').update(dto.tempToken).digest('hex');
    const consumedKey = `auth:consumed_onboarding:${tokenHash}`;
    if (useRedis && redis) {
      const setRes = await redis.set(consumedKey, '1', 'EX', 900, 'NX');
      if (setRes !== 'OK') {
        throw new UnauthorizedException('Onboarding token has already been consumed');
      }
    } else {
      if (this.consumedOnboardingTokens.has(consumedKey)) {
        throw new UnauthorizedException('Onboarding token has already been consumed');
      }
      this.consumedOnboardingTokens.add(consumedKey);
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    await this.revokeUserSessions(user.id);

    if (updatedUser.isTotpEnabled) {
      const totpPayload: JwtPayload = {
        sub: updatedUser.id,
        phone: updatedUser.phone,
        roles: updatedUser.roles,
        branchId: updatedUser.branchId,
        tokenType: 'totp_pending',
      };
      const tempToken = this.jwtService.sign(totpPayload, { expiresIn: '5m' });
      return {
        requiresTotp: true,
        tempToken,
        message: 'Password set successfully. Two-factor authentication code required.',
      };
    }

    return this.generateAuthTokens(updatedUser, 'WEB');
  }

  /**
   * Validates an access token and asserts account is active, non-revoked, and meets authentication prerequisites.
   */
  async validateAuthenticatedAccessToken(token: string): Promise<JwtPayload> {
    let payload: JwtPayload;
    try {
      payload = this.verifyToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException(
        'Invalid token purpose for MPIN change. Full access token required.',
      );
    }

    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());
    if (useRedis && redis) {
      if (await isTokenRevokedInRedis(redis, payload)) {
        throw new UnauthorizedException('Session terminated or token revoked. Please sign in again.');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account invalid or deactivated');
    }

    if (
      user.tokenRevokedBefore &&
      isTokenIssuedBeforeRevocation(payload, user.tokenRevokedBefore.getTime().toString())
    ) {
      throw new UnauthorizedException('Session terminated or token revoked. Please sign in again.');
    }

    // F04: Validate persisted scoped session state in PostgreSQL
    if (payload.clientType && typeof (this.prisma as any).session?.findFirst === 'function') {
      const session = await (this.prisma as any).session.findFirst({
        where: {
          OR: [
            { userId: payload.sub, clientType: payload.clientType },
            { customerId: payload.sub, clientType: payload.clientType },
          ],
        },
        select: { id: true, revokedAt: true, expiresAt: true, refreshTokenHash: true, createdAt: true },
      });
      if (session) {
        if (
          session.revokedAt &&
          isTokenIssuedBeforeRevocation(payload, session.revokedAt.getTime().toString())
        ) {
          throw new UnauthorizedException('Session terminated or logged out. Please sign in again.');
        }
        if (!session.refreshTokenHash && session.revokedAt) {
          throw new UnauthorizedException('Session terminated or logged out. Please sign in again.');
        }
        if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
          throw new UnauthorizedException('Session terminated or expired. Please sign in again.');
        }
        if (payload.sid && session.id && payload.sid !== session.id) {
          throw new UnauthorizedException('Session terminated or superseded. Please sign in again.');
        }
        if (session.createdAt && isTokenIssuedBeforeRevocation(payload, session.createdAt.getTime().toString())) {
          throw new UnauthorizedException('Session terminated or superseded. Please sign in again.');
        }
      }
    }

    if (user.mustChangePassword) {
      throw new BadRequestException('Initial password setup required before configuring MPIN.');
    }

    return payload;
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
  private async generateCustomerAuthTokens(
    customer: {
      id: string;
      fullName: string;
      phone: string;
      branchId: string | null;
    },
    clientType: string = 'MOBILE',
  ) {
    const issuedAtMs = Date.now();
    const sid = crypto.randomUUID();
    const accessPayload: JwtPayload = {
      sub: customer.id,
      phone: customer.phone,
      roles: [Role.CUSTOMER],
      branchId: customer.branchId,
      tokenType: 'access',
      clientType,
      sid,
      jti: crypto.randomUUID(),
      issuedAtMs,
    };

    const refreshPayload: JwtPayload = {
      sub: customer.id,
      phone: customer.phone,
      roles: [Role.CUSTOMER],
      branchId: customer.branchId,
      tokenType: 'refresh',
      clientType,
      sid,
      jti: crypto.randomUUID(),
      issuedAtMs,
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

    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());
    if (useRedis && redis) {
      await redis.set(`auth:session:${customer.id}:${clientType}`, refreshTokenHash, 'EX', 7 * 86400);
    }

    if (typeof (this.prisma as any).session?.upsert === 'function') {
      const expiresAt = new Date(Date.now() + 7 * 86400 * 1000);
      await (this.prisma as any).session.upsert({
        where: {
          customerId_clientType: {
            customerId: customer.id,
            clientType,
          },
        },
        create: {
          id: sid,
          customerId: customer.id,
          clientType,
          refreshTokenHash,
          expiresAt,
          revokedAt: null,
          createdAt: now,
        },
        update: {
          id: sid,
          refreshTokenHash,
          expiresAt,
          revokedAt: null,
          createdAt: now,
        },
      });
    }

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
   * Rotates access and refresh tokens with single-flight coalescing across concurrent requests.
   * Preserves immediate RFC 6819 theft revocation on sequential replays of rotated tokens.
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

    const clientType = payload.clientType || dto.clientType || 'WEB';
    if (dto.clientType && payload.clientType && dto.clientType !== payload.clientType) {
      throw new UnauthorizedException(
        `Client type mismatch: token bound to '${payload.clientType}', requested '${dto.clientType}'`,
      );
    }
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());
    const tokenDigest = crypto.createHash('sha256').update(dto.refreshToken).digest('hex');
    const inFlightKey = `${tokenDigest}:${clientType}`;

    const existingPromise = this.inFlightRefreshes.get(inFlightKey);
    if (existingPromise) {
      return existingPromise;
    }

    const rotationPromise = (async () => {
      try {
        if (useRedis && redis) {
          return await this.refreshWithRedisCoalescing(
            dto,
            payload,
            clientType,
            tokenDigest,
            redis,
          );
        }
        return await this.executeTokenRotation(dto, payload, clientType, redis, false);
      } finally {
        this.inFlightRefreshes.delete(inFlightKey);
      }
    })();

    this.inFlightRefreshes.set(inFlightKey, rotationPromise);
    return rotationPromise;
  }

  /**
   * Coordinates distributed concurrent refresh bursts via Redis mutex + contention-scoped result sharing.
   */
  private async refreshWithRedisCoalescing(
    dto: RefreshTokenDto,
    payload: JwtPayload,
    clientType: string,
    tokenDigest: string,
    redis: any,
  ) {
    const lockKey = `lock:auth:refresh:${tokenDigest}`;
    const waitersKey = `auth:refresh_waiters:${tokenDigest}`;
    const resultKey = `auth:refresh_inflight_result:${tokenDigest}`;
    const lockToken = crypto.randomUUID();

    const acquired = await redis.set(lockKey, lockToken, 'PX', 4000, 'NX');
    if (acquired === 'OK') {
      try {
        const result = await this.executeTokenRotation(dto, payload, clientType, redis, true);
        const waiterCountRaw = await redis.get(waitersKey);
        if (waiterCountRaw && parseInt(waiterCountRaw, 10) > 0) {
          await redis.set(resultKey, JSON.stringify(result), 'EX', 4);
        }
        return result;
      } finally {
        if (typeof redis.eval === 'function') {
          await redis.eval(REDIS_RELEASE_LOCK_LUA, 1, lockKey, lockToken).catch(() => {});
        } else if ((await redis.get(lockKey)) === lockToken) {
          await redis.del(lockKey).catch(() => {});
        }
      }
    }

    let registeredWaiter = false;
    try {
      if (typeof redis.incr === 'function') {
        await redis.incr(waitersKey);
        if (typeof redis.expire === 'function') {
          await redis.expire(waitersKey, 5);
        }
      } else {
        await redis.set(waitersKey, '1', 'EX', 5);
      }
      registeredWaiter = true;

      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50));

        const sharedRaw = await redis.get(resultKey);
        if (sharedRaw) {
          const activeSession = await redis.get(`auth:session:${payload.sub}:${clientType}`);
          const isRevokedByTimestamp = await isTokenRevokedInRedis(redis, { ...payload, clientType });

          if (!activeSession || isRevokedByTimestamp) {
            throw new UnauthorizedException('Session revoked or logged out');
          }

          if (typeof redis.decr === 'function') {
            const remaining = await redis.decr(waitersKey);
            registeredWaiter = false;
            if (remaining <= 0) {
              await redis.del(waitersKey, resultKey);
            }
          } else {
            registeredWaiter = false;
            await redis.del(waitersKey, resultKey);
          }

          return JSON.parse(sharedRaw);
        }

        const lockStillHeld = await redis.get(lockKey);
        if (!lockStillHeld) {
          const lateResult = await redis.get(resultKey);
          if (lateResult) {
            continue;
          }
          break;
        }
      }
    } finally {
      if (registeredWaiter) {
        if (typeof redis.decr === 'function') {
          const remaining = await redis.decr(waitersKey).catch(() => 0);
          if (remaining <= 0) {
            await redis.del(waitersKey, resultKey).catch(() => {});
          }
        } else {
          await redis.del(waitersKey, resultKey).catch(() => {});
        }
      }
    }

    return this.executeTokenRotation(dto, payload, clientType, redis, true);
  }

  /**
   * Executes hash verification, RFC 6819 reuse detection, and fresh token issuance.
   */
  private async executeTokenRotation(
    dto: RefreshTokenDto,
    payload: JwtPayload,
    clientType: string,
    redis: any,
    useRedis: boolean,
  ) {
    if (useRedis && redis && (await isTokenRevokedInRedis(redis, { ...payload, clientType }))) {
      throw new UnauthorizedException('Session revoked or logged out');
    }

    // Role-based handling for Chit Subscribers (Role.CUSTOMER)
    if (payload.roles?.includes(Role.CUSTOMER)) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: payload.sub },
      });

      if (!customer) {
        throw new UnauthorizedException('Session revoked or subscriber profile no longer exists');
      }

      if (
        customer.tokenRevokedBefore &&
        isTokenIssuedBeforeRevocation(payload, customer.tokenRevokedBefore.getTime().toString())
      ) {
        throw new UnauthorizedException('Session revoked or logged out');
      }

      let storedHash: string | null = null;
      if (typeof (this.prisma as any).session?.findUnique === 'function') {
        const session = await (this.prisma as any).session.findUnique({
          where: { customerId_clientType: { customerId: customer.id, clientType } },
        });
        if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.refreshTokenHash) {
          if (useRedis && redis) {
            await redis.del(`auth:session:${customer.id}:${clientType}`).catch(() => {});
          }
          throw new UnauthorizedException('Session has been revoked or expired');
        }
        if (payload.sid && session.id && payload.sid !== session.id) {
          throw new UnauthorizedException('Session has been superseded. Please sign in again.');
        }
        storedHash = session.refreshTokenHash;
      } else {
        if (useRedis && redis) {
          storedHash = await redis.get(`auth:session:${customer.id}:${clientType}`);
        }
        if (!storedHash) {
          storedHash = customer.refreshTokenHash;
        }
      }

      if (!storedHash) {
        throw new UnauthorizedException('Session revoked or customer logged out');
      }

      const isMatch = await this.verifyRefreshTokenHash(dto.refreshToken, storedHash);
      if (!isMatch) {
        // RFC 6819 Token Reuse Trap: Token is valid JWT but does not match active session hash.
        // Immediately revoke entire session family to contain compromised chain.
        if (useRedis && redis) {
          await redis.del(`auth:session:${customer.id}:${clientType}`);
        }
        if (typeof (this.prisma as any).session?.updateMany === 'function') {
          await (this.prisma as any).session.updateMany({
            where: { customerId: customer.id, clientType },
            data: { refreshTokenHash: null, revokedAt: new Date() },
          });
        }
        await this.prisma.customer.update({
          where: { id: customer.id },
          data: { refreshTokenHash: null },
        });
        throw new UnauthorizedException(
          'Token reuse detected. Active session revoked for security. Please sign in again.',
        );
      }

      return this.generateCustomerAuthTokens(
        {
          id: customer.id,
          fullName: customer.fullName,
          phone: customer.phone,
          branchId: customer.branchId,
        },
        clientType,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Session revoked or user account inactive');
    }

    if (
      user.tokenRevokedBefore &&
      isTokenIssuedBeforeRevocation(payload, user.tokenRevokedBefore.getTime().toString())
    ) {
      throw new UnauthorizedException('Session revoked or credentials updated');
    }

    let storedHash: string | null = null;
    if (typeof (this.prisma as any).session?.findUnique === 'function') {
      const session = await (this.prisma as any).session.findUnique({
        where: { userId_clientType: { userId: user.id, clientType } },
      });
      if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.refreshTokenHash) {
        if (useRedis && redis) {
          await redis.del(`auth:session:${user.id}:${clientType}`).catch(() => {});
        }
        throw new UnauthorizedException('Session has been revoked or expired');
      }
      if (payload.sid && session.id && payload.sid !== session.id) {
        throw new UnauthorizedException('Session has been superseded. Please sign in again.');
      }
      storedHash = session.refreshTokenHash;
    } else {
      if (useRedis && redis) {
        storedHash = await redis.get(`auth:session:${user.id}:${clientType}`);
      }
      if (!storedHash) {
        storedHash = user.refreshTokenHash;
      }
    }

    if (!storedHash) {
      throw new UnauthorizedException('Session revoked or user logged out');
    }

    const isMatch = await this.verifyRefreshTokenHash(dto.refreshToken, storedHash);
    if (!isMatch) {
      // RFC 6819 Token Reuse Trap: Token is valid JWT but does not match active session hash.
      // Immediately revoke entire session family to contain compromised chain.
      if (useRedis && redis) {
        await redis.del(`auth:session:${user.id}:${clientType}`);
      }
      if (typeof (this.prisma as any).session?.updateMany === 'function') {
        await (this.prisma as any).session.updateMany({
          where: { userId: user.id, clientType },
          data: { refreshTokenHash: null, revokedAt: new Date() },
        });
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      throw new UnauthorizedException(
        'Token reuse detected. Active session revoked for security. Please sign in again.',
      );
    }

    return this.generateAuthTokens(user, clientType);
  }

  /**
   * Permanently invalidates sessions across horizontal instances and client device families.
   * Updates PostgreSQL tokenRevokedBefore authority, clears persisted Session hashes,
   * purges Redis session vault keys, and sets fast-path stateless revocation cutoffs.
   */
  async revokeUserSessions(userId: string, clientType?: string): Promise<void> {
    const now = new Date();
    const revokedAtMs = Date.now().toString();
    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());
    const refreshTtlSeconds = 7 * 86400;

    if (clientType && clientType !== 'ALL') {
      if (typeof (this.prisma as any).session?.updateMany === 'function') {
        await (this.prisma as any).session.updateMany({
          where: {
            OR: [
              { userId, clientType },
              { customerId: userId, clientType },
            ],
          },
          data: {
            refreshTokenHash: null,
            revokedAt: now,
          },
        });
      }

      if (useRedis && redis) {
        await redis.del(`auth:session:${userId}:${clientType}`).catch(() => {});
        await redis.del(`user:status:${userId}`).catch(() => {});
        await redis.del(`user:status:${userId}:${clientType}`).catch(() => {});
        await redis.set(
          `auth:revoked_before:${userId}:${clientType}`,
          revokedAtMs,
          'EX',
          refreshTtlSeconds,
        ).catch(() => {});
      }
    } else {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (user) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            tokenRevokedBefore: now,
            refreshTokenHash: null,
            fcmToken: null,
          },
        });
      } else {
        const customer = await this.prisma.customer.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (customer) {
          await this.prisma.customer.update({
            where: { id: userId },
            data: {
              tokenRevokedBefore: now,
              refreshTokenHash: null,
              fcmToken: null,
            },
          });
        }
      }

      if (typeof (this.prisma as any).session?.updateMany === 'function') {
        await (this.prisma as any).session.updateMany({
          where: {
            OR: [{ userId }, { customerId: userId }],
          },
          data: {
            refreshTokenHash: null,
            revokedAt: now,
          },
        });
      }

      if (useRedis && redis) {
        await redis.del(
          `user:status:${userId}`,
          `user:status:${userId}:WEB`,
          `user:status:${userId}:MOBILE`,
          `user:status:${userId}:DESKTOP`,
          `auth:session:${userId}:WEB`,
          `auth:session:${userId}:MOBILE`,
          `auth:session:${userId}:DESKTOP`,
        ).catch(() => {});

        await redis.set(`auth:revoked_before:${userId}`, revokedAtMs, 'EX', refreshTtlSeconds).catch(() => {});
      }
    }
  }

  /**
   * Invalidates active session by clearing stored refresh token hash and device FCM push token
   */
  async logout(userId: string, clientType?: string) {
    await this.revokeUserSessions(userId, clientType);
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

    // Authority-level session revocation across PostgreSQL and Redis
    await this.revokeUserSessions(userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
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
  private async generateAuthTokens(user: User, clientType: string = 'WEB') {
    const issuedAtMs = Date.now();
    const sid = crypto.randomUUID();
    const accessPayload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      roles: user.roles,
      isPartner: user.isPartner ?? false,
      branchId: user.branchId,
      tokenType: 'access',
      clientType,
      sid,
      jti: crypto.randomUUID(),
      issuedAtMs,
    };

    const refreshPayload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      roles: user.roles,
      isPartner: user.isPartner ?? false,
      branchId: user.branchId,
      tokenType: 'refresh',
      clientType,
      sid,
      jti: crypto.randomUUID(),
      issuedAtMs,
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

    const redis = this.redisProvider?.getClient();
    const useRedis = Boolean(redis && this.redisProvider?.getIsConnected());
    if (useRedis && redis) {
      await redis.set(`auth:session:${user.id}:${clientType}`, refreshTokenHash, 'EX', 7 * 86400);
    }

    if (typeof (this.prisma as any).session?.upsert === 'function') {
      const expiresAt = new Date(Date.now() + 7 * 86400 * 1000);
      await (this.prisma as any).session.upsert({
        where: {
          userId_clientType: {
            userId: user.id,
            clientType,
          },
        },
        create: {
          id: sid,
          userId: user.id,
          clientType,
          refreshTokenHash,
          expiresAt,
          revokedAt: null,
          createdAt: now,
        },
        update: {
          id: sid,
          refreshTokenHash,
          expiresAt,
          revokedAt: null,
          createdAt: now,
        },
      });
    }

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
