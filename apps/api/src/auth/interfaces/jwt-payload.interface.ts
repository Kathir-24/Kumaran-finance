import { Role } from '@prisma/client';

export type TokenType = 'access' | 'refresh' | 'totp_pending';

export interface JwtPayload {
  sub: string;
  phone: string;
  email: string | null;
  roles: Role[];
  branchId: string | null;
  tokenType: TokenType;
  iat?: number;
  exp?: number;
}
