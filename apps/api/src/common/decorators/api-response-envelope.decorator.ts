import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  getSchemaPath,
} from '@nestjs/swagger';

interface EnvelopeOptions {
  description?: string;
  isArray?: boolean;
}

/**
 * Decorates an endpoint returning HTTP 200 wrapped in the standard
 * { success: true, statusCode: 200, timestamp: string, data: T } envelope.
 */
export function ApiOkResponseEnvelope<TModel extends Type<unknown>>(
  model?: TModel,
  options?: EnvelopeOptions,
) {
  const description = options?.description ?? 'Successful response';

  if (!model) {
    return applyDecorators(
      ApiOkResponse({
        description,
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 200 },
            timestamp: { type: 'string', example: '2026-10-22T07:28:14.000Z' },
            data: { type: 'object', nullable: true },
          },
          required: ['success', 'statusCode', 'timestamp', 'data'],
        },
      }),
    );
  }

  const dataSchema = options?.isArray
    ? {
        type: 'array',
        items: { $ref: getSchemaPath(model) },
      }
    : {
        $ref: getSchemaPath(model),
      };

  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: 200 },
          timestamp: { type: 'string', example: '2026-10-22T07:28:14.000Z' },
          data: dataSchema,
        },
        required: ['success', 'statusCode', 'timestamp', 'data'],
      },
    }),
  );
}

/**
 * Decorates an endpoint returning HTTP 201 wrapped in the standard
 * { success: true, statusCode: 201, timestamp: string, data: T } envelope.
 */
export function ApiCreatedResponseEnvelope<TModel extends Type<unknown>>(
  model?: TModel,
  options?: EnvelopeOptions,
) {
  const description = options?.description ?? 'Resource created successfully';

  if (!model) {
    return applyDecorators(
      ApiCreatedResponse({
        description,
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 201 },
            timestamp: { type: 'string', example: '2026-10-22T07:28:14.000Z' },
            data: { type: 'object', nullable: true },
          },
          required: ['success', 'statusCode', 'timestamp', 'data'],
        },
      }),
    );
  }

  const dataSchema = options?.isArray
    ? {
        type: 'array',
        items: { $ref: getSchemaPath(model) },
      }
    : {
        $ref: getSchemaPath(model),
      };

  return applyDecorators(
    ApiExtraModels(model),
    ApiCreatedResponse({
      description,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: 201 },
          timestamp: { type: 'string', example: '2026-10-22T07:28:14.000Z' },
          data: dataSchema,
        },
        required: ['success', 'statusCode', 'timestamp', 'data'],
      },
    }),
  );
}

/**
 * Decorates an endpoint returning a paginated list wrapped in the standard
 * { success: true, statusCode: 200, timestamp: string, data: { data: T[], total, page, limit, totalPages } } envelope.
 */
export function ApiPaginatedResponseEnvelope<TModel extends Type<unknown>>(
  model: TModel,
  options?: { description?: string },
) {
  const description = options?.description ?? 'Paginated list retrieved';

  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: 200 },
          timestamp: { type: 'string', example: '2026-10-22T07:28:14.000Z' },
          data: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
              total: { type: 'number', example: 50 },
              page: { type: 'number', example: 1 },
              limit: { type: 'number', example: 20 },
              totalPages: { type: 'number', example: 3 },
            },
            required: ['data', 'total', 'page', 'limit', 'totalPages'],
          },
        },
        required: ['success', 'statusCode', 'timestamp', 'data'],
      },
    }),
  );
}
