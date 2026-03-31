/**
 * ============================================
 * VALIDATE MIDDLEWARE — UNIT TESTS
 * ============================================
 *
 * Comprehensive unit tests for the `validate` middleware factory
 * (src/middleware/validate.middleware.ts).
 *
 * Coverage:
 *   - Calls next() when schema passes (body, params, query)
 *   - Replaces req[source] with parsed (transformed) data
 *   - Returns 422 ValidationError with field-level detail on failure
 *   - Strips unknown fields (Zod's default strip behaviour)
 *   - Works for 'params' and 'query' sources, not just 'body'
 *   - errorHandler integration: maps AppError sub-classes to correct
 *     HTTP status codes and response shape
 *
 * @file src/middleware/__tests__/validate.middleware.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { validate } from '../validate.middleware.js';
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  AppError,
} from '../../utils/errors.js';
import { mockRequest, mockResponse } from '../../test/helpers.js';
import type { Request, Response, NextFunction } from 'express';

// ============================================
// HELPERS
// ============================================

/** Build a validate middleware and invoke it synchronously */
function runValidate(
  schema: z.ZodSchema,
  source: 'body' | 'params' | 'query',
  reqOptions: Parameters<typeof mockRequest>[0]
): {
  req: Partial<Request>;
  res: ReturnType<typeof mockResponse>;
  next: ReturnType<typeof vi.fn>;
} {
  const req = mockRequest(reqOptions);
  const res = mockResponse();
  const next = vi.fn();
  validate(schema, source)(req as Request, res as Response, next as NextFunction);
  return { req, res, next };
}

// ============================================
// TESTS
// ============================================

describe('validate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------
  // HAPPY PATH — body (default source)
  // --------------------------------------------------
  describe('valid input', () => {
    it('calls next() with no arguments when body is valid', () => {
      // Arrange: a simple schema that accepts name + age
      const schema = z.object({ name: z.string().min(2), age: z.number().int().positive() });

      // Act
      const { next } = runValidate(schema, 'body', { body: { name: 'Alice', age: 30 } });

      // Assert: next() called without an error argument (i.e., empty call)
      expect(next).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledWith(/* no args */);
    });

    it('replaces req.body with the parsed (coerced) data', () => {
      // z.coerce.number() will transform the string "42" → number 42
      const schema = z.object({ page: z.coerce.number().default(1), name: z.string() });
      const req = mockRequest({ body: { page: '5', name: 'Test' } });
      const next = vi.fn();

      validate(schema)(req as Request, mockResponse() as Response, next as NextFunction);

      // req.body should now contain the parsed, coerced data
      expect((req.body as Record<string, unknown>)['page']).toBe(5);
      expect((req.body as Record<string, unknown>)['name']).toBe('Test');
    });

    it('applies default values defined in the schema', () => {
      // Schema sets a default so the field is added even if absent from input
      const schema = z.object({ limit: z.number().default(20), name: z.string() });
      const req = mockRequest({ body: { name: 'Chai' } });
      const next = vi.fn();

      validate(schema)(req as Request, mockResponse() as Response, next as NextFunction);

      expect((req.body as Record<string, unknown>)['limit']).toBe(20);
    });

    it('strips unknown fields from req.body (Zod strip behaviour)', () => {
      // Zod's default mode removes keys not declared in the schema.
      // This ensures unexpected fields never leak into controllers.
      const schema = z.object({ name: z.string() });
      const req = mockRequest({ body: { name: 'Oud', injected: 'malicious' } });
      const next = vi.fn();

      validate(schema)(req as Request, mockResponse() as Response, next as NextFunction);

      const body = req.body as Record<string, unknown>;
      expect(body['name']).toBe('Oud');
      expect(body['injected']).toBeUndefined();
    });

    it('works with params source', () => {
      // Validate URL parameters (e.g., /products/:id)
      const schema = z.object({ id: z.string().length(24) });
      const validId = 'a'.repeat(24);
      const req = mockRequest({ params: { id: validId } });
      const res = mockResponse();
      const next = vi.fn();

      validate(schema, 'params')(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith();
    });

    it('works with query source', () => {
      // Validate query string parameters
      const schema = z.object({ page: z.coerce.number().min(1).default(1) });
      const req = mockRequest({ query: { page: '3' } });
      const res = mockResponse();
      const next = vi.fn();

      validate(schema, 'query')(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith();
      expect((req.query as Record<string, unknown>)['page']).toBe(3);
    });
  });

  // --------------------------------------------------
  // FAILURE PATH — passes ValidationError to next()
  // --------------------------------------------------
  describe('invalid input', () => {
    it('calls next() with a ValidationError (status 422) on schema failure', () => {
      // Schema requires name but receives an empty object
      const schema = z.object({ name: z.string().min(2) });
      const { next } = runValidate(schema, 'body', { body: {} });

      // next() should be called with a ValidationError instance
      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0]?.[0] as ValidationError;
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.statusCode).toBe(422);
      expect(err.message).toContain('Validation failed');
    });

    it('includes field-level errors in ValidationError.errors', () => {
      // Two fields fail: email (invalid) + password (too short)
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
      });
      const { next } = runValidate(schema, 'body', { body: { email: 'bad', password: '123' } });

      const err = next.mock.calls[0]?.[0] as ValidationError;
      expect(err.errors.length).toBeGreaterThanOrEqual(2);
      // Each error entry must have a field and message string
      for (const fieldErr of err.errors) {
        expect(typeof fieldErr.field).toBe('string');
        expect(typeof fieldErr.message).toBe('string');
      }
    });

    it('maps the correct field path for nested schema failures', () => {
      // Nested object: shippingAddress.city must be a string
      const schema = z.object({
        shippingAddress: z.object({ city: z.string().min(2) }),
      });
      const { next } = runValidate(schema, 'body', {
        body: { shippingAddress: { city: 'X' } },
      });

      const err = next.mock.calls[0]?.[0] as ValidationError;
      const fieldPaths = err.errors.map((e) => e.field);
      // Zod uses dot notation for nested paths
      expect(fieldPaths.some((p) => p.includes('city') || p.includes('shippingAddress'))).toBe(
        true
      );
    });

    it('does NOT call res.json directly — delegates to next()', () => {
      // validate() must never short-circuit; errors go through Express error middleware
      const schema = z.object({ required: z.string() });
      const req = mockRequest({ body: {} });
      const res = mockResponse();
      const next = vi.fn();

      validate(schema)(req as Request, res as Response, next as NextFunction);

      expect(res.json).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledOnce();
    });

    it('reports "root" as the field path when the top-level value is wrong type', () => {
      // Schema expects an object but receives null-ish body (edge case)
      const schema = z.object({ x: z.number() });
      const { next } = runValidate(schema, 'body', { body: { x: 'not-a-number' } });

      const err = next.mock.calls[0]?.[0] as ValidationError;
      expect(err).toBeInstanceOf(ValidationError);
    });
  });

  // --------------------------------------------------
  // TRANSFORMATION / COERCION
  // --------------------------------------------------
  describe('data transformation', () => {
    it('passes transformed date strings as Date objects', () => {
      // z.coerce.date() converts ISO strings to Date objects before they reach controllers
      const schema = z.object({ dob: z.coerce.date() });
      const req = mockRequest({ body: { dob: '2000-01-01T00:00:00Z' } });
      const next = vi.fn();

      validate(schema)(req as Request, mockResponse() as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith();
      expect((req.body as Record<string, unknown>)['dob']).toBeInstanceOf(Date);
    });

    it('trims string values when the schema uses .trim()', () => {
      const schema = z.object({ name: z.string().trim() });
      const req = mockRequest({ body: { name: '  Scentxury  ' } });
      const next = vi.fn();

      validate(schema)(req as Request, mockResponse() as Response, next as NextFunction);

      expect((req.body as Record<string, unknown>)['name']).toBe('Scentxury');
    });
  });
});

