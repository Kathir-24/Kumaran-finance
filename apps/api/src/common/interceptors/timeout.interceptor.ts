import {
  CallHandler,
  ExecutionContext,
  GatewayTimeoutException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { TIMEOUT_KEY } from '../decorators/set-timeout.decorator';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private static readonly DEFAULT_TIMEOUT_MS = 15000; // 15 seconds default

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const customTimeout = this.reflector.getAllAndOverride<number | undefined>(
      TIMEOUT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If custom timeout is explicitly 0 or negative, bypass timeout (e.g. SSE streams)
    if (customTimeout !== undefined && customTimeout <= 0) {
      return next.handle();
    }

    const effectiveTimeoutMs =
      customTimeout ?? TimeoutInterceptor.DEFAULT_TIMEOUT_MS;

    return next.handle().pipe(
      timeout(effectiveTimeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () =>
              new GatewayTimeoutException({
                statusCode: 504,
                message: `Request exceeded processing deadline of ${effectiveTimeoutMs}ms`,
                error: 'GATEWAY_TIMEOUT',
              }),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
