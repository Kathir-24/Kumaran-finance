import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Bank-Grade Safety Guard: globally patch BigInt.prototype.toJSON so JSON.stringify never throws on BigInt
if (typeof (BigInt.prototype as any).toJSON !== 'function') {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };
}

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.transform(data, new WeakMap())));
  }

  private transform(value: any, seen: WeakMap<object, any> = new WeakMap()): any {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'bigint') {
      // Safe conversion for whole Rupees (amounts under ₹90,000 Crore fit safely in JS Number.MAX_SAFE_INTEGER)
      return Number(value);
    }
    if (value instanceof Date || Buffer.isBuffer(value)) {
      return value;
    }
    if (typeof value === 'object') {
      if (seen.has(value)) {
        return seen.get(value);
      }

      if (Array.isArray(value)) {
        const transformedArr: any[] = [];
        seen.set(value, transformedArr);
        for (const item of value) {
          transformedArr.push(this.transform(item, seen));
        }
        return transformedArr;
      }

      const transformed: Record<string, any> = {};
      seen.set(value, transformed);
      for (const [key, val] of Object.entries(value)) {
        transformed[key] = this.transform(val, seen);
      }
      return transformed;
    }
    return value;
  }
}
