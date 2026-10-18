// ==============================================================================
// Kumaran Chits — Environment Configuration Validator
// Company: Kumaran Finance (Perundurai, Erode, Tamil Nadu)
// Fails fast at startup if critical production variables are missing
// ==============================================================================

export interface EnvironmentVariables {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  API_PREFIX: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_IN: string;
  DEFAULT_FOREMAN_COMMISSION_PERCENT: number;
  PRIMARY_BRANCH_CODE: string;
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

  const validEnvironments = ['development', 'production', 'test'];
  const nodeEnv = (config.NODE_ENV as string) ?? 'development';
  if (!validEnvironments.includes(nodeEnv)) {
    errors.push(`Invalid NODE_ENV: ${nodeEnv}. Must be one of: ${validEnvironments.join(', ')}`);
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
    NODE_ENV: nodeEnv as 'development' | 'production' | 'test',
    API_PREFIX: (config.API_PREFIX as string) ?? 'api/v1',
    DATABASE_URL: config.DATABASE_URL as string,
    JWT_SECRET: config.JWT_SECRET as string,
    JWT_EXPIRES_IN: (config.JWT_EXPIRES_IN as string) ?? '15m',
    REFRESH_TOKEN_EXPIRES_IN: (config.REFRESH_TOKEN_EXPIRES_IN as string) ?? '7d',
    DEFAULT_FOREMAN_COMMISSION_PERCENT: Number(config.DEFAULT_FOREMAN_COMMISSION_PERCENT ?? 4.0),
    PRIMARY_BRANCH_CODE: (config.PRIMARY_BRANCH_CODE as string) ?? 'PRD',
  };
}
