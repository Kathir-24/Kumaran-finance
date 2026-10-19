import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BYPASS_ENVELOPE_KEY } from '../decorators/bypass-envelope.decorator';

export interface StandardSuccessResponse<T> {
  success: true;
  statusCode: number;
  timestamp: string;
  data: T;
}

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, StandardSuccessResponse<T> | T>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardSuccessResponse<T> | T> {
    const isBypassed = this.reflector.getAllAndOverride<boolean>(
      BYPASS_ENVELOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isBypassed) {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        // Prevent double envelopment if already wrapped
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'statusCode' in data &&
          'timestamp' in data &&
          'data' in data
        ) {
          return data;
        }

        const statusCode = response?.statusCode || 200;

        return {
          success: true,
          statusCode,
          timestamp: new Date().toISOString(),
          data: data ?? null,
        };
      }),
    );
  }
}
