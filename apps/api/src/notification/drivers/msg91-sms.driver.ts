// ==============================================================================
// Kumaran Chits — MSG91 Indian DLT SMS Driver
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/notification-and-receipt-templates.md (§2)
// ==============================================================================

import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import { CircuitBreaker } from '../../common/utils/circuit-breaker.util';
import { PhoneHelper } from '../helpers/phone.helper';
import {
  SmsDispatchResult,
  SmsDriver,
  SmsPayload,
} from './sms-driver.interface';

export interface Msg91Config {
  authKey: string;
  senderId?: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  timeoutMs?: number;
  redisClient?: any;
}

interface HttpResult {
  success: boolean;
  statusCode?: number;
  data?: any;
  error?: string;
}

@Injectable()
export class Msg91SmsDriver implements SmsDriver {
  public readonly providerName = 'msg91';
  private readonly logger = new Logger(Msg91SmsDriver.name);
  private readonly authKey: string;
  private readonly senderId: string;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(config: Msg91Config) {
    this.authKey = config.authKey;
    this.senderId = config.senderId || 'KMRCHT';
    this.maxRetries = config.maxRetries ?? 2;
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? 400;
    this.timeoutMs = config.timeoutMs ?? 5000;
    this.maxRetryDelayMs = 2000;
    this.circuitBreaker = new CircuitBreaker({
      name: 'MSG91_SMS_GATEWAY',
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      redisClient: config.redisClient,
    });
  }

  async sendSms(payload: SmsPayload): Promise<SmsDispatchResult> {
    const msisdn = PhoneHelper.formatIndianMsisdn(payload.to);
    const maskedPhone = PhoneHelper.maskPhone(payload.to);

    if (!payload.dltTemplateId) {
      this.logger.error(`[Msg91SmsDriver] DLT Template ID is required for Indian SMS delivery`);
      return {
        success: false,
        messageId: '',
        provider: 'msg91',
        error: 'DLT Template ID is missing',
      };
    }

    const msg91Payload = {
      template_id: payload.dltTemplateId,
      sender: this.senderId,
      short_url: '0',
      recipients: [
        {
          mobiles: msisdn,
          ...payload.variables,
        },
      ],
    };

    const postData = JSON.stringify(msg91Payload);

    try {
      const response = await this.circuitBreaker.execute(
        async () => {
          const res = await this.postWithRetry(postData);
          if (!res.success || (res.statusCode && res.statusCode >= 500)) {
            throw new Error(res.error || `HTTP ${res.statusCode}`);
          }
          return res;
        },
        (breakerError) => {
          return {
            success: false,
            error: breakerError.message,
          };
        },
      );

      if (!response.success || (response.statusCode && response.statusCode >= 400)) {
        this.logger.error(
          `[Msg91SmsDriver] SMS delivery failed for ${maskedPhone}: ${response.error || JSON.stringify(response.data)}`,
        );
        return {
          success: false,
          messageId: '',
          provider: 'msg91',
          error: response.error || `HTTP ${response.statusCode}`,
        };
      }

      const messageId =
        response.data?.message ||
        response.data?.request_id ||
        `msg91-${Date.now()}`;

      this.logger.log(
        `[Msg91SmsDriver] SMS dispatched successfully to ${maskedPhone} (MessageId: ${messageId})`,
      );

      return {
        success: true,
        messageId: String(messageId),
        provider: 'msg91',
        bypassed: false,
      };
    } catch (err: any) {
      this.logger.error(
        `[Msg91SmsDriver] Unexpected error dispatching SMS to ${maskedPhone}: ${err.message}`,
      );
      return {
        success: false,
        messageId: '',
        provider: 'msg91',
        error: err.message,
      };
    }
  }

  private async postWithRetry(postData: string): Promise<HttpResult> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const result = await this.httpRequest(postData);
      if (result.success && result.statusCode && result.statusCode < 400) {
        return result;
      }

      lastError = result.error;
      const retryable = this.isRetryable(result);
      if (!retryable || attempt >= this.maxRetries) {
        return result;
      }

      const exponentialDelay = this.retryBaseDelayMs * 2 ** attempt;
      const cappedDelay = Math.min(this.maxRetryDelayMs, exponentialDelay);
      const jitter = Math.floor(Math.random() * (cappedDelay * 0.5));
      const delay = cappedDelay + jitter;
      this.logger.warn(
        `[Msg91SmsDriver] Retrying MSG91 HTTP request (Attempt ${attempt + 1}/${this.maxRetries}) after ${delay}ms delay...`,
      );
      await new Promise((res) => setTimeout(res, delay));
    }

    return { success: false, error: lastError || 'Max retries exhausted' };
  }

  private isRetryable(result: HttpResult): boolean {
    if (!result.statusCode) {
      return true; // Network errors, timeouts
    }
    return (
      result.statusCode >= 500 ||
      result.statusCode === 408 ||
      result.statusCode === 429
    );
  }

  protected httpRequest(postData: string): Promise<HttpResult> {
    return new Promise((resolve) => {
      const options: https.RequestOptions = {
        hostname: 'control.msg91.com',
        port: 443,
        path: '/api/v5/flow/',
        method: 'POST',
        timeout: this.timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          authkey: this.authKey,
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          const statusCode = res.statusCode || 0;
          let parsedData: any = body;
          try {
            parsedData = JSON.parse(body);
          } catch {
            // raw text response
          }

          if (statusCode >= 200 && statusCode < 300) {
            resolve({ success: true, statusCode, data: parsedData });
          } else {
            resolve({
              success: false,
              statusCode,
              data: parsedData,
              error: `HTTP ${statusCode}: ${typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData)}`,
            });
          }
        });
      });

      req.on('socket', (socket) => {
        socket.setTimeout(this.timeoutMs);
        socket.once('timeout', () => {
          req.destroy(new Error('Socket connect timeout'));
        });
      });

      req.on('error', (err) => {
        req.destroy();
        resolve({ success: false, error: `Network error: ${err.message}` });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Request timed out' });
      });

      req.write(postData);
      req.end();
    });
  }
}
