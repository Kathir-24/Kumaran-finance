import { Role } from '@prisma/client';

export type TokenType = 'access' | 'refresh' | 'totp_pending' | 'mpin_setup' | 'onboarding_restricted';

export interface JwtPayload {
  sub: string;
  phone: string;
  roles: Role[];
  branchId: string | null;
  tokenType: TokenType;
  clientType?: string;
  sid?: string;
  jti?: string;
  issuedAtMs?: number;
  iat?: number;
  exp?: number;
}
