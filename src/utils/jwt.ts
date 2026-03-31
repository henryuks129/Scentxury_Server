/**
 * ============================================
 * JWT UTILITIES
 * ============================================
 *
 * Helper functions for signing and verifying JWT tokens.
 * Access tokens (short-lived) + refresh tokens (long-lived).
 *
 * @file src/utils/jwt.ts
 */

import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';

// ============================================
// TYPES
// ============================================

export interface TokenPayload {
  userId: string;
  role: 'user' | 'admin';
}

export interface AccessTokenPayload extends TokenPayload, JwtPayload {}

export interface RefreshTokenPayload extends JwtPayload {
  userId: string;
  tokenFamily?: string; // For refresh token rotation
}

// ============================================
// CONSTANTS
// ============================================

// Read from env lazily so tests can set process.env before these are used
const getJwtSecret = () => process.env.JWT_SECRET || 'dev-secret-change-in-production';
const getJwtRefreshSecret = () =>
  process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

// ============================================
// ACCESS TOKEN
// ============================================

/**
 * Sign a JWT access token (15-minute expiry)
 */
export function signAccessToken(payload: TokenPayload): string {
  const options: SignOptions = {
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: 'scentxury-api',
    audience: 'scentxury-client',
  };

  return jwt.sign(payload, getJwtSecret(), options);
}

/**
 * Verify and decode a JWT access token
 * Throws JsonWebTokenError or TokenExpiredError on failure
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getJwtSecret(), {
    issuer: 'scentxury-api',
    audience: 'scentxury-client',
  }) as AccessTokenPayload;
}

// ============================================
// REFRESH TOKEN
// ============================================

/**
 * Sign a JWT refresh token (7-day expiry)
 */
export function signRefreshToken(userId: string, tokenFamily?: string): string {
  const options: SignOptions = {
    expiresIn: REFRESH_TOKEN_TTL,
    issuer: 'scentxury-api',
  };

  return jwt.sign({ userId, tokenFamily }, getJwtRefreshSecret(), options);
}

/**
 * Verify and decode a JWT refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, getJwtRefreshSecret(), {
    issuer: 'scentxury-api',
  }) as RefreshTokenPayload;
}

/**
 * Get refresh token TTL in seconds (for Redis expiry)
 */
export function getRefreshTokenTTL(): number {
  return REFRESH_TOKEN_TTL_SECONDS;
}

// ============================================
// UTILITIES
// ============================================

/**
 * Decode a token without verification (for inspection only)
 */
export function decodeToken(token: string): JwtPayload | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === 'string') return null;
  return decoded;
}

/**
 * Extract token from Authorization header
 * Supports "Bearer <token>" format
 */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1] || null;
}
