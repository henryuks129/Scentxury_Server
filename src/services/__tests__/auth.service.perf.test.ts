/**
 * ============================================
 * AUTH SERVICE PERFORMANCE TESTS
 * ============================================
 *
 * Ensures auth operations meet response time SLAs.
 * bcrypt is intentionally slow — tests account for that.
 *
 * @file src/services/__tests__/auth.service.perf.test.ts
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as AuthService from '../auth.service.js';
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

import { setCache, getCache } from '../../config/redis.js';

// ============================================
// SETUP
// ============================================

const perfPassword = 'PerfTest1!';

beforeAll(() => {
  vi.mocked(setCache).mockResolvedValue(true);
  vi.mocked(getCache).mockResolvedValue(null);
});

// ============================================
// REGISTER PERFORMANCE
// ============================================

describe('AuthService.register - Performance', () => {
  it('should complete registration within 6000ms (bcrypt cost 12 — intentionally slow)', async () => {
    vi.mocked(setCache).mockResolvedValue(true);

    const { duration } = await measureTime(() =>
      AuthService.register({
        email: `reg-perf-${Date.now()}@example.com`,
        password: perfPassword,
        firstName: 'Perf',
        lastName: 'Reg',
      })
    );

    // bcrypt cost 12 is designed to be slow (~400ms-4s depending on machine)
    expect(duration).toBeLessThan(6000);
  });
});

// ============================================
// LOGIN PERFORMANCE
// ============================================

describe('AuthService.login - Performance', () => {
  let loginEmail: string;

  // Re-create user before each test (global beforeEach clears DB between tests)
  beforeEach(async () => {
    vi.mocked(setCache).mockResolvedValue(true);
    loginEmail = `login-perf-${Date.now()}@example.com`;
    await AuthService.register({
      email: loginEmail,
      password: perfPassword,
      firstName: 'Perf',
      lastName: 'Login',
    });
  });

  it('should complete login within 6000ms (bcrypt comparison — intentionally slow)', async () => {
    vi.mocked(setCache).mockResolvedValue(true);

    const { duration } = await measureTime(() =>
      AuthService.login({ email: loginEmail, password: perfPassword })
    );

    expect(duration).toBeLessThan(6000);
  });

  it('should reject wrong password within 6000ms', async () => {
    const { duration } = await measureTime(() =>
      AuthService.login({ email: loginEmail, password: 'WrongPass1!' }).catch(() => {})
    );

    expect(duration).toBeLessThan(6000);
  });
});

// ============================================
// TOKEN OPERATIONS PERFORMANCE
// ============================================

describe('AuthService token operations - Performance', () => {
  it('logout should complete within 20ms (Redis operations)', async () => {
    vi.mocked(setCache).mockResolvedValue(true);
    vi.mocked(getCache).mockResolvedValue(null);

    const { duration } = await measureTime(() =>
      AuthService.logout('perf-user-id', 'some.refresh.token')
    );

    expect(duration).toBeLessThan(20);
  });

  it('forgotPassword for unknown email should complete within 10ms (no DB hit)', async () => {
    const { duration } = await measureTime(() =>
      AuthService.forgotPassword('nobody@example.com')
    );

    expect(duration).toBeLessThan(10);
  });

  it('generateVerifyEmailToken should complete within 10ms', async () => {
    vi.mocked(setCache).mockResolvedValue(true);

    const { duration } = await measureTime(() =>
      AuthService.generateVerifyEmailToken('some-user-id')
    );

    expect(duration).toBeLessThan(10);
  });
});

// ============================================
// CONCURRENT REGISTRATIONS PERFORMANCE
// ============================================

describe('AuthService concurrent operations - Performance', () => {
  it('should handle 3 concurrent registrations within 30 seconds', async () => {
    vi.mocked(setCache).mockResolvedValue(true);

    const registrations = Array(3)
      .fill(null)
      .map((_, i) =>
        AuthService.register({
          email: `concurrent-${i}-${Date.now()}@example.com`,
          password: perfPassword,
          firstName: 'Concurrent',
          lastName: `User${i}`,
        })
      );

    const { duration } = await measureTime(() => Promise.all(registrations));

    // bcrypt is CPU-bound; 3 concurrent ops with cost 12 can take up to 30s on slow machines
    expect(duration).toBeLessThan(30000);
  });
});
