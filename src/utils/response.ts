/**
 * ============================================
 * API RESPONSE HELPERS
 * ============================================
 *
 * Standardized response format for all API endpoints.
 * Ensures consistent structure across the application.
 *
 * Response Format:
 * {
 *   success: boolean,
 *   message: string,
 *   data?: T,
 *   errors?: ValidationError[],
 *   pagination?: PaginationMeta
 * }
 *
 * @file src/utils/response.ts
 */

import type { Response } from 'express';

/**
 * Pagination metadata structure
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Standard success response structure
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  message: string;
  data?: T;
  pagination?: PaginationMeta;
}

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  success: false;
  message: string;
  errors?: Array<{
    field?: string;
    message: string;
    value?: unknown;
  }>;
  code?: string;
}

/**
 * Send a success response
 *
 * @example
 * sendSuccess(res, 'User created successfully', { user }, 201);
 */
export function sendSuccess<T>(
  res: Response,
  message: string,
  data?: T,
  statusCode: number = 200
): Response {
  const response: SuccessResponse<T> = {
    success: true,
    message,
  };

  if (data !== undefined) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
}

/**
 * Send a success response with pagination
 *
 * @example
 * sendPaginatedSuccess(res, 'Products retrieved', products, {
 *   page: 1, limit: 20, total: 100, totalPages: 5
 * });
 */
export function sendPaginatedSuccess<T>(
  res: Response,
  message: string,
  data: T,
  pagination: Omit<PaginationMeta, 'hasNextPage' | 'hasPrevPage'>
): Response {
  const paginationMeta: PaginationMeta = {
    ...pagination,
    totalPages: Math.ceil(pagination.total / pagination.limit),
    hasNextPage: pagination.page < Math.ceil(pagination.total / pagination.limit),
    hasPrevPage: pagination.page > 1,
  };

  const response: SuccessResponse<T> = {
    success: true,
    message,
    data,
    pagination: paginationMeta,
  };

  return res.status(200).json(response);
}

/**
 * Send an error response
 *
 * @example
 * sendError(res, 'Validation failed', 400, validationErrors);
 */
export function sendError(
  res: Response,
  message: string,
  statusCode: number = 500,
  errors?: Array<{ field?: string; message: string; value?: unknown }>,
  code?: string
): Response {
  const response: ErrorResponse = {
    success: false,
    message,
  };

  if (errors && errors.length > 0) {
    response.errors = errors;
  }

  if (code) {
    response.code = code;
  }

  return res.status(statusCode).json(response);
}

/**
 * Send a 201 Created response
 */
export function sendCreated<T>(
  res: Response,
  message: string,
  data?: T
): Response {
  return sendSuccess(res, message, data, 201);
}

/**
 * Send a 204 No Content response
 */
export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

/**
 * Send a 400 Bad Request response
 */
export function sendBadRequest(
  res: Response,
  message: string = 'Bad request',
  errors?: Array<{ field?: string; message: string }>
): Response {
  return sendError(res, message, 400, errors);
}

/**
 * Send a 401 Unauthorized response
 */
export function sendUnauthorized(
  res: Response,
  message: string = 'Unauthorized'
): Response {
  return sendError(res, message, 401);
}

/**
 * Send a 403 Forbidden response
 */
export function sendForbidden(
  res: Response,
  message: string = 'Forbidden'
): Response {
  return sendError(res, message, 403);
}

/**
 * Send a 404 Not Found response
 */
export function sendNotFound(
  res: Response,
  resource: string = 'Resource'
): Response {
  return sendError(res, `${resource} not found`, 404);
}

/**
 * Send a 409 Conflict response
 */
export function sendConflict(
  res: Response,
  message: string = 'Resource already exists'
): Response {
  return sendError(res, message, 409);
}

/**
 * Send a 422 Validation Error response
 */
export function sendValidationError(
  res: Response,
  errors: Array<{ field: string; message: string; value?: unknown }>,
  message: string = 'Validation failed'
): Response {
  return sendError(res, message, 422, errors);
}

/**
 * Send a 429 Rate Limit response
 */
export function sendRateLimited(
  res: Response,
  retryAfter: number = 60
): Response {
  res.setHeader('Retry-After', retryAfter);
  return sendError(res, 'Too many requests, please try again later', 429);
}

/**
 * Send a 500 Internal Server Error response
 */
export function sendInternalError(
  res: Response,
  message: string = 'Internal server error'
): Response {
  return sendError(res, message, 500);
}

/**
 * Send a 503 Service Unavailable response
 */
export function sendServiceUnavailable(
  res: Response,
  message: string = 'Service temporarily unavailable'
): Response {
  return sendError(res, message, 503);
}

/**
 * Calculate pagination metadata
 *
 * @example
 * const pagination = calculatePagination(1, 20, 100);
 * // { page: 1, limit: 20, total: 100, totalPages: 5, hasNextPage: true, hasPrevPage: false }
 */
export function calculatePagination(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Parse pagination query parameters with defaults
 *
 * @example
 * const { page, limit, skip } = parsePaginationQuery(req.query);
 */
export function parsePaginationQuery(
  query: Record<string, unknown>,
  defaults: { page?: number; limit?: number; maxLimit?: number } = {}
): { page: number; limit: number; skip: number } {
  const { page: defaultPage = 1, limit: defaultLimit = 20, maxLimit = 100 } = defaults;

  let page = Number(query.page) || defaultPage;
  let limit = Number(query.limit) || defaultLimit;

  // Ensure positive values
  page = Math.max(1, page);
  limit = Math.max(1, Math.min(limit, maxLimit));

  const skip = (page - 1) * limit;

  return { page, limit, skip };
}
