/**
 * ============================================
 * AUTH CONTROLLER PERFORMANCE TESTS
 * ============================================
 *
 * Ensures critical auth endpoints meet response time SLAs.
 *
 * @file src/controllers/__tests__/auth.controller.perf.test.ts
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { measureTime } from '../../test/helpers.js';

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

// ============================================
// TEST DATA
// ============================================

const perfUser = {
  email: `perf-${Date.now()}@example.com`,
  password: 'PerfTest1!',
  confirmPassword: 'PerfTest1!',
  firstName: 'Perf',
  lastName: 'Test',
  acceptTerms: true,
};

let perfAccessToken: string;

// ============================================
// SETUP
// ============================================

beforeAll(async () => {
  const res = await request(app).post('/api/v1/auth/register').send(perfUser);
  perfAccessToken = res.body.data?.accessToken || '';
});

// ============================================
// REGISTER PERFORMANCE
// ============================================

describe('POST /api/v1/auth/register - Performance', () => {
  it('should respond within 3000ms (single registration with bcrypt)', async () => {
    const email = `perf-reg-${Date.now()}@example.com`;
    const { duration } = await measureTime(async () => {
      await request(app).post('/api/v1/auth/register').send({
        ...perfUser,
        email,
      });
    });

    expect(duration).toBeLessThan(3000);
  });

  it('should handle 10 concurrent registrations within 30 seconds', async () => {
    const registrations = Array(10)
      .fill(null)
      .map((_, i) =>
        request(app)
          .post('/api/v1/auth/register')
          .send({
            ...perfUser,
            email: `concurrent-${i}-${Date.now()}@example.com`,
          })
      );

    const { duration } = await measureTime(async () => {
      await Promise.all(registrations);
    });

    expect(duration).toBeLessThan(30000);
  }, 60000);
});

// ============================================
// LOGIN PERFORMANCE
// ============================================

describe('POST /api/v1/auth/login - Performance', () => {
  it('should respond within 500ms (includes bcrypt)', async () => {
    const { duration } = await measureTime(async () => {
      await request(app).post('/api/v1/auth/login').send({
        email: perfUser.email,
        password: perfUser.password,
      });
    });

    expect(duration).toBeLessThan(500);
  });

  it('should handle 20 concurrent logins within 10 seconds', async () => {
    const logins = Array(20)
      .fill(null)
      .map(() =>
        request(app).post('/api/v1/auth/login').send({
          email: perfUser.email,
          password: perfUser.password,
        })
      );

    const { duration } = await measureTime(async () => {
      await Promise.all(logins);
    });

    expect(duration).toBeLessThan(10000);
  });
});

// ============================================
// GET ME PERFORMANCE
// ============================================

describe('GET /api/v1/auth/me - Performance', () => {
  it('should respond within 500ms', async () => {
    const { duration } = await measureTime(async () => {
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${perfAccessToken}`);
    });

    expect(duration).toBeLessThan(500);
  });

  it('should handle 50 concurrent GET /me requests within 5 seconds', async () => {
    const requests = Array(50)
      .fill(null)
      .map(() =>
        request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${perfAccessToken}`)
      );

    const { duration } = await measureTime(async () => {
      await Promise.all(requests);
    });

    expect(duration).toBeLessThan(5000);
  });
});

// ============================================
// VALIDATION REJECTION PERFORMANCE
// ============================================

describe('Validation rejection - Performance', () => {
  it('should reject invalid requests within 200ms (no DB hit)', async () => {
    const { duration } = await measureTime(async () => {
      await request(app).post('/api/v1/auth/login').send({ email: 'bad' });
    });

    expect(duration).toBeLessThan(200);
  });
});
