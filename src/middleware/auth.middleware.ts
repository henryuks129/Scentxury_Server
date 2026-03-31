/**
 * ============================================
 * AUTH MIDDLEWARE
 * ============================================
 *
 * JWT-based authentication and authorization middleware.
 *
 * Exports:
 * - authenticate     — Require valid JWT
 * - adminOnly        — Require admin role
 * - optionalAuth     — Attach user if token present, continue either way
 *
 * @file src/middleware/auth.middleware.ts
 */

import { Request, Response, NextFunction } from 'express';
import { User, IUser } from '../models/User.js';
import {
  verifyAccessToken,
  extractBearerToken,
} from '../utils/jwt.js';
import {
  UnauthorizedError,
  ForbiddenError,
  ErrorCodes,
} from '../utils/errors.js';

// ============================================
// AUTHENTICATE
// ============================================

/**
 * Require a valid Bearer JWT token.
 * Attaches `req.user = { id, role }` on success.
 * Calls next(UnauthorizedError) on failure.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      return next(
        new UnauthorizedError('No token provided. Use: Authorization: Bearer <token>', ErrorCodes.NOT_AUTHENTICATED)
      );
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return next(
        new UnauthorizedError('Invalid or expired token', ErrorCodes.TOKEN_INVALID)
      );
    }

    const user = await User.findById(payload.userId).select('role isActive').lean<IUser>();

    if (!user) {
      return next(
        new UnauthorizedError('User not found. Token may be stale.', ErrorCodes.USER_NOT_FOUND)
      );
    }

    if (!user.isActive) {
      return next(
        new UnauthorizedError('Account has been deactivated', ErrorCodes.NOT_AUTHENTICATED)
      );
    }

    req.user = { id: String(user._id), role: user.role };
    next();
  } catch (error) {
    next(error);
  }
}

// ============================================
// ADMIN ONLY
// ============================================

/**
 * Require the authenticated user to have role 'admin'.
 * Must be used AFTER `authenticate` middleware.
 */
export function adminOnly(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== 'admin') {
    return next(
      new ForbiddenError('Admin access required', ErrorCodes.NOT_AUTHORIZED)
    );
  }
  next();
}

// ============================================
// OPTIONAL AUTH
// ============================================

/**
 * Attach user to request if a valid token is present.
 * Does NOT fail if no token or invalid token — just continues.
 * Use for endpoints that behave differently for authenticated users.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return next();

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return next();
    }

    const user = await User.findById(payload.userId).select('role isActive').lean<IUser>();
    if (user && user.isActive) {
      req.user = { id: String(user._id), role: user.role };
    }

    next();
  } catch {
    // Silently continue — optional auth must not block requests
    next();
  }
}