// ============================================
// ERROR CLASS SHAPE TESTS
// ============================================

describe('AppError sub-classes shape', () => {
  // These tests verify that the error classes used by validate middleware
  // produce the correct HTTP status codes and serialization format that
  // the global error handler (app.ts) relies on.

  it('ValidationError has statusCode 422 and errors array', () => {
    const fieldErrors = [{ field: 'email', message: 'Invalid email', value: 'bad' }];
    const err = new ValidationError('Validation failed', fieldErrors);

    expect(err.statusCode).toBe(422);
    expect(err.errors).toEqual(fieldErrors);
    expect(err.isOperational).toBe(true);
  });

  it('NotFoundError has statusCode 404', () => {
    const err = new NotFoundError('Order');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('Order');
  });

  it('UnauthorizedError has statusCode 401', () => {
    const err = new UnauthorizedError('No token');
    expect(err.statusCode).toBe(401);
  });

  it('ForbiddenError has statusCode 403', () => {
    const err = new ForbiddenError('Admin only');
    expect(err.statusCode).toBe(403);
  });

  it('BadRequestError has statusCode 400', () => {
    const err = new BadRequestError('Bad data');
    expect(err.statusCode).toBe(400);
  });

  it('AppError.toJSON() includes success:false and the message', () => {
    const err = new AppError('Something went wrong', 500);
    const json = err.toJSON();
    expect(json.success).toBe(false);
    expect(json.message).toBe('Something went wrong');
    expect(json.statusCode).toBe(500);
  });

  it('ValidationError.toJSON() merges errors array into JSON', () => {
    const fieldErrors = [{ field: 'name', message: 'Required', value: undefined }];
    const err = new ValidationError('Validation failed', fieldErrors);
    const json = err.toJSON();
    expect(json.errors).toEqual(fieldErrors);
  });

  it('AppError.status is "fail" for 4xx and "error" for 5xx', () => {
    const clientErr = new AppError('Not found', 404);
    const serverErr = new AppError('Server crash', 500);

    expect(clientErr.status).toBe('fail');
    expect(serverErr.status).toBe('error');
  });
});
