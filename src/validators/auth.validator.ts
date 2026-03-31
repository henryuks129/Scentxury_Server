/**
 * ============================================
 * AUTH VALIDATORS
 * ============================================
 *
 * Zod schemas for authentication-related operations.
 *
 * @file src/validators/auth.validator.ts
 */

import { z } from 'zod';

// ============================================
// CONSTANTS
// ============================================

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;

// ============================================
// HELPER SCHEMAS
// ============================================

/**
 * Email validation schema
 */
export const emailSchema = z
  .string()
  .transform((email) => email.trim().toLowerCase())
  .pipe(
    z
      .string()
      .email('Invalid email format')
      .min(5, 'Email is too short')
      .max(255, 'Email is too long')
  );

/**
 * Password validation schema with strength requirements
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/**
 * Name validation schema
 */
export const nameSchema = z
  .string()
  .min(NAME_MIN_LENGTH, `Name must be at least ${NAME_MIN_LENGTH} characters`)
  .max(NAME_MAX_LENGTH, `Name cannot exceed ${NAME_MAX_LENGTH} characters`)
  .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes')
  .transform((name) => name.trim());

/**
 * Phone number validation (Nigerian format primarily)
 */
export const phoneSchema = z
  .string()
  .regex(
    /^(\+234|0)[789][01]\d{8}$/,
    'Invalid Nigerian phone number format'
  )
  .transform((phone) => {
    // Normalize to international format
    if (phone.startsWith('0')) {
      return '+234' + phone.substring(1);
    }
    return phone;
  });

// ============================================
// REGISTRATION SCHEMAS
// ============================================

/**
 * User registration schema
 *
 * NOTE: confirmPassword and acceptTerms are optional at the API level —
 * password confirmation is a UI concern; the backend does not need to
 * re-validate it.  When confirmPassword IS supplied, we still check it
 * matches so the validator is useful for direct form submissions too.
 */
export const RegisterSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().optional(),
    firstName: nameSchema,
    lastName: nameSchema,
    phone: phoneSchema.optional(),
    referralCode: z.string().max(50).optional(),
    acceptTerms: z.literal(true).optional(),
  })
  .refine(
    (data) => !data.confirmPassword || data.password === data.confirmPassword,
    {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }
  );

export type RegisterInput = z.infer<typeof RegisterSchema>;

// ============================================
// LOGIN SCHEMAS
// ============================================

/**
 * Standard email/password login
 */
export const LoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof LoginSchema>;

/**
 * OAuth callback validation
 */
export const OAuthCallbackSchema = z.object({
  provider: z.enum(['google', 'apple']),
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().optional(),
});

export type OAuthCallbackInput = z.infer<typeof OAuthCallbackSchema>;

// ============================================
// PASSWORD RESET SCHEMAS
// ============================================

/**
 * Request password reset (forgot password)
 */
export const ForgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

/**
 * Reset password with token
 */
export const ResetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

/**
 * Change password (when logged in)
 *
 * NOTE: confirmNewPassword is optional at the API level — confirming the new
 * password is a UI concern.  When supplied, we validate it matches so the
 * schema is still useful for direct form submissions.
 */
export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmNewPassword: z.string().optional(),
  })
  .refine(
    (data) => !data.confirmNewPassword || data.newPassword === data.confirmNewPassword,
    {
      message: 'Passwords do not match',
      path: ['confirmNewPassword'],
    }
  )
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

// ============================================
// TOKEN SCHEMAS
// ============================================

/**
 * Refresh token validation
 */
export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

/**
 * Email verification token
 */
export const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

// ============================================
// EXPORTS
// ============================================

export const AuthValidators = {
  register: RegisterSchema,
  login: LoginSchema,
  oauthCallback: OAuthCallbackSchema,
  forgotPassword: ForgotPasswordSchema,
  resetPassword: ResetPasswordSchema,
  changePassword: ChangePasswordSchema,
  refreshToken: RefreshTokenSchema,
  verifyEmail: VerifyEmailSchema,
};

export default AuthValidators;
