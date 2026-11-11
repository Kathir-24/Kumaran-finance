import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Bank-Grade Safety Guard: globally patch BigInt.prototype.toJSON so JSON.stringify never throws on BigInt
if (typeof (BigInt.prototype as any).toJSON !== 'function') {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };
}

/**
 * Checks whether a runtime value is a Prisma Decimal instance (e.g. Decimal(5, 2) rate columns).
 * Rate columns are serialized as JSON numbers matching OpenAPI / Flutter DTO contracts.
 */
function isPrismaDecimal(value: unknown): value is Prisma.Decimal {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (typeof Prisma?.Decimal?.isDecimal === 'function' && Prisma.Decimal.isDecimal(value)) {
    return true;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.toNumber === 'function' &&
    typeof candidate.s === 'number' &&
    typeof candidate.e === 'number' &&
    Array.isArray(candidate.d)
  );
}

/**
 * In-place, zero-allocation serializer for Prisma BigInt and Decimal values.
 * Converts 64-bit BigInt rupee amounts and Prisma Decimal percentage rates into finite JS numbers
 * while guarding against circular object references.
 */
export function serializePrismaPrimitives<T>(
  value: T,
  seen: WeakSet<object> = new WeakSet(),
): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value) as unknown as T;
  }
  if (isPrismaDecimal(value)) {
    return value.toNumber() as unknown as T;
  }
  if (typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) {
    return value;
  }
  if (seen.has(value as object)) {
    return value;
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item === 'bigint') {
        value[i] = Number(item);
      } else if (isPrismaDecimal(item)) {
        value[i] = item.toNumber();
      } else if (typeof item === 'object' && item !== null) {
        serializePrismaPrimitives(item, seen);
      }
    }
    return value;
  }

  const record = value as Record<string, any>;
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (typeof val === 'bigint') {
      record[key] = Number(val);
    } else if (isPrismaDecimal(val)) {
      record[key] = val.toNumber();
    } else if (typeof val === 'object' && val !== null) {
      serializePrismaPrimitives(val, seen);
    }
  }
  return value;
}

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => serializePrismaPrimitives(data)));
  }
}
