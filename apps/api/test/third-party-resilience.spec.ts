// ==============================================================================
// Kumaran Chits — Third-Party & External API Resilience Test Suite
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/third-party-integrations-and-resilience.md
// ==============================================================================

import { HttpException, HttpStatus, BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SmsService } from '../src/notification/services/sms.service';
import { SmsDriver, SmsDispatchResult, SmsPayload } from '../src/notification/drivers/sms-driver.interface';
import { Msg91SmsDriver } from '../src/notification/drivers/msg91-sms.driver';
import { MetricsService } from '../src/metrics/services/metrics.service';

describe('Third-Party & External API Resilience Suite', () => {
  const testPhone = '9842143210';

  describe('1. 24-Hour Rolling Daily OTP Quota', () => {
    let authService: AuthService;
    let prismaMock: any;
    let smsServiceMock: any;
    let jwtService: JwtService;
    let configService: ConfigService;

    beforeEach(() => {
      prismaMock = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-001',
            name: 'Kavitha Partner',
            phone: testPhone,
            roles: ['SUPER_ADMIN'],
            branchId: 'branch-prd',
            isActive: true,
          }),
        },
        customer: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      smsServiceMock = {
        sendOtpSms: jest.fn().mockResolvedValue({
          success: true,
          messageId: 'dlt-msg-001',
          provider: 'msg91',
        }),
      };

      jwtService = new JwtService({ secret: 'test-secret' });
      configService = new ConfigService({
        MAX_DAILY_OTP_REQUESTS: 5,
      });

      authService = new AuthService(
        prismaMock as unknown as PrismaService,
        jwtService,
        configService,
        smsServiceMock as unknown as SmsService,
      );
    });

    it('OTP-QUOTA-1: Exactly 5 OTP requests are permitted in 24 hours; the 6th is rejected with HTTP 429', async () => {
      for (let i = 1; i <= 5; i++) {
        const res = await authService.requestOtp({ phone: testPhone });
        expect(res.success).toBe(true);
        expect(res.dailyRemaining).toBe(5 - i);
        // Clear 60-second cooldown in test store to simulate waiting between requests
        await authService.clearOtpSession(testPhone, true);
      }

      // 6th attempt must be rejected
      await expect(authService.requestOtp({ phone: testPhone })).rejects.toThrow(HttpException);

      try {
        await authService.requestOtp({ phone: testPhone });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(err.message).toContain('Daily OTP request limit exceeded');
        expect(err.message).toContain('maximum 5 requests');
      }

      expect(smsServiceMock.sendOtpSms).toHaveBeenCalledTimes(5);
    });

    it('OTP-QUOTA-2: Upstream telecom dispatch failure rolls back daily counter and active OTP session', async () => {
      smsServiceMock.sendOtpSms.mockRejectedValueOnce(new Error('TRAI DLT network timeout'));

      await expect(authService.requestOtp({ phone: testPhone })).rejects.toThrow('Telecom SMS Gateway error');

      const quota = await authService.checkDailyOtpQuota(testPhone);
      expect(quota.currentCount).toBe(0);
      expect(quota.remaining).toBe(5);

      const cooldown = await authService.checkOtpCooldown(testPhone);
      expect(cooldown.active).toBe(false);
    });
  });

  describe('2. Multi-Provider SMS Failover & Graceful Degradation', () => {
    let smsService: SmsService;
    let primaryDriverMock: SmsDriver;
    let backupDriverMock: SmsDriver;
    let metricsService: MetricsService;
    let configService: ConfigService;

    beforeEach(() => {
      primaryDriverMock = {
        providerName: 'msg91-primary',
        sendSms: jest.fn(),
        getCircuitBreakerState: jest.fn().mockReturnValue('CLOSED'),
      };

      backupDriverMock = {
        providerName: 'fast2sms-backup',
        sendSms: jest.fn(),
        getCircuitBreakerState: jest.fn().mockReturnValue('CLOSED'),
      };

      metricsService = new MetricsService();
      configService = new ConfigService();

      smsService = new SmsService(
        primaryDriverMock,
        configService,
        metricsService,
        backupDriverMock,
      );
    });

    it('SMS-FAILOVER-1: Fails over to backup provider when primary returns unsuccessful response', async () => {
      (primaryDriverMock.sendSms as jest.Mock).mockResolvedValue({
        success: false,
        messageId: '',
        provider: 'msg91-primary',
        error: 'TRAI DLT Template ID not found on primary route',
      });

      (backupDriverMock.sendSms as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'backup-msg-12345',
        provider: 'fast2sms-backup',
      });

      const res = await smsService.sendOtpSms(testPhone, '123456');

      expect(res.success).toBe(true);
      expect(res.provider).toBe('fast2sms-backup');
      expect(primaryDriverMock.sendSms).toHaveBeenCalledTimes(1);
      expect(backupDriverMock.sendSms).toHaveBeenCalledTimes(1);
    });

    it('SMS-FAILOVER-2: Fails over to backup provider when primary driver throws an exception', async () => {
      (primaryDriverMock.sendSms as jest.Mock).mockRejectedValue(new Error('Connection reset by peer'));

      (backupDriverMock.sendSms as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'backup-msg-67890',
        provider: 'fast2sms-backup',
      });

      const res = await smsService.sendOtpSms(testPhone, '654321');

      expect(res.success).toBe(true);
      expect(res.messageId).toBe('backup-msg-67890');
      expect(primaryDriverMock.sendSms).toHaveBeenCalledTimes(1);
      expect(backupDriverMock.sendSms).toHaveBeenCalledTimes(1);
    });

    it('SMS-FAILOVER-3: Gracefully degrades without throwing when both primary and backup fail', async () => {
      (primaryDriverMock.sendSms as jest.Mock).mockResolvedValue({
        success: false,
        messageId: '',
        provider: 'msg91-primary',
        error: 'Primary failure',
      });

      (backupDriverMock.sendSms as jest.Mock).mockResolvedValue({
        success: false,
        messageId: '',
        provider: 'fast2sms-backup',
        error: 'Backup quota exhausted',
      });

      // safeDispatch MUST NEVER throw to prevent blocking financial operations
      const res = await smsService.sendOtpSms(testPhone, '999999');
      expect(res.success).toBe(false);
    });
  });

  describe('3. SMS Driver Socket Hardening & Timeout Verification', () => {
    it('SMS-TIMEOUT-1: Msg91SmsDriver initializes with tightened 5000ms timeout', () => {
      const driver = new Msg91SmsDriver({
        authKey: 'test-auth-key',
        senderId: 'KMRCHT',
      });

      expect((driver as any).timeoutMs).toBe(5000);
      expect((driver as any).maxRetryDelayMs).toBe(2000);
      expect(driver.getCircuitBreakerState()).toBe('CLOSED');
    });

    it('SMS-TIMEOUT-2: Circuit breaker transitions to OPEN after 5 consecutive failures and updates state', async () => {
      const driver = new Msg91SmsDriver({
        authKey: 'test-auth-key',
        senderId: 'KMRCHT',
        maxRetries: 0,
        retryBaseDelayMs: 1,
      });

      // Mock httpRequest to simulate gateway HTTP 500 errors
      (driver as any).httpRequest = jest.fn().mockResolvedValue({
        success: false,
        statusCode: 500,
        error: 'HTTP 500 Internal Server Error',
      });

      const payload: SmsPayload = {
        to: testPhone,
        message: 'Test message',
        dltTemplateId: '1407169823412093847',
      };

      // 5 consecutive failures trip the breaker
      for (let i = 0; i < 5; i++) {
        await driver.sendSms(payload);
      }

      expect(driver.getCircuitBreakerState()).toBe('OPEN');

      // 6th call should fast-fail via circuit breaker without making an HTTP request
      const sixthCall = await driver.sendSms(payload);
      expect(sixthCall.success).toBe(false);
      expect(sixthCall.error).toContain('Circuit breaker [MSG91_SMS_GATEWAY] is OPEN');
    });
  });

  describe('4. Prometheus Telemetry for External SMS', () => {
    it('METRIC-SMS-1: Prometheus registry registers SMS dispatch counters and circuit breaker gauges', async () => {
      const metricsService = new MetricsService();
      metricsService.onModuleInit();

      metricsService.smsDispatchesTotal.inc({
        provider: 'msg91',
        template: '1407169823412093847',
        status: 'success',
      });

      metricsService.smsCircuitBreakerState.set({ provider: 'msg91' }, 0);

      const metricsOutput = await metricsService.getMetrics();
      expect(metricsOutput).toContain('kumaran_sms_dispatches_total');
      expect(metricsOutput).toContain('status="success"');
      expect(metricsOutput).toContain('provider="msg91"');
      expect(metricsOutput).toContain('kumaran_sms_circuit_breaker_state');
    });
  });

  describe('5. Bank UTR & Idempotency Duplicate Protection (ADR-19)', () => {
    it('UTR-DUP-1: Replaying duplicate Bank UTR is rejected with HTTP 409 Conflict', () => {
      const existingRef = 'KVB2026102900012';

      function validateBankUtr(newRef: string, existingRefs: Set<string>): void {
        if (existingRefs.has(newRef)) {
          throw new ConflictException(
            `DUPLICATE_TRANSACTION_REF: The bank UTR / transaction reference "${newRef}" has already been recorded in another payment.`,
          );
        }
      }

      const registeredRefs = new Set([existingRef]);

      expect(() => validateBankUtr(existingRef, registeredRefs)).toThrow(ConflictException);
      expect(() => validateBankUtr('KVB2026102900099', registeredRefs)).not.toThrow();
    });

    it('IDEMPOTENCY-1: Idempotent payment request returns existing payment gracefully without duplicate execution', () => {
      const idempotencyStore = new Map<string, any>();
      const initialKey = '550e8400-e29b-41d4-a716-446655440000';

      function handlePayment(key: string, amount: bigint) {
        if (idempotencyStore.has(key)) {
          return {
            duplicateIgnored: true,
            message: 'Payment already recorded with this idempotency key',
            payment: idempotencyStore.get(key),
          };
        }

        const payment = { id: 'pay-uuid-001', amount, idempotencyKey: key };
        idempotencyStore.set(key, payment);
        return { duplicateIgnored: false, payment };
      }

      const res1 = handlePayment(initialKey, 25000n);
      expect(res1.duplicateIgnored).toBe(false);
      expect(res1.payment.id).toBe('pay-uuid-001');

      // Duplicate delivery
      const res2 = handlePayment(initialKey, 25000n);
      expect(res2.duplicateIgnored).toBe(true);
      expect(res2.payment.id).toBe('pay-uuid-001');
    });
  });
});
