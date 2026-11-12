// ==============================================================================
// Kumaran Chits — Environment Configuration Validator
// Company: Kumaran Finance (Perundurai, Erode, Tamil Nadu)
// Fails fast at startup if critical production variables are missing
// ==============================================================================

import { parseTrustProxySetting } from '../common/context/proxy-ip.util';

export interface EnvironmentVariables {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test' | 'staging';
  API_PREFIX: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_IN: string;
  CORS_ALLOWED_ORIGINS?: string;
  TRUST_PROXY?: string;
  DEFAULT_FOREMAN_COMMISSION_PERCENT: number;
  PRIMARY_BRANCH_CODE: string;
  STORAGE_DRIVER: 'local' | 's3';
  LOCAL_STORAGE_PATH: string;
  S3_REGION: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_BUCKET?: string;
  S3_ENDPOINT?: string;
  S3_FORCE_PATH_STYLE?: boolean;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_DB: number;
  BULL_BOARD_USER?: string;
  BULL_BOARD_PASSWORD?: string;
  METRICS_USER?: string;
  METRICS_PASSWORD?: string;
  SMS_DRIVER?: 'mock' | 'msg91';
  SMS_SENDER_ID?: string;
  MSG91_AUTH_KEY?: string;
  MSG91_DLT_TE_ID?: string;
  MSG91_DLT_OTP_TEMPLATE_ID?: string;
  MSG91_DLT_RECEIPT_TEMPLATE_ID?: string;
  MSG91_DLT_AUCTION_TEMPLATE_ID?: string;
  MSG91_DLT_DEFAULT_TEMPLATE_ID?: string;
  SMS_MAX_RETRIES?: number;
  SMS_RETRY_BASE_DELAY_MS?: number;
  SMS_REQUEST_TIMEOUT_MS?: number;
  MAX_DAILY_OTP_REQUESTS?: number;
  PUSH_DRIVER?: 'mock' | 'firebase';
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_TRACES_SAMPLE_RATE?: number;
  COMPANY_UPI_VPA?: string;
  COMPANY_UPI_NAME?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const errors: string[] = [];

  const requiredStringVars = ['DATABASE_URL', 'JWT_SECRET'];
  for (const varName of requiredStringVars) {
    if (!config[varName] || typeof config[varName] !== 'string') {
      errors.push(`Missing mandatory environment variable: ${varName}`);
    }
  }

  const port = Number(config.PORT ?? 3000);
  if (isNaN(port) || port <= 0 || port > 65535) {
    errors.push(`Invalid PORT number: ${String(config.PORT)}`);
  }

  const validEnvironments = ['development', 'production', 'test', 'staging'];
  const nodeEnv = (config.NODE_ENV as string) ?? 'development';
  if (!validEnvironments.includes(nodeEnv)) {
    errors.push(`Invalid NODE_ENV: ${nodeEnv}. Must be one of: ${validEnvironments.join(', ')}`);
  }

  const storageDriver = (config.STORAGE_DRIVER as string) ?? 'local';
  if (storageDriver !== 'local' && storageDriver !== 's3') {
    errors.push(`Invalid STORAGE_DRIVER: ${storageDriver}. Must be 'local' or 's3'`);
  }

  const s3Bucket = config.S3_BUCKET as string | undefined;
  const s3AccessKeyId = config.S3_ACCESS_KEY_ID as string | undefined;
  const s3SecretAccessKey = config.S3_SECRET_ACCESS_KEY as string | undefined;
  const s3Region = (config.S3_REGION ?? 'ap-south-1') as string;
  const s3Endpoint = config.S3_ENDPOINT as string | undefined;
  const rawForcePathStyle = config.S3_FORCE_PATH_STYLE;
  const s3ForcePathStyle =
    rawForcePathStyle !== undefined
      ? rawForcePathStyle === 'true' || rawForcePathStyle === true
      : undefined;

  if (storageDriver === 's3') {
    if (!s3Bucket) {
      errors.push("Missing mandatory S3 variable when STORAGE_DRIVER is 's3': S3_BUCKET");
    }
    if (!s3AccessKeyId) {
      errors.push("Missing mandatory S3 variable when STORAGE_DRIVER is 's3': S3_ACCESS_KEY_ID");
    }
    if (!s3SecretAccessKey) {
      errors.push("Missing mandatory S3 variable when STORAGE_DRIVER is 's3': S3_SECRET_ACCESS_KEY");
    }
  }

