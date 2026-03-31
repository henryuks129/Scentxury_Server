/**
 * ============================================
 * AUTH SERVICE
 * ============================================
 *
 * Business logic for authentication operations.
 * All DB + Redis interactions happen here; controllers stay thin.
 *
 * @file src/services/auth.service.ts
 */

import crypto from 'crypto';
import { User, IUser } from '../models/User.js';
import { setCache, getCache, deleteCache } from '../config/redis.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshTokenTTL,
} from '../utils/jwt.js';
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  BadRequestError,
  ErrorCodes,
} from '../utils/errors.js';

// ============================================
// TYPES
// ============================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  referralCode?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

// ============================================
// CACHE KEY HELPERS
// ============================================

const refreshTokenKey = (userId: string) => `auth:refresh:${userId}`;
const resetTokenKey = (token: string) => `auth:reset:${token}`;
const verifyTokenKey = (token: string) => `auth:verify:${token}`;
const blacklistKey = (token: string) => `auth:blacklist:${token}`;

// ============================================
// REGISTER
// ============================================

/**
 * Register a new user with email/password
 */
export async function register(input: RegisterInput): Promise<{ user: IUser; tokens: AuthTokens }> {
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  // Handle referral
  let referredBy: string | undefined;
  if (input.referralCode) {
    const referrer = await User.findOne({ referralCode: input.referralCode });
    if (referrer) {
      referredBy = referrer.id as string;
      // Increment referrer count
      await User.findByIdAndUpdate(referrer._id, { $inc: { referralCount: 1 } });
    }
  }

  const user = await User.create({
    email: input.email,
    password: input.password,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    referredBy,
  });

  const tokens = await generateTokens(user);
  return { user, tokens };
}

// ============================================
// LOGIN
// ============================================

/**
 * Authenticate user with email + password
 */
export async function login(input: LoginInput): Promise<{ user: IUser; tokens: AuthTokens }> {
  // Include password field (it's select: false)
  const user = await User.findOne({ email: input.email.toLowerCase() }).select('+password');

  if (!user) {
    throw new UnauthorizedError('Invalid email or password', ErrorCodes.INVALID_CREDENTIALS);
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account has been deactivated', ErrorCodes.NOT_AUTHENTICATED);
  }

  const passwordValid = await user.comparePassword(input.password);
  if (!passwordValid) {
    throw new UnauthorizedError('Invalid email or password', ErrorCodes.INVALID_CREDENTIALS);
  }

  // Update last login timestamp
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const tokens = await generateTokens(user);
  return { user, tokens };
}

// ============================================
// LOGOUT
// ============================================

/**
 * Invalidate refresh token on logout
 */
export async function logout(userId: string, refreshToken?: string): Promise<void> {
  await deleteCache(refreshTokenKey(userId));

  if (refreshToken) {
    // Blacklist the refresh token briefly (cover edge cases)
    await setCache(blacklistKey(refreshToken), '1', 60 * 60);
  }
}

// ============================================
// REFRESH TOKENS
// ============================================

/**
 * Issue new access + refresh token pair from a valid refresh token
 */
export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token', ErrorCodes.TOKEN_INVALID);
  }

  // Check blacklist
  const isBlacklisted = await getCache<string>(blacklistKey(refreshToken));
  if (isBlacklisted) {
    throw new UnauthorizedError('Token has been revoked', ErrorCodes.TOKEN_INVALID);
  }

  // Validate stored token matches
  const storedToken = await getCache<string>(refreshTokenKey(payload.userId));
  if (!storedToken || storedToken !== refreshToken) {
    throw new UnauthorizedError('Refresh token mismatch or expired', ErrorCodes.TOKEN_INVALID);
  }

  const user = await User.findById(payload.userId).select('role isActive');
  if (!user || !user.isActive) {
    throw new UnauthorizedError('User not found or deactivated', ErrorCodes.NOT_AUTHENTICATED);
  }

  return generateTokens(user);
}

// ============================================
// GET ME
// ============================================

/**
 * Return public user profile (no password)
 */
export async function getMe(userId: string): Promise<IUser> {
  const user = await User.findById(userId).select('-password');
  if (!user) {
    throw new NotFoundError('User', ErrorCodes.USER_NOT_FOUND);
  }
  return user;
}

// ============================================
// CHANGE PASSWORD
// ============================================

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new NotFoundError('User', ErrorCodes.USER_NOT_FOUND);

  const valid = await user.comparePassword(currentPassword);
  if (!valid) {
    throw new BadRequestError('Current password is incorrect');
  }

  user.password = newPassword;
  await user.save();

  // Invalidate all sessions
  await deleteCache(refreshTokenKey(userId));
}

// ============================================
// FORGOT PASSWORD
// ============================================

/**
 * Generate and store a password reset token (1 hour TTL)
 * Returns the token so the caller can send it via email
 */
export async function forgotPassword(email: string): Promise<string> {
  const user = await User.findOne({ email: email.toLowerCase() });

  // Always succeed to prevent email enumeration
  if (!user) return 'ok';

  const resetToken = crypto.randomBytes(32).toString('hex');
  await setCache(resetTokenKey(resetToken), user.id as string, 60 * 60); // 1 hour

  return resetToken;
}

// ============================================
// RESET PASSWORD
// ============================================

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const userId = await getCache<string>(resetTokenKey(token));
  if (!userId) {
    throw new BadRequestError('Invalid or expired reset token');
  }

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User', ErrorCodes.USER_NOT_FOUND);

  user.password = newPassword;
  await user.save();

  // Consume the reset token
  await deleteCache(resetTokenKey(token));
  // Invalidate all existing sessions
  await deleteCache(refreshTokenKey(userId));
}

// ============================================
// VERIFY EMAIL
// ============================================

/**
 * Generate email verification token (24h TTL)
 */
export async function generateVerifyEmailToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await setCache(verifyTokenKey(token), userId, 24 * 60 * 60); // 24 hours
  return token;
}

/**
 * Verify the email using the token
 */
export async function verifyEmail(token: string): Promise<void> {
  const userId = await getCache<string>(verifyTokenKey(token));
  if (!userId) {
    throw new BadRequestError('Invalid or expired verification token');
  }

  await User.findByIdAndUpdate(userId, { isVerified: true });
  await deleteCache(verifyTokenKey(token));
}

// ============================================
// GOOGLE OAUTH
// ============================================

/**
 * Complete OAuth login — generate tokens for a user returned by Passport
 */
export async function oauthLogin(user: IUser): Promise<AuthTokens> {
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });
  return generateTokens(user);
}

// ============================================
// PRIVATE HELPERS
// ============================================

async function generateTokens(user: IUser): Promise<AuthTokens> {
  const accessToken = signAccessToken({ userId: user.id as string, role: user.role });
  const refreshToken = signRefreshToken(user.id as string);

  const ttl = getRefreshTokenTTL();
  await setCache(refreshTokenKey(user.id as string), refreshToken, ttl);

  return { accessToken, refreshToken, expiresIn: 15 * 60 }; // 15 min in seconds
}
