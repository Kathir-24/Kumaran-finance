import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SmsService } from '../src/notification/services/sms.service';
import { OTP_COOLDOWN_SECONDS, OTP_LOCKOUT_SECONDS } from '../src/common/constants';

describe('Auth Security: SMS OTP Request Cooldown & Brute-Force Lockout (Redis & In-Memory)', () => {
  let authService: AuthService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let smsServiceMock: { sendOtpSms: jest.Mock };
  let prismaMock: {
    user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    customer: { findUnique: jest.Mock; update: jest.Mock };
  };

  const testPhone = '9876500001';
  const mockStaffUser = {
    id: 'usr_staff_001',
    branchId: 'br_erode_01',
    name: 'Field Collection Agent 1',
    phone: testPhone,
    passwordHash: 'hash',
    roles: [Role.COLLECTION_AGENT],
    isActive: true,
    totpSecret: null,
    isTotpEnabled: false,
    mpinHash: null,
    refreshTokenHash: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue(mockStaffUser),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue(mockStaffUser),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };

    smsServiceMock = {
      sendOtpSms: jest.fn().mockResolvedValue({ success: true, messageId: 'msg_test_01' }),
    };

    configService = new ConfigService();
    jwtService = new JwtService({
      secret: 'test-secret-key-1234567890-test',
      signOptions: { expiresIn: '15m' },
    });

    authService = new AuthService(
      prismaMock as unknown as PrismaService,
      jwtService,
      configService,
      smsServiceMock as unknown as SmsService,
    );
  });

  describe('Part 1: In-Memory Resilience (Redis Offline Fallback)', () => {
    it('OTP-RATE-1: Immediate second requestOtp within 60s MUST fail closed with HTTP 429', async () => {
      // First request succeeds
      const firstRes = await authService.requestOtp({ phone: testPhone });
      expect(firstRes.success).toBe(true);
      expect(firstRes.cooldownSeconds).toBe(OTP_COOLDOWN_SECONDS);
      expect(smsServiceMock.sendOtpSms).toHaveBeenCalledTimes(1);

      // Immediate second request within 60s cooldown window
      await expect(authService.requestOtp({ phone: testPhone })).rejects.toThrow(HttpException);

      try {
        await authService.requestOtp({ phone: testPhone });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(err.message).toMatch(/OTP recently requested\. Please wait \d+ seconds/);
      }

      // SMS gateway should NOT have been called again (zero additional SMS cost)
      expect(smsServiceMock.sendOtpSms).toHaveBeenCalledTimes(1);
    });

    it('OTP-RATE-2: requestOtp after cooldown window expiration MUST succeed cleanly', async () => {
      // First request
      await authService.requestOtp({ phone: testPhone });
      expect(smsServiceMock.sendOtpSms).toHaveBeenCalledTimes(1);

      // Simulate passage of 61 seconds by artificially expiring cooldown store
      (authService as any).cooldownStore.set(testPhone, Date.now() - 1000);

      // Second request after cooldown succeeds
      const secondRes = await authService.requestOtp({ phone: testPhone });
      expect(secondRes.success).toBe(true);
      expect(smsServiceMock.sendOtpSms).toHaveBeenCalledTimes(2);
    });

    it('OTP-RATE-3: 3 consecutive incorrect OTP entries MUST trigger 5-minute temporary lockout', async () => {
      const res = await authService.requestOtp({ phone: testPhone });
      expect(res.success).toBe(true);

      // Attempt 1: wrong OTP -> returns 400 with 2 attempts remaining
      await expect(
        authService.verifyOtp({ phone: testPhone, otp: '000000' }),
      ).rejects.toThrow(/2 attempt\(s\) remaining/);

      // Attempt 2: wrong OTP -> returns 400 with 1 attempt remaining
      await expect(
        authService.verifyOtp({ phone: testPhone, otp: '000000' }),
      ).rejects.toThrow(/1 attempt\(s\) remaining/);

      // Attempt 3: 3rd wrong OTP -> triggers HTTP 429 lockout
      await expect(
        authService.verifyOtp({ phone: testPhone, otp: '000000' }),
      ).rejects.toThrow(HttpException);

      try {
        // Direct state check
        const lockoutStatus = await authService.checkOtpLockout(testPhone);
        expect(lockoutStatus.locked).toBe(true);
        expect(lockoutStatus.remainingSeconds).toBeGreaterThan(0);
      } catch (e) {
        throw e;
      }
    });

    it('OTP-RATE-4: Calling requestOtp while actively locked out MUST fail closed with HTTP 429 without sending SMS', async () => {
      // Artificially place user in lockout
      await authService.setOtpLockout(testPhone, OTP_LOCKOUT_SECONDS);

      await expect(authService.requestOtp({ phone: testPhone })).rejects.toThrow(HttpException);

      try {
        await authService.requestOtp({ phone: testPhone });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(err.message).toMatch(/Too many invalid verification attempts\. This mobile number is temporarily locked out/);
      }

      // Zero SMS dispatched
      expect(smsServiceMock.sendOtpSms).not.toHaveBeenCalled();
    });

    it('OTP-RATE-5: Calling verifyOtp while actively locked out MUST fail closed with HTTP 429', async () => {
      await authService.setOtpLockout(testPhone, OTP_LOCKOUT_SECONDS);

      await expect(
        authService.verifyOtp({ phone: testPhone, otp: '123456' }),
      ).rejects.toThrow(HttpException);

      try {
        await authService.verifyOtp({ phone: testPhone, otp: '123456' });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(err.message).toMatch(/Too many invalid verification attempts/);
      }
    });

    it('OTP-RATE-6: Correct OTP verification MUST atomically clear active OTP, cooldown, and lockout states', async () => {
      const res = await authService.requestOtp({ phone: testPhone });
      const sentOtp = smsServiceMock.sendOtpSms.mock.calls[0][1];

      // Verification succeeds
      const verifyRes = await authService.verifyOtp({ phone: testPhone, otp: sentOtp });
      expect(verifyRes.verified).toBe(true);

      // State stores are wiped clean
      const lockoutStatus = await authService.checkOtpLockout(testPhone);
      expect(lockoutStatus.locked).toBe(false);

      const cooldownStatus = await authService.checkOtpCooldown(testPhone);
      expect(cooldownStatus.active).toBe(false);

      // Calling verify again immediately fails because OTP was purged
      await expect(
        authService.verifyOtp({ phone: testPhone, otp: sentOtp }),
      ).rejects.toThrow(BadRequestException);
    });

    it('OTP-RATE-7: 6th requestOtp within 24 hours MUST fail closed with HTTP 429 Daily Limit Exceeded', async () => {
      const quotaPhone = '9842100000';
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-quota',
        name: 'Quota User',
        phone: quotaPhone,
        roles: ['SUPER_ADMIN'],
        branchId: 'branch-prd',
        isActive: true,
      });

      // 5 requests with cooldown clears between them
      for (let i = 1; i <= 5; i++) {
        const res = await authService.requestOtp({ phone: quotaPhone });
        expect(res.success).toBe(true);
        expect(res.dailyRemaining).toBe(5 - i);
        // Clear 60s cooldown in test map to simulate waiting 60s
        await authService.clearOtpSession(quotaPhone, true);
      }

      // 6th request must throw 429 daily quota exceeded
      await expect(
        authService.requestOtp({ phone: quotaPhone }),
      ).rejects.toThrow(HttpException);

      try {
        await authService.requestOtp({ phone: quotaPhone });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(err.message).toContain('Daily OTP request limit exceeded');
      }
    });

    it('OTP-RATE-8: When SMS dispatch fails, daily counter MUST rollback automatically', async () => {
      const failPhone = '9842100001';
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-fail',
        name: 'Fail User',
        phone: failPhone,
        roles: ['SUPER_ADMIN'],
        branchId: 'branch-prd',
        isActive: true,
      });

      smsServiceMock.sendOtpSms.mockRejectedValueOnce(new Error('Downstream carrier error'));

      await expect(
        authService.requestOtp({ phone: failPhone }),
      ).rejects.toThrow('Telecom SMS Gateway error');

      // Daily quota should be rolled back and still have all 5 remaining
      const quota = await authService.checkDailyOtpQuota(failPhone);
      expect(quota.currentCount).toBe(0);
      expect(quota.remaining).toBe(5);
    });
  });

  describe('Part 2: Distributed Redis 7 Architecture', () => {
    let mockRedisStore: Map<string, { value: string; ex: number }>;
    let mockRedisClient: any;
    let redisAuthService: AuthService;

    beforeEach(() => {
      mockRedisStore = new Map();

      mockRedisClient = {
        set: jest.fn().mockImplementation((key: string, val: string, mode?: string, ex?: number) => {
          mockRedisStore.set(key, { value: val, ex: ex || 0 });
          return Promise.resolve('OK');
        }),
        get: jest.fn().mockImplementation((key: string) => {
          const item = mockRedisStore.get(key);
          return Promise.resolve(item ? item.value : null);
        }),
        del: jest.fn().mockImplementation((...keys: string[]) => {
          let count = 0;
          for (const k of keys) {
            if (mockRedisStore.delete(k)) count++;
          }
          return Promise.resolve(count);
        }),
        ttl: jest.fn().mockImplementation((key: string) => {
          const item = mockRedisStore.get(key);
          if (!item) return Promise.resolve(-2);
          return Promise.resolve(item.ex || 60);
        }),
        incr: jest.fn().mockImplementation((key: string) => {
          const item = mockRedisStore.get(key);
          const current = item ? parseInt(item.value, 10) : 0;
          const updated = current + 1;
          mockRedisStore.set(key, { value: String(updated), ex: item?.ex || 0 });
          return Promise.resolve(updated);
        }),
        decr: jest.fn().mockImplementation((key: string) => {
          const item = mockRedisStore.get(key);
          const current = item ? parseInt(item.value, 10) : 0;
          const updated = Math.max(0, current - 1);
          mockRedisStore.set(key, { value: String(updated), ex: item?.ex || 0 });
          return Promise.resolve(updated);
        }),
        expire: jest.fn().mockImplementation((key: string, seconds: number) => {
          const item = mockRedisStore.get(key);
          if (item) {
            item.ex = seconds;
          }
          return Promise.resolve(1);
        }),
      };

      const mockRedisProvider = {
        getClient: jest.fn().mockReturnValue(mockRedisClient),
        getIsConnected: jest.fn().mockReturnValue(true),
      };

      redisAuthService = new AuthService(
        prismaMock as unknown as PrismaService,
        jwtService,
        configService,
        smsServiceMock as unknown as SmsService,
        mockRedisProvider as any,
      );
    });

    it('OTP-REDIS-1: Writes auth:otp:cooldown:<phone> with EX 60 and rejects subsequent requests', async () => {
      const firstRes = await redisAuthService.requestOtp({ phone: testPhone });
      expect(firstRes.success).toBe(true);

      // Redis must have both OTP session and cooldown set
      expect(mockRedisStore.has(`auth:otp:${testPhone}`)).toBe(true);
      expect(mockRedisStore.has(`auth:otp:cooldown:${testPhone}`)).toBe(true);
      expect(mockRedisStore.get(`auth:otp:cooldown:${testPhone}`)?.ex).toBe(OTP_COOLDOWN_SECONDS);

      // Second request throttled
      await expect(redisAuthService.requestOtp({ phone: testPhone })).rejects.toThrow(HttpException);
      expect(smsServiceMock.sendOtpSms).toHaveBeenCalledTimes(1);
    });

    it('OTP-REDIS-2: 3rd failed attempt writes auth:otp:lockout:<phone> with EX 300 and deletes auth:otp:<phone>', async () => {
      await redisAuthService.requestOtp({ phone: testPhone });

      // Simulate 3 invalid guesses
      await expect(redisAuthService.verifyOtp({ phone: testPhone, otp: '000000' })).rejects.toThrow(BadRequestException);
      await expect(redisAuthService.verifyOtp({ phone: testPhone, otp: '000000' })).rejects.toThrow(BadRequestException);
      await expect(redisAuthService.verifyOtp({ phone: testPhone, otp: '000000' })).rejects.toThrow(HttpException);

      // Active OTP session must be deleted
      expect(mockRedisStore.has(`auth:otp:${testPhone}`)).toBe(false);

      // Lockout key must be active with 300s TTL
      expect(mockRedisStore.has(`auth:otp:lockout:${testPhone}`)).toBe(true);
      expect(mockRedisStore.get(`auth:otp:lockout:${testPhone}`)?.ex).toBe(OTP_LOCKOUT_SECONDS);
    });
  });
});