  const smsDriver = (config.SMS_DRIVER as string) ?? 'mock';
  if (smsDriver !== 'mock' && smsDriver !== 'msg91') {
    errors.push(`Invalid SMS_DRIVER: ${smsDriver}. Must be 'mock' or 'msg91'`);
  }
  if (smsDriver === 'msg91' && !config.MSG91_AUTH_KEY) {
    errors.push("Missing mandatory MSG91 variable when SMS_DRIVER is 'msg91': MSG91_AUTH_KEY");
  }

  const redisDb =
    config.REDIS_DB !== undefined && config.REDIS_DB !== ''
      ? Number(config.REDIS_DB)
      : 0;
  if (!Number.isInteger(redisDb) || redisDb < 0 || redisDb > 15) {
    errors.push(
      `Invalid REDIS_DB: ${String(config.REDIS_DB)}. Must be an integer between 0 and 15`,
    );
  }

  const tracesRate =
    config.SENTRY_TRACES_SAMPLE_RATE !== undefined
      ? Number(config.SENTRY_TRACES_SAMPLE_RATE)
      : undefined;
  if (tracesRate !== undefined && (isNaN(tracesRate) || tracesRate < 0 || tracesRate > 1)) {
    errors.push(
      `Invalid SENTRY_TRACES_SAMPLE_RATE: ${String(config.SENTRY_TRACES_SAMPLE_RATE)}. Must be between 0.0 and 1.0`,
    );
  }

  const rawTrustProxy = config.TRUST_PROXY;
  if (rawTrustProxy !== undefined && typeof rawTrustProxy !== 'string') {
    errors.push('Invalid TRUST_PROXY: must be a string value when provided');
  } else if (typeof rawTrustProxy === 'string') {
    try {
      parseTrustProxySetting(rawTrustProxy);
    } catch (err: any) {
      errors.push(err?.message || 'Invalid TRUST_PROXY configuration');
    }
  }

