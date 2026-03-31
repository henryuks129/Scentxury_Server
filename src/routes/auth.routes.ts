/**
 * ============================================
 * AUTH ROUTES
 * ============================================
 *
 * All authentication-related endpoints.
 * Base path: /api/v1/auth
 *
 * @file src/routes/auth.routes.ts
 */

import { Router } from 'express';
import passport from '../config/passport.js';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ChangePasswordSchema,
  RefreshTokenSchema,
  VerifyEmailSchema,
} from '../validators/auth.validator.js';

const router = Router();

// ============================================
// PUBLIC ROUTES (no JWT required)
// ============================================

/**
 * POST /api/v1/auth/register
 * Create a new user account
 */
router.post('/register', validate(RegisterSchema), authController.register);

/**
 * POST /api/v1/auth/login
 * Authenticate with email + password
 */
router.post('/login', validate(LoginSchema), authController.login);

/**
 * POST /api/v1/auth/refresh
 * Get new access token using refresh token
 */
router.post('/refresh', validate(RefreshTokenSchema), authController.refresh);

/**
 * POST /api/v1/auth/forgot-password
 * Request a password reset link
 */
router.post('/forgot-password', validate(ForgotPasswordSchema), authController.forgotPassword);

/**
 * POST /api/v1/auth/reset-password
 * Reset password using token from email
 */
router.post('/reset-password', validate(ResetPasswordSchema), authController.resetPassword);

/**
 * POST /api/v1/auth/verify-email
 * Verify email address using token from email
 */
router.post('/verify-email', validate(VerifyEmailSchema), authController.verifyEmail);

// ============================================
// GOOGLE OAUTH ROUTES
// ============================================

/**
 * GET /api/v1/auth/google
 * Redirect to Google consent screen
 */
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

/**
 * GET /api/v1/auth/google/callback
 * Google redirects here after consent
 */
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/api/v1/auth/google/failure',
  }),
  authController.googleCallback
);

/**
 * GET /api/v1/auth/google/failure
 * Google OAuth failure redirect
 */
router.get('/google/failure', (_req, res) => {
  res.status(401).json({
    success: false,
    message: 'Google authentication failed',
  });
});

// ============================================
// APPLE SIGN-IN ROUTES
// ============================================

/**
 * POST /api/v1/auth/apple
 * Initiate Apple Sign-In (POST because Apple sends form data)
 */
router.post(
  '/apple',
  passport.authenticate('apple', { session: false })
);

/**
 * POST /api/v1/auth/apple/callback
 * Apple redirects here after authentication (Apple uses POST)
 */
router.post(
  '/apple/callback',
  passport.authenticate('apple', {
    session: false,
    failureRedirect: '/api/v1/auth/apple/failure',
  }),
  authController.appleCallback
);

/**
 * GET /api/v1/auth/apple/failure
 * Apple Sign-In failure redirect
 */
router.get('/apple/failure', (_req, res) => {
  res.status(401).json({
    success: false,
    message: 'Apple authentication failed',
  });
});

// ============================================
// PROTECTED ROUTES (JWT required)
// ============================================

/**
 * GET /api/v1/auth/me
 * Get current user's profile
 */
router.get('/me', authenticate, authController.getMe);

/**
 * POST /api/v1/auth/logout
 * Invalidate current session
 */
router.post('/logout', authenticate, authController.logout);

/**
 * POST /api/v1/auth/change-password
 * Change password (must know current password)
 */
router.post(
  '/change-password',
  authenticate,
  validate(ChangePasswordSchema),
  authController.changePassword
);

export default router;
