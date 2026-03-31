/**
 * ============================================
 * TEST HELPER UTILITIES
 * ============================================
 *
 * Provides common utilities for testing:
 * - Mock request/response objects
 * - JWT token generation
 * - Performance measurement
 * - Test data factories
 *
 * @file src/test/helpers.ts
 */

import { vi, expect } from 'vitest';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { Request, Response, NextFunction } from 'express';

// ============================================
// JWT TOKEN UTILITIES
// ============================================

/**
 * Generate a test JWT token
 */
export function generateTestToken(
  userId: string = new Types.ObjectId().toString(),
  role: 'user' | 'admin' = 'user',
  expiresIn: SignOptions['expiresIn'] = '1h'
): string {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only',
    { expiresIn }
  );
}

/**
 * Generate an expired test token
 */
export function generateExpiredToken(
  userId: string = new Types.ObjectId().toString(),
  role: 'user' | 'admin' = 'user'
): string {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only',
    { expiresIn: '-1h' } // Already expired
  );
}

/**
 * Generate an invalid token (wrong secret)
 */
export function generateInvalidToken(
  userId: string = new Types.ObjectId().toString()
): string {
  return jwt.sign({ userId }, 'wrong-secret', { expiresIn: '1h' });
}

// ============================================
// MOCK REQUEST/RESPONSE
// ============================================

interface MockRequestOptions {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  user?: {
    id: string;
    role: 'user' | 'admin';
    email?: string;
  } | null;
  cookies?: Record<string, string>;
  method?: string;
  path?: string;
  ip?: string;
}

/**
 * Create a mock Express request object
 */
export function mockRequest(options: MockRequestOptions = {}): Partial<Request> {
  return {
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    headers: options.headers || {},
    user: options.user || null,
    cookies: options.cookies || {},
    method: options.method || 'GET',
    path: options.path || '/',
    ip: options.ip || '127.0.0.1',
    get: vi.fn((header: string) => options.headers?.[header.toLowerCase()]),
  } as Partial<Request>;
}

/**
 * Create a mock Express response object
 */
export function mockResponse(): Partial<Response> & {
  _getData: () => unknown;
  _getStatusCode: () => number;
} {
  let statusCode = 200;
  let responseData: unknown = null;

  const res: Partial<Response> & {
    _getData: () => unknown;
    _getStatusCode: () => number;
  } = {
    status: vi.fn(function (code: number) {
      statusCode = code;
      return res as Response;
    }),
    json: vi.fn(function (data: unknown) {
      responseData = data;
      return res as Response;
    }),
    send: vi.fn(function (data: unknown) {
      responseData = data;
      return res as Response;
    }),
    sendStatus: vi.fn(function (code: number) {
      statusCode = code;
      return res as Response;
    }),
    set: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    redirect: vi.fn(),
    // Helper methods for assertions
    _getData: () => responseData,
    _getStatusCode: () => statusCode,
  };

  return res;
}

/**
 * Create a mock next function
 */
export function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ============================================
// PERFORMANCE MEASUREMENT
// ============================================

interface PerformanceResult<T> {
  result: T;
  duration: number;
}

/**
 * Measure execution time of an async function
 */
export async function measureTime<T>(
  fn: () => Promise<T>
): Promise<PerformanceResult<T>> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}

/**
 * Performance test helper - runs function multiple times and checks p95
 */
export async function expectPerformance(
  fn: () => Promise<unknown>,
  maxDuration: number,
  iterations: number = 100,
  percentile: number = 95
): Promise<{ avg: number; p95: number; min: number; max: number }> {
  // One discard warm-up run before measurement.
  // The very first operation on a MongoMemoryServer connection incurs cold-start
  // overhead (model compilation, index sync, V8 JIT) that is 10-100× slower than
  // steady-state.  Discarding it makes the p95 reflect real throughput rather than
  // an artefact of test ordering, so thresholds can remain meaningful without
  // being unrealistically loose.
  await fn();

  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const { duration } = await measureTime(fn);
    durations.push(duration);
  }

  // Sort for percentile calculation
  durations.sort((a, b) => a - b);

  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const p95Index = Math.floor(iterations * (percentile / 100));
  const p95 = durations[p95Index] || durations[durations.length - 1] || 0;
  const min = durations[0] || 0;
  const max = durations[durations.length - 1] || 0;

  // Assert that p95 is within limit
  expect(p95).toBeLessThan(maxDuration);

  console.log(
    `Performance: avg=${avg.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, min=${min.toFixed(2)}ms, max=${max.toFixed(2)}ms`
  );

  return { avg, p95, min, max };
}