  // Production Strict Password & Secret Hardening
  if (nodeEnv === 'production') {
    if (storageDriver !== 's3') {
      errors.push(
        "In production, STORAGE_DRIVER must be set to 's3' with dedicated object storage to prevent local disk fragmentation across horizontal instances",
      );
    }

    const jwtSecret = (config.JWT_SECRET as string) || '';
    if (
      jwtSecret.includes('replace-with-a-secure-random') ||
      jwtSecret.length < 32
    ) {
      errors.push(
        'In production, JWT_SECRET must be a cryptographically secure random secret (minimum 32 characters)',
      );
    }

    const bullPass = config.BULL_BOARD_PASSWORD as string | undefined;
    if (bullPass === 'chitflow_secret') {
      errors.push(
        'In production, BULL_BOARD_PASSWORD cannot use the insecure default "chitflow_secret"',
      );
    }

    const metricsPass = config.METRICS_PASSWORD as string | undefined;
    if (metricsPass === 'chitflow_secret') {
      errors.push(
        'In production, METRICS_PASSWORD cannot use the insecure default "chitflow_secret"',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `\n❌ ENVIRONMENT CONFIGURATION ERROR:\n` +
        errors.map((err) => `  - ${err}`).join('\n') +
        `\nPlease check your .env file in apps/api/ against .env.example.\n`,
    );
  }

  return {
    PORT: port,
    NODE_ENV: nodeEnv as 'development' | 'production' | 'test' | 'staging',
    API_PREFIX: (config.API_PREFIX as string) ?? 'api/v1',
    DATABASE_URL: config.DATABASE_URL as string,
    JWT_SECRET: config.JWT_SECRET as string,
    JWT_EXPIRES_IN: (config.JWT_EXPIRES_IN as string) ?? '15m',
    REFRESH_TOKEN_EXPIRES_IN: (config.REFRESH_TOKEN_EXPIRES_IN as string) ?? '7d',
    CORS_ALLOWED_ORIGINS:
      (config.CORS_ALLOWED_ORIGINS as string | undefined) ??
      (config.CORS_ORIGINS as string | undefined),
    TRUST_PROXY:
      typeof rawTrustProxy === 'string' && rawTrustProxy.trim().length > 0
        ? rawTrustProxy.trim()
        : undefined,
    DEFAULT_FOREMAN_COMMISSION_PERCENT: Number(config.DEFAULT_FOREMAN_COMMISSION_PERCENT ?? 4.0),
    PRIMARY_BRANCH_CODE: (config.PRIMARY_BRANCH_CODE as string) ?? 'PRD',
    STORAGE_DRIVER: storageDriver as 'local' | 's3',
    LOCAL_STORAGE_PATH: (config.LOCAL_STORAGE_PATH as string) ?? './storage/uploads',
    S3_REGION: s3Region,
    S3_ACCESS_KEY_ID: s3AccessKeyId,
    S3_SECRET_ACCESS_KEY: s3SecretAccessKey,
    S3_BUCKET: s3Bucket,
    S3_ENDPOINT: s3Endpoint,
    S3_FORCE_PATH_STYLE: s3ForcePathStyle,
    REDIS_HOST: (config.REDIS_HOST as string) ?? '127.0.0.1',
    REDIS_PORT: Number(config.REDIS_PORT ?? 6379),
    REDIS_DB: redisDb,
    BULL_BOARD_USER: (config.BULL_BOARD_USER as string) ?? 'admin',
    BULL_BOARD_PASSWORD: (config.BULL_BOARD_PASSWORD as string) ?? 'chitflow_secret',
    METRICS_USER: (config.METRICS_USER as string) ?? (config.BULL_BOARD_USER as string) ?? 'admin',
    METRICS_PASSWORD: (config.METRICS_PASSWORD as string) ?? (config.BULL_BOARD_PASSWORD as string) ?? 'chitflow_secret',
    SMS_DRIVER: smsDriver as 'mock' | 'msg91',
    SMS_SENDER_ID: (config.SMS_SENDER_ID as string) ?? 'KMRCHT',
    MSG91_AUTH_KEY: config.MSG91_AUTH_KEY as string | undefined,
    MSG91_DLT_TE_ID: config.MSG91_DLT_TE_ID as string | undefined,
    MSG91_DLT_OTP_TEMPLATE_ID: config.MSG91_DLT_OTP_TEMPLATE_ID as string | undefined,
    MSG91_DLT_RECEIPT_TEMPLATE_ID: config.MSG91_DLT_RECEIPT_TEMPLATE_ID as string | undefined,
    MSG91_DLT_AUCTION_TEMPLATE_ID: config.MSG91_DLT_AUCTION_TEMPLATE_ID as string | undefined,
    MSG91_DLT_DEFAULT_TEMPLATE_ID: config.MSG91_DLT_DEFAULT_TEMPLATE_ID as string | undefined,
    SMS_MAX_RETRIES: config.SMS_MAX_RETRIES !== undefined ? Number(config.SMS_MAX_RETRIES) : 2,
    SMS_RETRY_BASE_DELAY_MS: config.SMS_RETRY_BASE_DELAY_MS !== undefined ? Number(config.SMS_RETRY_BASE_DELAY_MS) : 400,
    SMS_REQUEST_TIMEOUT_MS: config.SMS_REQUEST_TIMEOUT_MS !== undefined ? Number(config.SMS_REQUEST_TIMEOUT_MS) : 5000,
    MAX_DAILY_OTP_REQUESTS: config.MAX_DAILY_OTP_REQUESTS !== undefined ? Number(config.MAX_DAILY_OTP_REQUESTS) : 5,
    PUSH_DRIVER: (config.PUSH_DRIVER as string) as 'mock' | 'firebase' | undefined,
    FIREBASE_PROJECT_ID: config.FIREBASE_PROJECT_ID as string | undefined,
    FIREBASE_CLIENT_EMAIL: config.FIREBASE_CLIENT_EMAIL as string | undefined,
    FIREBASE_PRIVATE_KEY: config.FIREBASE_PRIVATE_KEY as string | undefined,
    SENTRY_DSN: config.SENTRY_DSN as string | undefined,
    SENTRY_ENVIRONMENT: (config.SENTRY_ENVIRONMENT as string) ?? nodeEnv,
    SENTRY_TRACES_SAMPLE_RATE: tracesRate,
    COMPANY_UPI_VPA: (config.COMPANY_UPI_VPA as string) ?? 'kumaranfinance@kvb',
    COMPANY_UPI_NAME: (config.COMPANY_UPI_NAME as string) ?? 'Kumaran Finance',
  };
}
