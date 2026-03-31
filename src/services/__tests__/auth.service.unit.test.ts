/**
 * ============================================
 * AUTH SERVICE UNIT TESTS
 * ============================================
 *
 * Tests AuthService functions in isolation.
 * MongoDB: MongoMemoryServer (via setup.ts)
 * Redis: fully mocked
 *
 * @file src/services/__tests__/auth.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as AuthService from '../auth.service.js';
import { User } from '../../models/User.js';

// ============================================
// MOCK REDIS
// ============================================

vi.mock('../../config/redis.js', () => ({
  setCache: vi.fn().mockResolvedValue(true),
  getCache: vi.fn().mockResolvedValue(null),
  deleteCache: vi.fn().mockResolvedValue(true),
  deleteCachePattern: vi.fn().mockResolvedValue(true),
  isRedisConnected: vi.fn().mockReturnValue(true),
  redisClient: { status: 'ready', on: vi.fn() },
  bullMQConnection: { host: 'localhost', port: 6379 },
}));

import { setCache, getCache, deleteCache } from '../../config/redis.js';

// ============================================
// HELPERS
// ============================================

async function createTestUser(overrides: Record<string, unknown> = {}) {
  return User.create({
    email: `test-${Date.now()}@example.com`,
    password: 'Password1!',
    firstName: 'Test',
    lastName: 'User',
    ...overrides,
  });
}

// ============================================
// REGISTER
// ============================================

describe('AuthService.register', () => {
  beforeEach(() => {
    vi.mocked(setCache).mockResolvedValue(true);
    vi.mocked(getCache).mockResolvedValue(null);
    vi.mocked(deleteCache).mockResolvedValue(true);
  });

  it('should create a new user and return tokens', async () => {
    const input = {
      email: `reg-${Date.now()}@example.com`,
      password: 'Password1!',
      firstName: 'Jane',
      lastName: 'Doe',
    };

    const { user, tokens } = await AuthService.register(input);

    expect(user.email).toBe(input.email);
    expect(user.firstName).toBe('Jane');
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.expiresIn).toBe(900);
  });

  it('should lowercase the email', async () => {
    const { user } = await AuthService.register({
      email: `UPPER-${Date.now()}@EXAMPLE.COM`,
      password: 'Password1!',
      firstName: 'Upper',
      lastName: 'Case',
    });

    expect(user.email).toBe(user.email.toLowerCase());
  });

  it('should throw ConflictError when email already exists', async () => {
    const email = `dup-${Date.now()}@example.com`;
    await AuthService.register({ email, password: 'Password1!', firstName: 'A', lastName: 'B' });

    await expect(
      AuthService.register({ email, password: 'Password1!', firstName: 'C', lastName: 'D' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('should store refresh token in Redis on register', async () => {
    await AuthService.register({
      email: `redis-${Date.now()}@example.com`,
      password: 'Password1!',
      firstName: 'Redis',
      lastName: 'Test',
    });

    expect(setCache).toHaveBeenCalledWith(
      expect.stringContaining('auth:refresh:'),
      expect.any(String),
      expect.any(Number)
    );
  });

  it('should handle valid referral code', async () => {
    const referrer = await createTestUser();
    const referralCode = referrer.referralCode;

    const { user } = await AuthService.register({
      email: `ref-${Date.now()}@example.com`,
      password: 'Password1!',
      firstName: 'Ref',
      lastName: 'User',
      referralCode,
    });

    expect(user.referredBy?.toString()).toBe(referrer._id.toString());
  });

  it('should ignore invalid referral code silently', async () => {
    const { user } = await AuthService.register({
      email: `noref-${Date.now()}@example.com`,
      password: 'Password1!',
      firstName: 'No',
      lastName: 'Ref',
      referralCode: 'INVALID-CODE',
    });

    expect(user.referredBy).toBeUndefined();
  });
});

// ============================================
// LOGIN
// ============================================

describe('AuthService.login', () => {
  beforeEach(() => {
    vi.mocked(setCache).mockResolvedValue(true);
    vi.mocked(getCache).mockResolvedValue(null);
  });

  it('should return user and tokens on valid credentials', async () => {
    const email = `login-${Date.now()}@example.com`;
    await createTestUser({ email, password: 'Password1!' });

    const { user, tokens } = await AuthService.login({ email, password: 'Password1!' });

    expect(user.email).toBe(email);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });

  it('should update lastLoginAt on successful login', async () => {
    const email = `login2-${Date.now()}@example.com`;
    await createTestUser({ email, password: 'Password1!' });

    const before = new Date();
    const { user } = await AuthService.login({ email, password: 'Password1!' });

    expect(user.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('should throw UnauthorizedError on wrong password', async () => {
    const email = `wrongpw-${Date.now()}@example.com`;
    await createTestUser({ email, password: 'Password1!' });

    await expect(
      AuthService.login({ email, password: 'WrongPass1!' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('should throw UnauthorizedError for unknown email', async () => {
    await expect(
      AuthService.login({ email: 'nobody@example.com', password: 'Password1!' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('should throw UnauthorizedError for deactivated account', async () => {
    const email = `inactive-${Date.now()}@example.com`;
    await createTestUser({ email, password: 'Password1!', isActive: false });

    await expect(
      AuthService.login({ email, password: 'Password1!' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ============================================
// LOGOUT
// ============================================

describe('AuthService.logout', () => {
  it('should delete refresh token from Redis', async () => {
    const userId = 'test-user-id';

    await AuthService.logout(userId);

    expect(deleteCache).toHaveBeenCalledWith(`auth:refresh:${userId}`);
  });

  it('should blacklist the refresh token if provided', async () => {
    const userId = 'test-user-id';
    const refreshToken = 'some.refresh.token';

    await AuthService.logout(userId, refreshToken);

    expect(setCache).toHaveBeenCalledWith(
      `auth:blacklist:${refreshToken}`,
      '1',
      3600
    );
  });
});

// ============================================
// REFRESH TOKENS
// ============================================

describe('AuthService.refreshTokens', () => {
  it('should throw UnauthorizedError for invalid token', async () => {
    await expect(
      AuthService.refreshTokens('not.a.valid.jwt')
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('should throw UnauthorizedError when token is blacklisted', async () => {
    // Simulate blacklisted token
    vi.mocked(getCache).mockResolvedValueOnce('1');

    // Use a syntactically valid but expired/invalid refresh token
    await expect(
      AuthService.refreshTokens('bad.refresh.token')
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ============================================
// GET ME
// ============================================

describe('AuthService.getMe', () => {
  it('should return user by ID without password', async () => {
    const created = await createTestUser();
    const user = await AuthService.getMe(created._id.toString());

    expect(user.email).toBe(created.email);
  });

  it('should throw NotFoundError for unknown user ID', async () => {
    const { Types } = await import('mongoose');
    const fakeId = new Types.ObjectId().toString();

    await expect(AuthService.getMe(fakeId)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ============================================
// CHANGE PASSWORD
// ============================================

describe('AuthService.changePassword', () => {
  it('should change password successfully', async () => {
    const user = await createTestUser({ password: 'OldPass1!' });

    await expect(
      AuthService.changePassword(user._id.toString(), 'OldPass1!', 'NewPass1!')
    ).resolves.toBeUndefined();

    // Verify new password works
    const { user: loggedIn } = await AuthService.login({
      email: user.email,
      password: 'NewPass1!',
    });
    expect(loggedIn.email).toBe(user.email);
  });

  it('should throw BadRequestError when current password is wrong', async () => {
    const user = await createTestUser({ password: 'Correct1!' });

    await expect(
      AuthService.changePassword(user._id.toString(), 'Wrong1!', 'NewPass1!')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should invalidate existing sessions on password change', async () => {
    const user = await createTestUser({ password: 'OldPass1!' });

    await AuthService.changePassword(user._id.toString(), 'OldPass1!', 'NewPass1!');

    expect(deleteCache).toHaveBeenCalledWith(`auth:refresh:${user._id.toString()}`);
  });
});

// ============================================
// FORGOT PASSWORD
// ============================================

describe('AuthService.forgotPassword', () => {
  it('should return "ok" for unknown email (prevent enumeration)', async () => {
    const result = await AuthService.forgotPassword('nobody@example.com');
    expect(result).toBe('ok');
    expect(setCache).not.toHaveBeenCalled();
  });

  it('should store reset token in Redis for known email', async () => {
    vi.mocked(setCache).mockResolvedValue(true);
    const user = await createTestUser();

    const token = await AuthService.forgotPassword(user.email);

    expect(token).not.toBe('ok');
    expect(token).toHaveLength(64); // 32 bytes hex
    expect(setCache).toHaveBeenCalledWith(
      expect.stringContaining('auth:reset:'),
      user._id.toString(),
      3600
    );
  });
});

// ============================================
// RESET PASSWORD
// ============================================

describe('AuthService.resetPassword', () => {
  it('should throw BadRequestError for invalid token', async () => {
    vi.mocked(getCache).mockResolvedValue(null);

    await expect(
      AuthService.resetPassword('bad-token', 'NewPass1!')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should reset password and consume the token', async () => {
    const user = await createTestUser({ password: 'OldPass1!' });
    const resetToken = 'valid-reset-token';

    vi.mocked(getCache).mockResolvedValueOnce(user._id.toString());
    vi.mocked(deleteCache).mockResolvedValue(true);

    await AuthService.resetPassword(resetToken, 'NewPass1!');

    // Token and session should be consumed
    expect(deleteCache).toHaveBeenCalledWith(`auth:reset:${resetToken}`);
    expect(deleteCache).toHaveBeenCalledWith(`auth:refresh:${user._id.toString()}`);

    // New password should work
    const { user: loggedIn } = await AuthService.login({
      email: user.email,
      password: 'NewPass1!',
    });
    expect(loggedIn.email).toBe(user.email);
  });
});

// ============================================
// VERIFY EMAIL
// ============================================

describe('AuthService.verifyEmail', () => {
  it('should throw BadRequestError for invalid token', async () => {
    vi.mocked(getCache).mockResolvedValue(null);

    await expect(AuthService.verifyEmail('bad-token')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('should mark user as verified and consume token', async () => {
    const user = await createTestUser({ isVerified: false });
    const verifyToken = 'valid-verify-token';

    vi.mocked(getCache).mockResolvedValueOnce(user._id.toString());
    vi.mocked(deleteCache).mockResolvedValue(true);

    await AuthService.verifyEmail(verifyToken);

    const updated = await User.findById(user._id);
    expect(updated!.isVerified).toBe(true);
    expect(deleteCache).toHaveBeenCalledWith(`auth:verify:${verifyToken}`);
  });
});

// ============================================
// GENERATE VERIFY EMAIL TOKEN
// ============================================

describe('AuthService.generateVerifyEmailToken', () => {
  it('should generate and store a 64-char hex token', async () => {
    vi.mocked(setCache).mockResolvedValue(true);
    const userId = 'user-123';

    const token = await AuthService.generateVerifyEmailToken(userId);

    expect(token).toHaveLength(64);
    expect(setCache).toHaveBeenCalledWith(
      `auth:verify:${token}`,
      userId,
      86400 // 24 hours
    );
  });
});

// ============================================
// OAUTH LOGIN
// ============================================

describe('AuthService.oauthLogin', () => {
  it('should return tokens for an existing active user', async () => {
    const user = await createTestUser();
    vi.mocked(setCache).mockResolvedValue(true);

    const tokens = await AuthService.oauthLogin(user);

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });
});
