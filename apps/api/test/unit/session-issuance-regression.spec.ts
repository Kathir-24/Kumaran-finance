import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/auth/auth.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { UserService } from '../../src/user/user.service';

// Stateful storage doubles preserve the exact session rows produced by real token
// issuance. In particular, timestamps and session IDs are never prearranged to pass.
describe('Session issuance, rotation and authorization cache regressions', () => {
  let auth: AuthService;
  let strategy: JwtStrategy;
  let users: UserService;
  let jwt: JwtService;
  let prisma: any;
  let staff: any;
  let customer: any;
  let sessions: Map<string, any>;
  let cache: Map<string, string>;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('ReviewPassword#2026', 4);
  });

  function configure(redisEnabled: boolean) {
    cache = new Map();
    sessions = new Map();
    staff = {
      id: 'staff', phone: '9842100001', name: 'Staff', branchId: 'branch',
      roles: [Role.SUPER_ADMIN], isActive: true, isPartner: true,
      passwordHash, mustChangePassword: false, tokenRevokedBefore: null,
      isTotpEnabled: false,
    };
    customer = {
      id: 'customer', phone: '9842100002', fullName: 'Customer',
      branchId: 'branch', tokenRevokedBefore: null,
    };
    const sessionKey = (args: any) => {
      const where = args.where;
      const key = where.userId_clientType || where.customerId_clientType || where;
      return `${key.userId || key.customerId}:${key.clientType}`;
    };
    prisma = {
      user: {
        findFirst: jest.fn(async () => ({ ...staff })),
        findUnique: jest.fn(async ({ where }) => where.id === staff.id ? { ...staff } : null),
        update: jest.fn(async ({ data }) => Object.assign(staff, data)),
      },
      customer: {
        findUnique: jest.fn(async () => ({ ...customer })),
        update: jest.fn(async ({ data }) => Object.assign(customer, data)),
      },
      session: {
        upsert: jest.fn(async (args) => {
          const key = sessionKey(args);
          const row = sessions.has(key)
            ? { ...sessions.get(key), ...args.update }
            : { ...args.create };
          sessions.set(key, row);
          return row;
        }),
        findUnique: jest.fn(async (args) => sessions.get(sessionKey(args)) ?? null),
        findFirst: jest.fn(async (args) => sessions.get(sessionKey(args)) ?? null),
        updateMany: jest.fn(async ({ where, data }) => {
          let count = 0;
          for (const [key, row] of sessions) {
            const clauses = where.OR || [where];
            if (clauses.some((clause: any) => Object.entries(clause)
              .every(([field, value]) => row[field] === value))) {
              sessions.set(key, { ...row, ...data });
              count++;
            }
          }
          return { count };
        }),
      },
      $transaction: jest.fn(async (action) => action(prisma)),
    };
    const redis = {
      get: jest.fn(async (key: string) => cache.get(key) ?? null),
      set: jest.fn(async (key: string, value: string, ...args: any[]) => {
        if (args.includes('NX') && cache.has(key)) return null;
        cache.set(key, value);
        return 'OK';
      }),
      del: jest.fn(async (...keys: string[]) => {
        keys.forEach((key) => cache.delete(key));
        return 1;
      }),
      eval: jest.fn(async (_script: string, _count: number, key: string, token: string) => {
        if (cache.get(key) !== token) return 0;
        cache.delete(key);
        return 1;
      }),
    };
    const provider: any = redisEnabled
      ? { getClient: () => redis, getIsConnected: () => true }
      : undefined;
    const config = new ConfigService({
      JWT_SECRET: 'session-regression-secret-at-least-32-characters',
      JWT_EXPIRES_IN: '15m', REFRESH_TOKEN_EXPIRES_IN: '7d',
    });
    jwt = new JwtService({ secret: config.get('JWT_SECRET') });
    auth = new AuthService(prisma, jwt, config, {} as any, provider);
    strategy = new JwtStrategy(config, prisma, provider);
    users = new UserService(prisma, provider);
  }

  function issue(kind: 'staff' | 'customer', family = 'WEB'): Promise<any> {
    return kind === 'staff'
      ? auth.login({ phone: staff.phone, password: 'ReviewPassword#2026', clientType: family as any })
      : (auth as any).generateCustomerAuthTokens(customer, family);
  }

  for (const kind of ['staff', 'customer'] as const) {
    for (const redisEnabled of [false, true]) {
      it(`${kind}: immediate validation, refresh and replacement login (${redisEnabled ? 'warm Redis' : 'no Redis'})`, async () => {
        configure(redisEnabled);
        const first = await issue(kind);
        const firstPayload = jwt.verify(first.accessToken);
        const row = sessions.get(`${kind}:WEB`);
        expect(row.createdAt.getTime()).toBe(firstPayload.issuedAtMs);
        await expect(strategy.validate({ ...firstPayload })).resolves.toMatchObject({ sub: kind });

        const rotated: any = await auth.refreshToken({ refreshToken: first.refreshToken, clientType: 'WEB' });
        const rotatedPayload = jwt.verify(rotated.accessToken);
        expect(rotatedPayload.sid).toBe(firstPayload.sid);
        expect(rotated.refreshToken).not.toBe(first.refreshToken);
        expect(sessions.get(`${kind}:WEB`).createdAt).toEqual(row.createdAt);
        await expect(strategy.validate({ ...rotatedPayload })).resolves.toMatchObject({ sub: kind });
        await expect(strategy.validate({ ...firstPayload })).resolves.toMatchObject({ sub: kind });

        const mobile = await issue(kind, 'MOBILE');
        const replacement = await issue(kind);
        expect(jwt.verify(replacement.accessToken).sid).not.toBe(firstPayload.sid);
        await expect(strategy.validate(jwt.verify(replacement.accessToken))).resolves.toMatchObject({ sub: kind });
        await expect(strategy.validate({ ...firstPayload })).rejects.toThrow('superseded');
        await expect(strategy.validate(jwt.verify(mobile.accessToken))).resolves.toMatchObject({ sub: kind });
      });
    }
  }

  for (const mutation of ['reset', 'roles', 'deactivate', 'reactivate'] as const) {
    it(`${mutation} clears legacy and every family authorization cache`, async () => {
      configure(true);
      const keys = ['user:status:staff', ...['WEB', 'MOBILE', 'DESKTOP']
        .map((family) => `user:status:staff:${family}`)];
      keys.forEach((key) => cache.set(key, 'stale-authorization'));
      if (mutation === 'reset') {
        await users.resetPassword('staff', {}, 'another-admin');
      } else if (mutation === 'roles') {
        await users.updateRoles('staff', { roles: [Role.ACCOUNTANT] }, 'another-admin');
      } else {
        await users.updateStatus('staff', { isActive: mutation === 'reactivate' }, 'another-admin');
      }
      keys.forEach((key) => expect(cache.has(key)).toBe(false));
    });
  }

  for (const kind of ['staff', 'customer'] as const) {
    for (const action of ['logout', 'replacement'] as const) {
      it(`${kind}: in-flight refresh cannot undo ${action}`, async () => {
        configure(false);
        const initial = await issue(kind);
        // Race after refresh has read/verified the old session, before it writes.
        jest.spyOn(auth as any, 'hashRefreshToken').mockImplementationOnce(async () => {
          if (action === 'logout') await auth.logout(kind, 'WEB');
          else await issue(kind);
          return 'hash-from-losing-refresh';
        });
        await expect(auth.refreshToken({
          refreshToken: initial.refreshToken, clientType: 'WEB',
        })).rejects.toThrow('Session changed while refreshing');
        const row = sessions.get(`${kind}:WEB`);
        if (action === 'logout') {
          expect(row.revokedAt).toBeInstanceOf(Date);
          expect(row.refreshTokenHash).toBeNull();
        } else {
          expect(row.id).not.toBe(jwt.verify(initial.refreshToken).sid);
          expect(row.refreshTokenHash).not.toBe('hash-from-losing-refresh');
        }
      });
    }
  }
});
