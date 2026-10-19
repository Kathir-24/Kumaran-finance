import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

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
      this.logger.error(
        `Unhandled Internal Error: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error('Unknown exception caught', exception);
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
   * Normalizes code strings into UPPER_SNAKE_CASE (e.g. 'Bad Request' -> 'BAD_REQUEST')
   */
  private normalizeErrorCode(rawCode: string): string {
    return rawCode
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toUpperCase();
  }
}
