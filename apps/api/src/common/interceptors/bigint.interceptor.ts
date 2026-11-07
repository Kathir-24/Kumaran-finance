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
    return next.handle().pipe(map((data) => this.transform(data, new WeakSet())));
  }

  private transform(value: any, seen: WeakSet<object>): any {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'bigint') {
      return Number(value);
    }
    if (typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) {
      return value;
    }
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'bigint') {
          value[i] = Number(item);
        } else if (typeof item === 'object' && item !== null) {
          this.transform(item, seen);
        }
      }
      return value;
    }

    for (const key of Object.keys(value)) {
      const val = value[key];
      if (typeof val === 'bigint') {
        value[key] = Number(val);
      } else if (typeof val === 'object' && val !== null) {
        this.transform(val, seen);
      }
    }
    return value;
  }
}
