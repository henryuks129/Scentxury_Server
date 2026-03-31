/**
 * ============================================
 * NOSQL INJECTION SANITIZATION MIDDLEWARE
 * ============================================
 *
 * Custom sanitization middleware replacing express-mongo-sanitize,
 * which is incompatible with Express 5.x (req.query is read-only).
 *
 * What it does:
 *  - Recursively strips keys that start with "$" (MongoDB operators)
 *    from req.body and req.params to prevent NoSQL injection attacks.
 *  - Strips keys containing "." to prevent dot-notation injection.
 *  - req.query is intentionally NOT mutated (read-only in Express 5);
 *    query param safety is enforced at the controller layer via Zod.
 *
 * Example attack this blocks:
 *   POST /login  { "email": { "$gt": "" }, "password": { "$gt": "" } }
 *   → after sanitize: { email: {}, password: {} }  → auth fails safely
 *
 * @file src/middleware/sanitize.middleware.ts
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Recursively remove keys starting with "$" or containing "." from an object.
 * Handles nested objects and arrays.
 */
function stripDangerousKeys(value: unknown): unknown {
  // Primitives (string, number, boolean, null, undefined) — pass through as-is
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  // Arrays — sanitize each element recursively
  if (Array.isArray(value)) {
    return value.map(stripDangerousKeys);
  }

  // Plain objects — filter and recurse
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    // Drop MongoDB operator keys ($where, $gt, $ne, etc.) and dot-notation keys
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    sanitized[key] = stripDangerousKeys(val);
  }

  return sanitized;
}

/**
 * Express middleware that sanitizes req.body and req.params against
 * NoSQL injection. Safe for Express 5 (does not touch req.query).
 *
 * Usage: app.use(sanitize) — place after body-parser, before routes.
 */
export function sanitize(req: Request, _res: Response, next: NextFunction): void {
  // Sanitize request body (primary injection surface)
  if (req.body && typeof req.body === 'object') {
    req.body = stripDangerousKeys(req.body) as Record<string, unknown>;
  }

  // Sanitize route params (e.g. /users/:id)
  if (req.params && typeof req.params === 'object') {
    req.params = stripDangerousKeys(req.params) as Record<string, string>;
  }

  // NOTE: req.query is intentionally skipped — it is a read-only getter in
  // Express 5. Query string values are validated via Zod schemas in controllers.

  next();
}

// Export the helper for unit testing
export { stripDangerousKeys };
