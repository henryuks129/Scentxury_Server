/**
 * ============================================
 * CUSTOM ERROR CLASSES
 * ============================================
 *
 * Standardized error classes for consistent API error handling.
 * All errors extend AppError which includes:
 * - HTTP status code
 * - Operational flag (expected vs programming errors)
 * - Serializable error details
 *
 * @file src/utils/errors.ts
 */

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: string;
  public readonly isOperational: boolean;
  public readonly code?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    isOperational: boolean = true
  ) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = isOperational;
    this.code = code;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);

    // Set prototype explicitly for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Serialize error for API response
   */
  toJSON() {
    return {
      success: false,
      status: this.status,
      statusCode: this.statusCode,
      message: this.message,
      ...(this.code && { code: this.code }),
    };
  }
}

/**
 * 400 Bad Request - Invalid input data
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', code?: string) {
    super(message, 400, code);
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', code?: string) {
    super(message, 401, code);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', code?: string) {
    super(message, 403, code);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends AppError {
  public readonly resource: string;

  constructor(resource: string = 'Resource', code?: string) {
    super(`${resource} not found`, 404, code);
    this.resource = resource;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * 409 Conflict - Resource already exists
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists', code?: string) {
    super(message, 409, code);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * 422 Unprocessable Entity - Validation error
 */
export class ValidationError extends AppError {
  public readonly errors: ValidationFieldError[];

  constructor(
    message: string = 'Validation failed',
    errors: ValidationFieldError[] = [],
    code?: string
  ) {
    super(message, 422, code);
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }
}

export interface ValidationFieldError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60, code?: string) {
    super('Too many requests, please try again later', 429, code);
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * 500 Internal Server Error - Unexpected error
 */
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error', code?: string) {
    super(message, 500, code, false);
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export class ServiceUnavailableError extends AppError {
  public readonly service: string;

  constructor(service: string = 'Service', code?: string) {
    super(`${service} is temporarily unavailable`, 503, code);
    this.service = service;
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

/**
 * Database-specific errors
 */
export class DatabaseError extends AppError {
  constructor(message: string = 'Database error', code?: string) {
    super(message, 500, code, false);
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * Payment-related errors
 */
export class PaymentError extends AppError {
  public readonly provider: string;

  constructor(
    message: string = 'Payment failed',
    provider: string = 'unknown',
    code?: string
  ) {
    super(message, 402, code);
    this.provider = provider;
    Object.setPrototypeOf(this, PaymentError.prototype);
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      provider: this.provider,
    };
  }
}

/**
 * External service errors (Cloudinary, Mapbox, etc.)
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(
    service: string,
    message: string = 'External service error',
    code?: string
  ) {
    super(message, 502, code);
    this.service = service;
    Object.setPrototypeOf(this, ExternalServiceError.prototype);
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      service: this.service,
    };
  }
}

/**
 * Check if error is operational (expected) or programming error
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Error codes for client-side handling
 */
export const ErrorCodes = {
  // Authentication
  INVALID_CREDENTIALS: 'AUTH_001',
  TOKEN_EXPIRED: 'AUTH_002',
  TOKEN_INVALID: 'AUTH_003',
  NOT_AUTHENTICATED: 'AUTH_004',
  NOT_AUTHORIZED: 'AUTH_005',

  // Validation
  VALIDATION_FAILED: 'VAL_001',
  INVALID_EMAIL: 'VAL_002',
  INVALID_PASSWORD: 'VAL_003',
  INVALID_PHONE: 'VAL_004',

  // Resources
  USER_NOT_FOUND: 'RES_001',
  PRODUCT_NOT_FOUND: 'RES_002',
  ORDER_NOT_FOUND: 'RES_003',
  ADDRESS_NOT_FOUND: 'RES_004',

  // Business Logic
  OUT_OF_STOCK: 'BIZ_001',
  INSUFFICIENT_STOCK: 'BIZ_002',
  ORDER_ALREADY_PAID: 'BIZ_003',
  INVALID_DISCOUNT: 'BIZ_004',

  // Payments
  PAYMENT_FAILED: 'PAY_001',
  PAYMENT_CANCELLED: 'PAY_002',
  REFUND_FAILED: 'PAY_003',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_001',

  // Server
  INTERNAL_ERROR: 'SRV_001',
  DATABASE_ERROR: 'SRV_002',
  SERVICE_UNAVAILABLE: 'SRV_003',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
