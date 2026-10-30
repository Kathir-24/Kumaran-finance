import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Response } from 'express';
import { captureSentryException, isSentryActive } from '../sentry/sentry.config';

export interface StandardErrorResponse {
  success: false;
  statusCode: number;
  timestamp: string;
  error: {
    code: string;
    message: string;
    details: any[];
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected internal error occurred';
    let details: any[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        code = this.normalizeErrorCode(exception.name);
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        const rawCode = resObj.error || resObj.code || exception.name;
        code = this.normalizeErrorCode(rawCode);

        if (Array.isArray(resObj.message)) {
          details = resObj.message;
          message = details[0] || 'Validation failed';
        } else {
          message = resObj.message || exception.message;
        }
      }
    } else if (exception instanceof Error) {
      if (exception.message.includes('not allowed by CORS')) {
        this.logger.warn(`CORS security policy blocked unauthorized request: ${exception.message}`);
      } else {
        this.logger.error(
          `Unhandled Internal Error: ${exception.message}`,
          exception.stack,
        );
      }
    } else {
      this.logger.error('Unknown exception caught', exception);
    }

    // Capture unhandled server-side errors to Sentry (excludes expected 4xx client errors)
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.captureSentryError(exception, host, status, code);
    }

    const payload: StandardErrorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      error: {
        code,
        message,
        details,
      },
    };

    response.status(status).json(payload);
  }

  /**
   * Safe Sentry exception capture with request and staff context
   */
  private captureSentryError(
    exception: unknown,
    host: ArgumentsHost,
    status: number,
    code: string,
  ): void {
    if (!isSentryActive()) {
      return;
    }

    try {
      const ctx = host.switchToHttp();
      const req = ctx.getRequest<any>();

      Sentry.withScope((scope) => {
        scope.setTag('statusCode', String(status));
        scope.setTag('errorCode', code);

        if (req) {
          if (req.method) scope.setTag('httpMethod', req.method);
          if (req.originalUrl || req.url) scope.setTag('url', req.originalUrl || req.url);

          if (req.user) {
            scope.setUser({
              id: req.user.id,
              ...(req.user.roles
                ? { roles: Array.isArray(req.user.roles) ? req.user.roles.join(',') : String(req.user.roles) }
                : {}),
              ...(req.user.branchId ? { branchId: req.user.branchId } : {}),
            });
          }

          if (req.headers && req.headers['x-request-id']) {
            scope.setTag('requestId', String(req.headers['x-request-id']));
          }
        }

        captureSentryException(exception);
      });
    } catch {
      // Safe non-blocking guarantee: Sentry capture failure must never crash the response filter
    }
  }

  /**
   * Normalizes code strings into UPPER_SNAKE_CASE (e.g. 'Bad Request' -> 'BAD_REQUEST')
   */
  private normalizeErrorCode(rawCode: string): string {
    return rawCode
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toUpperCase();
  }
}
