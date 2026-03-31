/**
 * ============================================
 * AUTH CONTROLLER INTEGRATION TESTS
 * ============================================
 *
 * Full stack tests against real MongoDB (in-memory) and mocked Redis.
 * Each test is self-contained because the global setup.ts clears
 * all collections in `beforeEach`.
 *
 * @file src/controllers/__tests__/auth.controller.int.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';

// ============================================
// MOCK REDIS (avoid real Redis in CI)
// ============================================

vi.mock('../../config/redis.js', () => ({
  setCache: vi.fn().mockResolvedValue(true),
  getCache: vi.fn().mockResolvedValue(null),
  deleteCache: vi.fn().mockResolvedValue(true),
  deleteCachePattern: vi.fn().mockResolvedValue(true),
  isRedisConnected: vi.fn().mockReturnValue(true),
  redisClient: {
    status: 'ready',
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  bullMQConnection: { host: 'localhost', port: 6379 },
}));

// ============================================
// HELPERS
// ============================================

function uniqueEmail() {
  return `int-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const validUserPayload = () => ({
  email: uniqueEmail(),
  password: 'Integration1!',
  confirmPassword: 'Integration1!',
  firstName: 'Integration',
  lastName: 'Tester',
  acceptTerms: true as const,
});

async function registerAndLogin() {
  const payload = validUserPayload();
  const regRes = await request(app).post('/api/v1/auth/register').send(payload);
  return {
    payload,
    accessToken: regRes.body.data?.accessToken as string,
    refreshToken: regRes.body.data?.refreshToken as string,
    regRes,
  };
}

// ============================================
// REGISTER
// ============================================

describe('POST /api/v1/auth/register', () => {
  it('should register a new user and return 201 with tokens', async () => {
    const payload = validUserPayload();
    const res = await request(app).post('/api/v1/auth/register').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: expect.objectContaining({
        email: payload.email,
        firstName: payload.firstName,
      }),
    });
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('should return 409 when registering with an existing email', async () => {
    const payload = validUserPayload();
    await request(app).post('/api/v1/auth/register').send(payload);
    const res = await request(app).post('/api/v1/auth/register').send(payload);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('should return 422 when required fields are missing', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: uniqueEmail(),
    });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('should return 422 when password does not meet requirements', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      ...validUserPayload(),
      password: 'weak',
      confirmPassword: 'weak',
    });

    expect(res.status).toBe(422);
  });

  it('should return 422 when passwords do not match', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      ...validUserPayload(),
      password: 'Password1!',
      confirmPassword: 'Different1!',
    });

    expect(res.status).toBe(422);
  });
});

// ============================================
// LOGIN
// ============================================

describe('POST /api/v1/auth/login', () => {
  let email: string;
  const password = 'Integration1!';

  beforeEach(async () => {
    email = uniqueEmail();
    await request(app).post('/api/v1/auth/register').send({
      email,
      password,
      confirmPassword: password,
      firstName: 'Login',
      lastName: 'Test',
      acceptTerms: true,
    });
  });

  it('should return 200 with tokens on valid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('should return 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail(), password: 'Anything1!' });

    expect(res.status).toBe(401);
  });

  it('should return 422 on invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'Password1!' });

    expect(res.status).toBe(422);
  });
});

// ============================================
// GET ME
// ============================================

describe('GET /api/v1/auth/me', () => {
  let accessToken: string;

  beforeEach(async () => {
    const { accessToken: token } = await registerAndLogin();
    accessToken = token;
  });

  it('should return 200 with user profile when authenticated', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({
      firstName: 'Integration',
      lastName: 'Tester',
    });
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('should return 401 when no token provided', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('should return 401 when token is malformed', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer this.is.garbage');

    expect(res.status).toBe(401);
  });
});

// ============================================
// FORGOT PASSWORD
// ============================================

describe('POST /api/v1/auth/forgot-password', () => {
  it('should return 200 regardless of whether email exists', async () => {
    const { payload } = await registerAndLogin();

    const res1 = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: payload.email });

    const res2 = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: uniqueEmail() });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res2.body.success).toBe(true);
  });

  it('should return 422 on invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'not-valid' });

    expect(res.status).toBe(422);
  });
});

// ============================================
// LOGOUT
// ============================================

describe('POST /api/v1/auth/logout', () => {
  let accessToken: string;

  beforeEach(async () => {
    const { accessToken: token } = await registerAndLogin();
    accessToken = token;
  });

  it('should return 200 on successful logout', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 401 when not authenticated', async () => {
    const res = await request(app).post('/api/v1/auth/logout').send({});
    expect(res.status).toBe(401);
  });
});

// ============================================
// REFRESH TOKEN
// ============================================

describe('POST /api/v1/auth/refresh', () => {
  it('should return 200 with new tokens for a valid refresh token', async () => {
    // Register and capture the refresh token issued at registration
    const { refreshToken } = await registerAndLogin();

    // Mock Redis to return the stored refresh token (simulating that the
    // refresh token was saved during register)
    const { getCache } = await import('../../config/redis.js');
    vi.mocked(getCache).mockResolvedValueOnce(null);          // blacklist check → not blacklisted
    vi.mocked(getCache).mockResolvedValueOnce(refreshToken);  // stored token matches

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: expect.any(Number),
    });
  });

  it('should return 401 for an invalid refresh token string', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not.a.valid.jwt' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 422 when refreshToken field is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    // Field-level errors should be present after error handler fix
    expect(res.body.errors).toBeDefined();
  });
});

// ============================================
// CHANGE PASSWORD
// ============================================

describe('POST /api/v1/auth/change-password', () => {
  let accessToken: string;
  let userEmail: string;
  const userPassword = 'Integration1!';

  beforeEach(async () => {
    const { accessToken: token, payload } = await registerAndLogin();
    accessToken = token;
    userEmail = payload.email;
  });

  it('should return 200 when current password is correct', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: userPassword,
        newPassword: 'NewSecure2@',
        confirmNewPassword: 'NewSecure2@',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/changed/i);
  });

  it('should return 400 when current password is wrong', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'WrongPass1!',
        newPassword: 'NewSecure2@',
        confirmNewPassword: 'NewSecure2@',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 422 when new passwords do not match', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: userPassword,
        newPassword: 'NewSecure2@',
        confirmNewPassword: 'Different3#',
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('should return 422 when new password is same as current', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: userPassword,
        newPassword: userPassword,
        confirmNewPassword: userPassword,
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({
        currentPassword: userPassword,
        newPassword: 'NewSecure2@',
        confirmNewPassword: 'NewSecure2@',
      });

    expect(res.status).toBe(401);
  });

  // Ensure previous access token still works before password change blocks logins
  it('should allow re-login with new password after change', async () => {
    // Change password
    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: userPassword,
        newPassword: 'NewSecure2@',
        confirmNewPassword: 'NewSecure2@',
      });

    // Login with new password
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userEmail, password: 'NewSecure2@' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeTruthy();
  });
});

// ============================================
// VERIFY EMAIL
// ============================================

describe('POST /api/v1/auth/verify-email', () => {
  it('should return 400 for an invalid or expired token', async () => {
    // getCache returns null by default (from mock at top of file) — invalid token
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'invalid-token-abc123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 422 when token field is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });

  it('should return 200 when a valid token is supplied', async () => {
    // Register a user so we have a real user ID in the DB
    const { regRes } = await registerAndLogin();
    const userId = regRes.body.data?.user?.id as string;

    // Simulate the verify token being stored in Redis
    const { getCache } = await import('../../config/redis.js');
    vi.mocked(getCache).mockResolvedValueOnce(userId);

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'valid-verify-token-xyz' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/verified/i);
  });
});

// ============================================
// RESET PASSWORD
// ============================================

describe('POST /api/v1/auth/reset-password', () => {
  it('should return 400 for an invalid or expired reset token', async () => {
    // getCache returns null → token not found
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'bad-token', password: 'NewPass1!', confirmPassword: 'NewPass1!' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 422 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });

  it('should return 422 when passwords do not match', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'abc', password: 'NewPass1!', confirmPassword: 'Different2!' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('should return 200 and reset password when token is valid', async () => {
    // Create a real user so login after reset works
    const { payload } = await registerAndLogin();

    // Simulate valid reset token → user ID stored in Redis
    const { getCache } = await import('../../config/redis.js');
    const { User } = await import('../../models/User.js');
    const existingUser = await User.findOne({ email: payload.email });
    vi.mocked(getCache).mockResolvedValueOnce(existingUser!._id.toString());

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: 'valid-reset-token-xyz',
        password: 'Renewed9!',
        confirmPassword: 'Renewed9!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/reset/i);

    // Confirm new password works
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: 'Renewed9!' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeTruthy();
  });
});