// ============================================
// TEST DATA FACTORIES
// ============================================

/**
 * Generate a valid test user object
 */
export function createTestUser(overrides: Record<string, unknown> = {}) {
  return {
    email: `test${Date.now()}${Math.random().toString(36).slice(2)}@example.com`,
    password: 'Password123!',
    firstName: 'Test',
    lastName: 'User',
    role: 'user' as const,
    ...overrides,
  };
}

/**
 * Generate a valid admin user object
 */
export function createTestAdmin(overrides: Record<string, unknown> = {}) {
  return createTestUser({
    role: 'admin' as const,
    firstName: 'Admin',
    ...overrides,
  });
}

/**
 * Generate a valid test product object
 */
export function createTestProduct(overrides: Record<string, unknown> = {}) {
  const timestamp = Date.now();
  return {
    name: `Test Product ${timestamp}`,
    slug: `test-product-${timestamp}`,
    description: 'A test product for unit testing',
    shortDescription: 'Test product',
    category: 'unisex' as const,
    brand: 'Test Brand',
    scentNotes: {
      top: ['bergamot', 'lemon'],
      middle: ['jasmine', 'rose'],
      base: ['sandalwood', 'musk'],
    },
    scentFamily: 'floral',
    images: {
      boxed: 'https://example.com/boxed.jpg',
      bottle: 'https://example.com/bottle.jpg',
      thumbnail: 'https://example.com/thumb.jpg',
    },
    variants: [
      {
        sku: `TEST-20ML-${timestamp}`,
        size: '20ml' as const,
        priceNGN: 15000,
        priceUSD: 20,
        costPrice: 7500,
        stock: 50,
      },
      {
        sku: `TEST-50ML-${timestamp}`,
        size: '50ml' as const,
        priceNGN: 30000,
        priceUSD: 40,
        costPrice: 15000,
        stock: 30,
      },
      {
        sku: `TEST-100ML-${timestamp}`,
        size: '100ml' as const,
        priceNGN: 50000,
        priceUSD: 65,
        costPrice: 25000,
        stock: 20,
      },
    ],
    ...overrides,
  };
}

/**
 * Generate a valid test address object
 */
export function createTestAddress(overrides: Record<string, unknown> = {}) {
  return {
    label: 'Home',
    street: '123 Test Street',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    postalCode: '100001',
    isDefault: true,
    ...overrides,
  };
}

// ============================================
// ASSERTION HELPERS
// ============================================

/**
 * Assert API response structure
 */
export function assertApiResponse(
  response: { success: boolean; message?: string; data?: unknown },
  expectedSuccess: boolean
) {
  expect(response).toHaveProperty('success', expectedSuccess);
  if (expectedSuccess) {
    expect(response).toHaveProperty('message');
  }
}

/**
 * Assert error response structure
 */
export function assertErrorResponse(
  response: { success: boolean; message: string; errors?: unknown[] },
  expectedMessage?: string
) {
  expect(response.success).toBe(false);
  expect(response.message).toBeDefined();
  if (expectedMessage) {
    expect(response.message).toContain(expectedMessage);
  }
}

// ============================================
// WAIT UTILITIES
// ============================================

/**
 * Wait for specified milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await wait(interval);
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

// ============================================
// RANDOM DATA GENERATORS
// ============================================

/**
 * Generate a random email
 */
export function randomEmail(): string {
  return `test${Date.now()}${Math.random().toString(36).slice(2)}@example.com`;
}

/**
 * Generate a random ObjectId
 */
export function randomObjectId(): Types.ObjectId {
  return new Types.ObjectId();
}

/**
 * Generate a random string
 */
export function randomString(length: number = 10): string {
  return Math.random()
    .toString(36)
    .slice(2, 2 + length);
}
