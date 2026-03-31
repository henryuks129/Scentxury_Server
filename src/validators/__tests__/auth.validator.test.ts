/**
 * ============================================
 * AUTH VALIDATORS - TESTS
 * ============================================
 *
 * Tests for authentication validation schemas.
 *
 * @file src/validators/__tests__/auth.validator.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  RegisterSchema,
  LoginSchema,
  OAuthCallbackSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ChangePasswordSchema,
  RefreshTokenSchema,
  VerifyEmailSchema,
  emailSchema,
  passwordSchema,
  nameSchema,
  phoneSchema,
} from '../auth.validator.js';

describe('Auth Validators', () => {
  // ========================================
  // EMAIL SCHEMA
  // ========================================
  describe('emailSchema', () => {
    it('should accept valid email', () => {
      const result = emailSchema.safeParse('test@example.com');
      expect(result.success).toBe(true);
    });

    it('should transform email to lowercase', () => {
      const result = emailSchema.safeParse('TEST@EXAMPLE.COM');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('test@example.com');
      }
    });

    it('should trim email whitespace', () => {
      const result = emailSchema.safeParse('  test@example.com  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('test@example.com');
      }
    });

    it('should reject invalid email format', () => {
      const result = emailSchema.safeParse('invalid-email');
      expect(result.success).toBe(false);
    });

    it('should reject empty email', () => {
      const result = emailSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject email without domain', () => {
      const result = emailSchema.safeParse('test@');
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // PASSWORD SCHEMA
  // ========================================
  describe('passwordSchema', () => {
    it('should accept strong password', () => {
      const result = passwordSchema.safeParse('SecurePass123!');
      expect(result.success).toBe(true);
    });

    it('should reject password without uppercase', () => {
      const result = passwordSchema.safeParse('securepass123!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('uppercase');
      }
    });

    it('should reject password without lowercase', () => {
      const result = passwordSchema.safeParse('SECUREPASS123!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('lowercase');
      }
    });

    it('should reject password without number', () => {
      const result = passwordSchema.safeParse('SecurePassword!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('number');
      }
    });

    it('should reject password without special character', () => {
      const result = passwordSchema.safeParse('SecurePass123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('special');
      }
    });

    it('should reject password shorter than 8 characters', () => {
      const result = passwordSchema.safeParse('Abc1!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('8 characters');
      }
    });

    it('should reject password longer than 128 characters', () => {
      const longPassword = 'Aa1!' + 'a'.repeat(130);
      const result = passwordSchema.safeParse(longPassword);
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // NAME SCHEMA
  // ========================================
  describe('nameSchema', () => {
    it('should accept valid name', () => {
      const result = nameSchema.safeParse('John');
      expect(result.success).toBe(true);
    });

    it('should accept name with hyphen', () => {
      const result = nameSchema.safeParse('Mary-Jane');
      expect(result.success).toBe(true);
    });

    it('should accept name with apostrophe', () => {
      const result = nameSchema.safeParse("O'Brien");
      expect(result.success).toBe(true);
    });

    it('should accept name with space', () => {
      const result = nameSchema.safeParse('Mary Jane');
      expect(result.success).toBe(true);
    });

    it('should trim whitespace', () => {
      const result = nameSchema.safeParse('  John  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('John');
      }
    });

    it('should reject name with numbers', () => {
      const result = nameSchema.safeParse('John123');
      expect(result.success).toBe(false);
    });

    it('should reject name with special characters', () => {
      const result = nameSchema.safeParse('John@Doe');
      expect(result.success).toBe(false);
    });

    it('should reject name shorter than 2 characters', () => {
      const result = nameSchema.safeParse('J');
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // PHONE SCHEMA
  // ========================================
  describe('phoneSchema', () => {
    it('should accept valid Nigerian phone starting with 0', () => {
      const result = phoneSchema.safeParse('08012345678');
      expect(result.success).toBe(true);
    });

    it('should accept valid Nigerian phone starting with +234', () => {
      const result = phoneSchema.safeParse('+2348012345678');
      expect(result.success).toBe(true);
    });

    it('should normalize 0-prefix to +234', () => {
      const result = phoneSchema.safeParse('08012345678');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('+2348012345678');
      }
    });

    it('should reject invalid phone format', () => {
      const result = phoneSchema.safeParse('1234567890');
      expect(result.success).toBe(false);
    });

    it('should reject phone with invalid prefix', () => {
      const result = phoneSchema.safeParse('06012345678');
      expect(result.success).toBe(false);
    });

    it('should reject phone with wrong length', () => {
      const result = phoneSchema.safeParse('0801234567');
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // REGISTER SCHEMA
  // ========================================
  describe('RegisterSchema', () => {
    const validRegistration = {
      email: 'test@example.com',
      password: 'SecurePass123!',
      confirmPassword: 'SecurePass123!',
      firstName: 'John',
      lastName: 'Doe',
      acceptTerms: true as const,
    };

    it('should accept valid registration', () => {
      const result = RegisterSchema.safeParse(validRegistration);
      expect(result.success).toBe(true);
    });

    it('should accept registration with optional phone', () => {
      const result = RegisterSchema.safeParse({
        ...validRegistration,
        phone: '08012345678',
      });
      expect(result.success).toBe(true);
    });

    it('should accept registration with optional referral code', () => {
      const result = RegisterSchema.safeParse({
        ...validRegistration,
        referralCode: 'REFER123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject mismatched passwords', () => {
      const result = RegisterSchema.safeParse({
        ...validRegistration,
        confirmPassword: 'DifferentPass123!',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('confirmPassword');
      }
    });

    it('should reject without accepting terms', () => {
      const result = RegisterSchema.safeParse({
        ...validRegistration,
        acceptTerms: false,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid email', () => {
      const result = RegisterSchema.safeParse({
        ...validRegistration,
        email: 'invalid-email',
      });
      expect(result.success).toBe(false);
    });

    it('should reject weak password', () => {
      const result = RegisterSchema.safeParse({
        ...validRegistration,
        password: 'weak',
        confirmPassword: 'weak',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing firstName', () => {
      const { firstName, ...rest } = validRegistration;
      const result = RegisterSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing lastName', () => {
      const { lastName, ...rest } = validRegistration;
      const result = RegisterSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // LOGIN SCHEMA
  // ========================================
  describe('LoginSchema', () => {
    it('should accept valid login', () => {
      const result = LoginSchema.safeParse({
        email: 'test@example.com',
        password: 'anypassword',
      });
      expect(result.success).toBe(true);
    });

    it('should default rememberMe to false', () => {
      const result = LoginSchema.safeParse({
        email: 'test@example.com',
        password: 'anypassword',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rememberMe).toBe(false);
      }
    });

    it('should accept rememberMe option', () => {
      const result = LoginSchema.safeParse({
        email: 'test@example.com',
        password: 'anypassword',
        rememberMe: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rememberMe).toBe(true);
      }
    });

    it('should reject invalid email', () => {
      const result = LoginSchema.safeParse({
        email: 'invalid',
        password: 'anypassword',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty password', () => {
      const result = LoginSchema.safeParse({
        email: 'test@example.com',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // OAUTH CALLBACK SCHEMA
  // ========================================
  describe('OAuthCallbackSchema', () => {
    it('should accept valid Google OAuth callback', () => {
      const result = OAuthCallbackSchema.safeParse({
        provider: 'google',
        code: 'auth_code_123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid Apple OAuth callback', () => {
      const result = OAuthCallbackSchema.safeParse({
        provider: 'apple',
        code: 'auth_code_123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional state parameter', () => {
      const result = OAuthCallbackSchema.safeParse({
        provider: 'google',
        code: 'auth_code_123',
        state: 'random_state',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid provider', () => {
      const result = OAuthCallbackSchema.safeParse({
        provider: 'facebook',
        code: 'auth_code_123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty code', () => {
      const result = OAuthCallbackSchema.safeParse({
        provider: 'google',
        code: '',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // FORGOT PASSWORD SCHEMA
  // ========================================
  describe('ForgotPasswordSchema', () => {
    it('should accept valid email', () => {
      const result = ForgotPasswordSchema.safeParse({
        email: 'test@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = ForgotPasswordSchema.safeParse({
        email: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // RESET PASSWORD SCHEMA
  // ========================================
  describe('ResetPasswordSchema', () => {
    it('should accept valid reset', () => {
      const result = ResetPasswordSchema.safeParse({
        token: 'reset_token_123',
        password: 'NewSecure123!',
        confirmPassword: 'NewSecure123!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject mismatched passwords', () => {
      const result = ResetPasswordSchema.safeParse({
        token: 'reset_token_123',
        password: 'NewSecure123!',
        confirmPassword: 'Different123!',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty token', () => {
      const result = ResetPasswordSchema.safeParse({
        token: '',
        password: 'NewSecure123!',
        confirmPassword: 'NewSecure123!',
      });
      expect(result.success).toBe(false);
    });

    it('should reject weak password', () => {
      const result = ResetPasswordSchema.safeParse({
        token: 'reset_token_123',
        password: 'weak',
        confirmPassword: 'weak',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // CHANGE PASSWORD SCHEMA
  // ========================================
  describe('ChangePasswordSchema', () => {
    it('should accept valid password change', () => {
      const result = ChangePasswordSchema.safeParse({
        currentPassword: 'OldPass123!',
        newPassword: 'NewSecure123!',
        confirmNewPassword: 'NewSecure123!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject same current and new password', () => {
      const result = ChangePasswordSchema.safeParse({
        currentPassword: 'SamePass123!',
        newPassword: 'SamePass123!',
        confirmNewPassword: 'SamePass123!',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('different');
      }
    });

    it('should reject mismatched new passwords', () => {
      const result = ChangePasswordSchema.safeParse({
        currentPassword: 'OldPass123!',
        newPassword: 'NewSecure123!',
        confirmNewPassword: 'Different123!',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty current password', () => {
      const result = ChangePasswordSchema.safeParse({
        currentPassword: '',
        newPassword: 'NewSecure123!',
        confirmNewPassword: 'NewSecure123!',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // REFRESH TOKEN SCHEMA
  // ========================================
  describe('RefreshTokenSchema', () => {
    it('should accept valid refresh token', () => {
      const result = RefreshTokenSchema.safeParse({
        refreshToken: 'valid_refresh_token',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty refresh token', () => {
      const result = RefreshTokenSchema.safeParse({
        refreshToken: '',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // VERIFY EMAIL SCHEMA
  // ========================================
  describe('VerifyEmailSchema', () => {
    it('should accept valid verification token', () => {
      const result = VerifyEmailSchema.safeParse({
        token: 'verification_token_123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty token', () => {
      const result = VerifyEmailSchema.safeParse({
        token: '',
      });
      expect(result.success).toBe(false);
    });
  });
});
