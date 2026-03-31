/**
 * ============================================
 * USER MODEL - UNIT TESTS
 * ============================================
 *
 * TDD: Tests written first, then implementation.
 * Uses MongoDB Memory Server from test setup.
 *
 * @file src/models/__tests__/User.unit.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { User, IUser } from '../User.js';

describe('User Model', () => {
  // Helper to create valid user data
  const createValidUser = (overrides = {}) => ({
    email: 'test@example.com',
    password: 'Password123!',
    firstName: 'John',
    lastName: 'Doe',
    ...overrides,
  });

  // ========================================
  // SCHEMA VALIDATION TESTS
  // ========================================
  describe('Schema Validation', () => {
    it('should create a valid user', async () => {
      const userData = createValidUser();
      const user = await User.create(userData);

      expect(user._id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.firstName).toBe('John');
      expect(user.lastName).toBe('Doe');
      expect(user.role).toBe('user');
      expect(user.isActive).toBe(true);
      expect(user.isVerified).toBe(false);
    });

    it('should require email', async () => {
      const user = new User(createValidUser({ email: undefined }));

      await expect(user.save()).rejects.toThrow(/email/i);
    });

    it('should require valid email format', async () => {
      const user = new User(createValidUser({ email: 'invalid-email' }));

      await expect(user.save()).rejects.toThrow(/email/i);
    });

    it('should lowercase email', async () => {
      const user = await User.create(createValidUser({ email: 'TEST@EXAMPLE.COM' }));

      expect(user.email).toBe('test@example.com');
    });

    it('should trim email whitespace', async () => {
      const user = await User.create(createValidUser({ email: '  test@example.com  ' }));

      expect(user.email).toBe('test@example.com');
    });

    it('should require password', async () => {
      const user = new User(createValidUser({ password: undefined }));

      await expect(user.save()).rejects.toThrow(/password/i);
    });

    it('should require minimum password length of 8', async () => {
      const user = new User(createValidUser({ password: 'short' }));

      await expect(user.save()).rejects.toThrow(/password/i);
    });

    it('should require firstName', async () => {
      const user = new User(createValidUser({ firstName: undefined }));

      await expect(user.save()).rejects.toThrow(/first/i);
    });

    it('should require lastName', async () => {
      const user = new User(createValidUser({ lastName: undefined }));

      await expect(user.save()).rejects.toThrow(/last/i);
    });

    it('should trim firstName whitespace', async () => {
      const user = await User.create(createValidUser({ firstName: '  John  ' }));

      expect(user.firstName).toBe('John');
    });

    it('should enforce unique email', async () => {
      await User.create(createValidUser({ email: 'unique@example.com' }));

      const duplicateUser = new User(createValidUser({ email: 'unique@example.com' }));

      await expect(duplicateUser.save()).rejects.toThrow(/duplicate/i);
    });

    it('should default role to user', async () => {
      const user = await User.create(createValidUser());

      expect(user.role).toBe('user');
    });

    it('should allow admin role', async () => {
      const user = await User.create(createValidUser({
        email: 'admin@example.com',
        role: 'admin'
      }));

      expect(user.role).toBe('admin');
    });

    it('should reject invalid role', async () => {
      const user = new User(createValidUser({ role: 'superuser' as any }));

      await expect(user.save()).rejects.toThrow();
    });

    it('should validate phone number format', async () => {
      const user = await User.create(createValidUser({
        email: 'phone@example.com',
        phone: '+2348012345678'
      }));

      expect(user.phone).toBe('+2348012345678');
    });

    it('should reject invalid phone number', async () => {
      const user = new User(createValidUser({ phone: '123' }));

      await expect(user.save()).rejects.toThrow(/phone/i);
    });
  });

  // ========================================
  // PASSWORD HASHING TESTS
  // ========================================
  describe('Password Hashing', () => {
    it('should hash password on save', async () => {
      const plainPassword = 'Password123!';
      const user = await User.create(createValidUser({ password: plainPassword }));

      // Fetch with password
      const userWithPassword = await User.findById(user._id).select('+password');

      expect(userWithPassword?.password).not.toBe(plainPassword);
      expect(userWithPassword?.password).toMatch(/^\$2[aby]\$/); // bcrypt hash pattern
    });

    it('should not rehash password if not modified', async () => {
      const user = await User.create(createValidUser({ email: 'hash1@example.com' }));

      const userWithPassword = await User.findById(user._id).select('+password');
      const originalHash = userWithPassword?.password;

      // Update non-password field
      userWithPassword!.firstName = 'Jane';
      await userWithPassword!.save();

      const updatedUser = await User.findById(user._id).select('+password');
      expect(updatedUser?.password).toBe(originalHash);
    });

    it('should rehash password when password is modified', async () => {
      const user = await User.create(createValidUser({ email: 'hash2@example.com' }));

      const userWithPassword = await User.findById(user._id).select('+password');
      const originalHash = userWithPassword?.password;

      userWithPassword!.password = 'NewPassword456!';
      await userWithPassword!.save();

      const updatedUser = await User.findById(user._id).select('+password');
      expect(updatedUser?.password).not.toBe(originalHash);
    });

    it('should not expose password by default', async () => {
      await User.create(createValidUser({ email: 'hidden@example.com' }));

      const user = await User.findOne({ email: 'hidden@example.com' });

      expect(user?.password).toBeUndefined();
    });
  });

  // ========================================
  // COMPARE PASSWORD TESTS
  // ========================================
  describe('comparePassword', () => {
    it('should return true for correct password', async () => {
      const plainPassword = 'Password123!';
      const user = await User.create(createValidUser({
        email: 'compare1@example.com',
        password: plainPassword
      }));

      const userWithPassword = await User.findById(user._id).select('+password');
      const isMatch = await userWithPassword!.comparePassword(plainPassword);

      expect(isMatch).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const user = await User.create(createValidUser({ email: 'compare2@example.com' }));

      const userWithPassword = await User.findById(user._id).select('+password');
      const isMatch = await userWithPassword!.comparePassword('WrongPassword123!');

      expect(isMatch).toBe(false);
    });

    it('should return false for empty password', async () => {
      const user = await User.create(createValidUser({ email: 'compare3@example.com' }));

      const userWithPassword = await User.findById(user._id).select('+password');
      const isMatch = await userWithPassword!.comparePassword('');

      expect(isMatch).toBe(false);
    });
  });

  // ========================================
  // REFERRAL CODE TESTS
  // ========================================
  describe('Referral Code', () => {
    it('should auto-generate referral code', async () => {
      const user = await User.create(createValidUser({ email: 'ref1@example.com' }));

      expect(user.referralCode).toBeDefined();
      expect(user.referralCode).toMatch(/^CHI-[A-Z0-9]{6}$/);
    });

    it('should generate unique referral codes', async () => {
      const user1 = await User.create(createValidUser({ email: 'ref2@example.com' }));
      const user2 = await User.create(createValidUser({ email: 'ref3@example.com' }));

      expect(user1.referralCode).not.toBe(user2.referralCode);
    });

    it('should not regenerate referral code on update', async () => {
      const user = await User.create(createValidUser({ email: 'ref4@example.com' }));
      const originalCode = user.referralCode;

      user.firstName = 'Updated';
      await user.save();

      expect(user.referralCode).toBe(originalCode);
    });

    it('should initialize referral counts to 0', async () => {
      const user = await User.create(createValidUser({ email: 'ref5@example.com' }));

      expect(user.referralCount).toBe(0);
      expect(user.referralRewardsClaimed).toBe(0);
    });
  });

  // ========================================
  // VIRTUAL PROPERTIES TESTS
  // ========================================
  describe('Virtual Properties', () => {
    it('should return fullName', async () => {
      const user = await User.create(createValidUser({ email: 'virtual1@example.com' }));

      expect(user.fullName).toBe('John Doe');
    });

    it('should update fullName when names change', async () => {
      const user = await User.create(createValidUser({ email: 'virtual2@example.com' }));

      user.firstName = 'Jane';
      user.lastName = 'Smith';

      expect(user.fullName).toBe('Jane Smith');
    });
  });

  // ========================================
  // ADDRESS TESTS
  // ========================================
  describe('Addresses', () => {
    it('should add address to user', async () => {
      const user = await User.create(createValidUser({
        email: 'addr1@example.com',
        addresses: [{
          label: 'Home',
          street: '123 Main St',
          city: 'Lagos',
          state: 'Lagos',
          country: 'Nigeria',
          isDefault: true,
        }],
      }));

      expect(user.addresses).toHaveLength(1);
      expect(user.addresses[0].city).toBe('Lagos');
      expect(user.addresses[0].isDefault).toBe(true);
    });

    it('should support multiple addresses', async () => {
      const user = await User.create(createValidUser({
        email: 'addr2@example.com',
        addresses: [
          { street: '123 Main St', city: 'Lagos', state: 'Lagos', isDefault: true },
          { street: '456 Work Ave', city: 'Abuja', state: 'FCT', isDefault: false },
        ],
      }));

      expect(user.addresses).toHaveLength(2);
    });

    it('should default country to Nigeria', async () => {
      const user = await User.create(createValidUser({
        email: 'addr3@example.com',
        addresses: [{
          street: '123 Main St',
          city: 'Lagos',
          state: 'Lagos',
        }],
      }));

      expect(user.addresses[0].country).toBe('Nigeria');
    });

    it('should store coordinates', async () => {
      const user = await User.create(createValidUser({
        email: 'addr4@example.com',
        addresses: [{
          street: '123 Main St',
          city: 'Lagos',
          state: 'Lagos',
          coordinates: { lat: 6.5244, lng: 3.3792 },
        }],
      }));

      expect(user.addresses[0].coordinates?.lat).toBe(6.5244);
      expect(user.addresses[0].coordinates?.lng).toBe(3.3792);
    });
  });

  // ========================================
  // SCENT PREFERENCES TESTS
  // ========================================
  describe('Scent Preferences', () => {
    it('should store scent preferences', async () => {
      const user = await User.create(createValidUser({
        email: 'scent1@example.com',
        scentPreferences: {
          preferredNotes: ['oud', 'sandalwood', 'vanilla'],
          avoidNotes: ['citrus'],
          intensity: 'strong',
          occasions: ['evening', 'special'],
        },
      }));

      expect(user.scentPreferences?.preferredNotes).toContain('oud');
      expect(user.scentPreferences?.intensity).toBe('strong');
      expect(user.scentPreferences?.occasions).toContain('evening');
    });

    it('should default intensity to moderate', async () => {
      const user = await User.create(createValidUser({
        email: 'scent2@example.com',
        scentPreferences: {
          preferredNotes: ['oud'],
        },
      }));

      expect(user.scentPreferences?.intensity).toBe('moderate');
    });

    it('should validate intensity enum', async () => {
      const user = new User(createValidUser({
        scentPreferences: {
          intensity: 'extreme' as any,
        },
      }));

      await expect(user.save()).rejects.toThrow();
    });
  });

  // ========================================
  // OAUTH TESTS
  // ========================================
  describe('OAuth Fields', () => {
    it('should store googleId', async () => {
      const user = await User.create(createValidUser({
        email: 'oauth1@example.com',
        googleId: 'google123456',
      }));

      expect(user.googleId).toBe('google123456');
    });

    it('should store appleId', async () => {
      const user = await User.create(createValidUser({
        email: 'oauth2@example.com',
        appleId: 'apple123456',
      }));

      expect(user.appleId).toBe('apple123456');
    });

    it('should allow user without OAuth ids', async () => {
      const user = await User.create(createValidUser({ email: 'oauth3@example.com' }));

      expect(user.googleId).toBeUndefined();
      expect(user.appleId).toBeUndefined();
    });
  });

  // ========================================
  // TIMESTAMPS TESTS
  // ========================================
  describe('Timestamps', () => {
    it('should have createdAt timestamp', async () => {
      const user = await User.create(createValidUser({ email: 'time1@example.com' }));

      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it('should have updatedAt timestamp', async () => {
      const user = await User.create(createValidUser({ email: 'time2@example.com' }));

      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt on save', async () => {
      const user = await User.create(createValidUser({ email: 'time3@example.com' }));
      const originalUpdatedAt = user.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      user.firstName = 'Updated';
      await user.save();

      expect(user.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  // ========================================
  // INDEX TESTS
  // ========================================
  describe('Indexes', () => {
    it('should find user by email efficiently', async () => {
      await User.create(createValidUser({ email: 'index1@example.com' }));

      const user = await User.findOne({ email: 'index1@example.com' });

      expect(user).toBeDefined();
      expect(user?.email).toBe('index1@example.com');
    });

    it('should find user by referralCode', async () => {
      const created = await User.create(createValidUser({ email: 'index2@example.com' }));

      const user = await User.findOne({ referralCode: created.referralCode });

      expect(user).toBeDefined();
      expect(user?.email).toBe('index2@example.com');
    });

    it('should find users by role', async () => {
      await User.create(createValidUser({ email: 'index3@example.com', role: 'admin' }));
      await User.create(createValidUser({ email: 'index4@example.com', role: 'user' }));

      const admins = await User.find({ role: 'admin' });

      expect(admins.length).toBeGreaterThanOrEqual(1);
    });
  });
});
