/**
 * ============================================
 * AUTH CONTROLLER
 * ============================================
 *
 * Thin request handlers — validation is done by middleware,
 * business logic lives in AuthService.
 *
 * @file src/controllers/auth.controller.ts
 */

import { Request, Response, NextFunction } from 'express';
import * as AuthService from '../services/auth.service.js';
import { IUser } from '../models/User.js';

// ============================================
// REGISTER
// ============================================

/**
 * POST /api/v1/auth/register
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password, firstName, lastName, phone, referralCode } = req.body as {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone?: string;
      referralCode?: string;
    };

    const { user, tokens } = await AuthService.register({
      email,
      password,
      firstName,
      lastName,
      phone,
      referralCode,
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: sanitizeUser(user),
        ...tokens,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// LOGIN
// ============================================

/**
 * POST /api/v1/auth/login
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };

    const { user, tokens } = await AuthService.login({ email, password });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: sanitizeUser(user),
        ...tokens,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// LOGOUT
// ============================================

/**
 * POST /api/v1/auth/logout
 */
export async function logout(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { refreshToken } = req.body as { refreshToken?: string };

    await AuthService.logout(userId, refreshToken);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// GET ME
// ============================================

/**
 * GET /api/v1/auth/me
 */
export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await AuthService.getMe(req.user!.id);

    res.status(200).json({
      success: true,
      data: { user: sanitizeUser(user) },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// REFRESH TOKEN
// ============================================

/**
 * POST /api/v1/auth/refresh
 */
export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    const tokens = await AuthService.refreshTokens(refreshToken);

    res.status(200).json({
      success: true,
      message: 'Tokens refreshed',
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// CHANGE PASSWORD
// ============================================

/**
 * POST /api/v1/auth/change-password
 */
export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    await AuthService.changePassword(req.user!.id, currentPassword, newPassword);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please log in again.',
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// FORGOT PASSWORD
// ============================================

/**
 * POST /api/v1/auth/forgot-password
 */
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email } = req.body as { email: string };

    const resetToken = await AuthService.forgotPassword(email);

    // Always 200 to prevent email enumeration
    const response: Record<string, unknown> = {
      success: true,
      message: 'If an account exists with this email, a reset link has been sent.',
    };

    // In development, expose the token so you can test without SMTP configured.
    // Remove this block (or ensure NODE_ENV=production) before going live.
    if (process.env.NODE_ENV === 'development' && resetToken !== 'ok') {
      response.devResetToken = resetToken;
      response.devNote = 'Token exposed in dev mode only — wire SMTP to remove this.';
    }

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

// ============================================
// RESET PASSWORD
// ============================================

/**
 * POST /api/v1/auth/reset-password
 */
export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token, password } = req.body as { token: string; password: string };

    await AuthService.resetPassword(token, password);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please log in.',
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// VERIFY EMAIL
// ============================================

/**
 * POST /api/v1/auth/verify-email
 */
export async function verifyEmail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = req.body as { token: string };

    await AuthService.verifyEmail(token);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully.',
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// GOOGLE OAUTH CALLBACK
// ============================================

/**
 * GET /api/v1/auth/google/callback
 * Called after Passport completes Google OAuth
 */
export async function googleCallback(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user as unknown as IUser;
    const tokens = await AuthService.oauthLogin(user);

    // Redirect to frontend with tokens in query (or use a short-lived code pattern)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = new URL('/auth/callback', frontendUrl);
    redirectUrl.searchParams.set('accessToken', tokens.accessToken);
    redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);

    res.redirect(redirectUrl.toString());
  } catch (error) {
    next(error);
  }
}

// ============================================
// APPLE SIGN-IN CALLBACK
// ============================================

/**
 * POST /api/v1/auth/apple/callback
 * Called after Passport completes Apple Sign-In
 */
export async function appleCallback(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user as unknown as IUser;
    const tokens = await AuthService.oauthLogin(user);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = new URL('/auth/callback', frontendUrl);
    redirectUrl.searchParams.set('accessToken', tokens.accessToken);
    redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);

    res.redirect(redirectUrl.toString());
  } catch (error) {
    next(error);
  }
}

// ============================================
// PRIVATE HELPERS
// ============================================

/**
 * Remove sensitive fields before sending user in response
 */
function sanitizeUser(user: IUser): Record<string, unknown> {
  const obj = user.toObject({ virtuals: true });
  delete obj.password;
  delete obj.googleId;
  delete obj.appleId;
  delete obj.__v;
  return obj;
}
