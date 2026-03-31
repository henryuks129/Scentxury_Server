/**
 * ============================================
 * VALIDATION MIDDLEWARE
 * ============================================
 *
 * Zod schema validation middleware factory.
 * Validates req.body, req.params, or req.query against a Zod schema.
 * Returns 422 with detailed field errors on failure.
 *
 * @file src/middleware/validate.middleware.ts
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';
import { ValidationError, ValidationFieldError } from '../utils/errors.js';

type RequestSource = 'body' | 'params' | 'query';

/**
 * Factory: returns middleware that validates req[source] with the given Zod schema.
 *
 * @example
 * router.post('/register', validate(RegisterSchema), authController.register)
 */
export function validate(schema: ZodSchema, source: RequestSource = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const fieldErrors: ValidationFieldError[] = formatZodErrors(result.error);
      return next(new ValidationError('Validation failed', fieldErrors));
    }

    // Replace with parsed (and transformed) data
    req[source] = result.data as Record<string, unknown>;
    next();
  };
}

/**
 * Convert ZodError into a flat array of field errors
 */
function formatZodErrors(error: ZodError): ValidationFieldError[] {
  const issues: ZodIssue[] = error.issues;
  return issues.map((issue) => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    value: undefined,
  }));
}
