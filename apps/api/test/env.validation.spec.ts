import { validateEnv } from '../src/config/env.validation';

describe('Environment Configuration Validation (validateEnv)', () => {
  const baseValidDevConfig = {
    PORT: '3000',
    NODE_ENV: 'development',
    API_PREFIX: 'api/v1',
    DATABASE_URL: 'postgresql://chitflow:chitflow_dev@localhost:5433/chitflow_dev',
    JWT_SECRET: 'dev-secret-key-at-least-32-characters-long',
    STORAGE_DRIVER: 'local',
    LOCAL_STORAGE_PATH: './storage/uploads',
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: '6379',
    DEFAULT_FOREMAN_COMMISSION_PERCENT: '4.00',
    PRIMARY_BRANCH_CODE: 'PRD',
  };

  const baseValidProdConfig = {
    PORT: '3000',
    NODE_ENV: 'production',
    API_PREFIX: 'api/v1',
    DATABASE_URL: 'postgresql://chitflow:secure_pass@db:5432/chitflow_prod',
    JWT_SECRET: 'prod-secure-random-cryptographic-key-minimum-32-characters',
    BULL_BOARD_PASSWORD: 'custom_strong_bull_password',
    METRICS_PASSWORD: 'custom_strong_metrics_password',
    STORAGE_DRIVER: 's3',
    S3_BUCKET: 'kumaran-chits-private',
    S3_ACCESS_KEY_ID: 'valid-s3-access-key-id',
    S3_SECRET_ACCESS_KEY: 'valid-s3-secret-access-key',
    S3_REGION: 'ap-south-1',
    REDIS_HOST: 'redis',
    REDIS_PORT: '6379',
    DEFAULT_FOREMAN_COMMISSION_PERCENT: '4.00',
    PRIMARY_BRANCH_CODE: 'PRD',
  };

  it('passes validation for valid development configuration with local storage', () => {
    expect(() => validateEnv(baseValidDevConfig)).not.toThrow();
  });

  it('passes validation for valid production configuration with S3 storage', () => {
    expect(() => validateEnv(baseValidProdConfig)).not.toThrow();
  });

  it('strictly rejects STORAGE_DRIVER=local when NODE_ENV is production', () => {
    const invalidProd = {
      ...baseValidProdConfig,
      STORAGE_DRIVER: 'local',
    };

    expect(() => validateEnv(invalidProd)).toThrow(
      /STORAGE_DRIVER must be set to 's3' with dedicated object storage/i,
    );
  });

  it('rejects STORAGE_DRIVER=s3 if S3 credentials or bucket are missing', () => {
    const missingBucketProd = {
      ...baseValidProdConfig,
      S3_BUCKET: undefined,
    };

    expect(() => validateEnv(missingBucketProd)).toThrow(/Missing mandatory S3 variable/i);
  });

  it('rejects short or insecure JWT_SECRET in production', () => {
    const weakJwtProd = {
      ...baseValidProdConfig,
      JWT_SECRET: 'short_key',
    };

    expect(() => validateEnv(weakJwtProd)).toThrow(/minimum 32 characters/i);
  });
});
