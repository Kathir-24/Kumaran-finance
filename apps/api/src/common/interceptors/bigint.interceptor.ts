import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.transform(data, new WeakSet())));
  }

  private transform(value: any, seen: WeakSet<object> = new WeakSet()): any {
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
        return value;
      }
      seen.add(value);

      if (Array.isArray(value)) {
        return value.map((item) => this.transform(item, seen));
      }
      const transformed: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        transformed[key] = this.transform(val, seen);
      }
      return transformed;
    }
    return value;
  }
}
