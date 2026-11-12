import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lastValueFrom, of } from 'rxjs';
import {
  BigIntInterceptor,
  serializePrismaPrimitives,
} from '../../src/common/interceptors/bigint.interceptor';

describe('BigIntInterceptor & serializePrismaPrimitives', () => {
  it('converts nested BigInt values and Prisma.Decimal rates into plain JSON numbers', () => {
    const payload = {
      chitValue: 100000n,
      baseInstallment: 5000n,
      foremanCommissionRate: new Prisma.Decimal('4.00'),
      fractionalRate: new Prisma.Decimal('4.25'),
      nested: [
        {
          bidDiscount: 25000n,
          foremanCommissionRate: new Prisma.Decimal('4.00'),
        },
      ],
    };

    const result = serializePrismaPrimitives(payload);

    expect(typeof result.chitValue).toBe('number');
    expect(result.chitValue).toBe(100000);
    expect(result.baseInstallment).toBe(5000);
    expect(typeof result.foremanCommissionRate).toBe('number');
    expect(result.foremanCommissionRate).toBe(4);
    expect(result.fractionalRate).toBe(4.25);
    expect(result.nested[0].bidDiscount).toBe(25000);
    expect(result.nested[0].foremanCommissionRate).toBe(4);
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      chitValue: 100000,
      baseInstallment: 5000,
      foremanCommissionRate: 4,
      fractionalRate: 4.25,
      nested: [
        {
          bidDiscount: 25000,
          foremanCommissionRate: 4,
        },
      ],
    });
  });

  it('preserves Date, Buffer, strings, booleans, nullish values, and circular references safely', () => {
    const now = new Date('2026-11-11T10:00:00.000Z');
    const buf = Buffer.from('ABC');
    const cyclic: Record<string, any> = {
      createdAt: now,
      raw: buf,
      label: '4.00%',
      optional: null,
      amount: 1500n,
    };
    cyclic.self = cyclic;

    const result = serializePrismaPrimitives(cyclic);

    expect(result.createdAt).toBe(now);
    expect(Buffer.isBuffer(result.raw)).toBe(true);
    expect(result.label).toBe('4.00%');
    expect(result.optional).toBeNull();
    expect(result.amount).toBe(1500);
    expect(result.self).toBe(result);
  });

  it('transforms controller Observable payloads inside BigIntInterceptor', async () => {
    const interceptor = new BigIntInterceptor();
    const mockContext = {} as ExecutionContext;
    const mockNext: CallHandler = {
      handle: () =>
        of({
          data: [
            {
              groupCode: 'KCA-1L-20M-01',
              chitValue: 100000n,
              foremanCommissionRate: new Prisma.Decimal('4.00'),
            },
          ],
          total: 1,
        }),
    };

    const output = await lastValueFrom(interceptor.intercept(mockContext, mockNext));

    expect(output.data[0].chitValue).toBe(100000);
    expect(output.data[0].foremanCommissionRate).toBe(4);
    expect(typeof output.data[0].foremanCommissionRate).toBe('number');
  });

  it('does not globally monkey-patch BigInt.prototype.toJSON', () => {
    expect((BigInt.prototype as any).toJSON).toBeUndefined();
    expect(() => JSON.stringify({ chitValue: 100000n })).toThrow(TypeError);
  });
});
