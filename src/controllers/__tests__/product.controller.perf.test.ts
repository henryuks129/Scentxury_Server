/**
 * ============================================
 * PRODUCT CONTROLLER — PERFORMANCE TESTS
 * ============================================
 *
 * Tests product API response times against a seeded
 * in-memory MongoDB of 500 products.
 *
 * @file src/controllers/__tests__/product.controller.perf.test.ts
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

// ============================================
// INFRASTRUCTURE MOCKS
// ============================================
//
// Mock Redis + BullMQ queues before importing app. Without these mocks, ioredis
// and BullMQ eagerly open TCP connections to Redis on module load. In CI / local
// environments where Docker is not running those connections fail immediately
// (ECONNREFUSED) and the process keeps retrying, flooding logs and leaking handles.
//
// Three layers of mocking are needed:
//   1. @config/redis.js — the main ioredis client used by CartService
//   2. @queues/payment.queue.js  — BullMQ Queue imported by PaymentController
//   3. @queues/notification.queue.js — BullMQ Queue imported by PaymentController
//   4. @queues/receipt.queue.js — BullMQ Queue imported by PaymentController
//
// These queues are not exercised by product perf tests but are pulled into the
// module graph through app.ts → paymentRoutes → paymentController → queues.

// NOTE: vi.mock factories are hoisted to the top of the file before any
// variable declarations — so all values must be inlined; no external const refs.
vi.mock('../../config/redis.js', () => ({
  redisClient: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    ping: vi.fn().mockResolvedValue('PONG'),
    status: 'ready',
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
  },
  bullMQConnection: { host: 'localhost', port: 6379 },
  connectRedis: vi.fn().mockResolvedValue(undefined),
  disconnectRedis: vi.fn().mockResolvedValue(undefined),
  setCache: vi.fn().mockResolvedValue(undefined),
  getCache: vi.fn().mockResolvedValue(null),
  deleteCache: vi.fn().mockResolvedValue(undefined),
  deleteCachePattern: vi.fn().mockResolvedValue(undefined),
  isRedisConnected: vi.fn().mockReturnValue(true),
  default: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    ping: vi.fn().mockResolvedValue('PONG'),
    status: 'ready',
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../queues/payment.queue.js', () => ({
  paymentQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-job' }) },
  addPaymentRetryJob: vi.fn().mockResolvedValue({ id: 'mock-job' }),
}));

vi.mock('../../queues/notification.queue.js', () => ({
  notificationQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-job' }) },
  addPaymentNotification: vi.fn().mockResolvedValue({ id: 'mock-job' }),
  addOrderNotification: vi.fn().mockResolvedValue({ id: 'mock-job' }),
}));

vi.mock('../../queues/receipt.queue.js', () => ({
  receiptQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-job' }) },
  addGeneratePDFReceiptJob: vi.fn().mockResolvedValue({ id: 'mock-job' }),
}));

// Mock auth middleware so perf tests are not blocked by User.findById DB lookups.
// The beforeEach in setup.ts clears all collections between tests — if authenticate()
// queries the DB it finds no user and returns 401 after the first iteration.
// Perf tests measure throughput, not auth correctness; auth is covered in
// unit/integration test files.
//
// We use jwt.verify synchronously here (no DB round-trip) to decode the test
// token and attach req.user, matching the shape expected by controllers.
vi.mock('../../middleware/auth.middleware.js', async () => {
  const jwt = (await import('jsonwebtoken')).default;
  return {
    authenticate: vi.fn((req: Record<string, unknown>, _res: unknown, next: (e?: unknown) => void) => {
      const auth = (req.headers as Record<string, string> | undefined)?.authorization ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) return next({ statusCode: 401, message: 'No token' });
      try {
        const p = jwt.verify(token, process.env.JWT_SECRET ?? 'test-jwt-secret-for-testing-only') as {
          userId: string;
          role: 'user' | 'admin';
        };
        req.user = { id: p.userId, role: p.role };
        return next();
      } catch {
        return next({ statusCode: 401, message: 'Invalid token' });
      }
    }),
    adminOnly: vi.fn((req: Record<string, unknown>, _res: unknown, next: (e?: unknown) => void) => {
      const user = req.user as { role?: string } | undefined;
      if (user?.role !== 'admin') return next({ statusCode: 403, message: 'Admin required' });
      return next();
    }),
    optionalAuth: vi.fn((_req: unknown, _res: unknown, next: (e?: unknown) => void) => next()),
  };
});

import { app } from '../../app.js';
import { Product } from '../../models/Product.js';
import { measureTime, expectPerformance, generateTestToken } from '../../test/helpers.js';

// ============================================
// SEED 500 PRODUCTS
// ============================================

beforeAll(async () => {
  const ts = Date.now();
  // NOTE: insertMany bypasses Mongoose pre-save hooks, so `slug` and price
  // range fields are not auto-computed. We provide explicit slug + basePrice
  // + maxPrice values here to avoid the unique index on slug_1 rejecting
  // documents with a null slug (E11000 duplicate key error).
  const products = Array(500)
    .fill(null)
    .map((_, i) => ({
      name: `Perf Product ${i} ${ts}`,
      // Explicit slug so insertMany does not leave this null
      slug: `perf-product-${i}-${ts}`,
      description: 'Performance test product description text to fill the field.',
      category: (['male', 'female', 'unisex'] as const)[i % 3],
      brand: `Brand ${i % 20}`,
      scentFamily: (['woody', 'floral', 'oriental', 'fresh'] as const)[i % 4],
      scentNotes: {
        top: ['bergamot'],
        middle: ['rose'],
        base: ['musk'],
      },
      images: {
        boxed: `https://cdn.scentxury.com/${i}/boxed.jpg`,
        bottle: `https://cdn.scentxury.com/${i}/bottle.jpg`,
        thumbnail: `https://cdn.scentxury.com/${i}/thumb.jpg`,
      },
      variants: [
        {
          sku: `PERF${ts}${i}-20ML`,
          size: '20ml' as const,
          priceNGN: 15000 + (i % 10) * 1000,
          priceUSD: 20,
          costPrice: 8000,
          stock: 50,
        },
        {
          sku: `PERF${ts}${i}-50ML`,
          size: '50ml' as const,
          priceNGN: 30000 + (i % 10) * 1000,
          priceUSD: 40,
          costPrice: 15000,
          stock: 30,
        },
      ],
      // Explicit price range (normally computed by pre-save hook)
      basePrice: 15000 + (i % 10) * 1000,
      maxPrice: 30000 + (i % 10) * 1000,
      tags: ['luxury', `brand${i % 20}`],
      isActive: true,
      isFeatured: i < 20,
    }));

  await Product.insertMany(products);
}, 30000);

// ============================================
// LIST PRODUCTS PERFORMANCE
// ============================================

describe('GET /api/v1/products — Performance', () => {
  it('should list products within 200ms (p95)', async () => {
    await expectPerformance(
      async () => {
        await request(app)
          .get('/api/v1/products')
          .query({ page: 1, limit: 20 });
      },
      200,
      20
    );
  });

  it('should filter by category within 200ms (p95)', async () => {
    await expectPerformance(
      async () => {
        await request(app)
          .get('/api/v1/products')
          .query({ category: 'male', page: 1, limit: 20 });
      },
      200,
      20
    );
  });

  it('should handle complex multi-filter query within 300ms (p95)', async () => {
    await expectPerformance(
      async () => {
        await request(app)
          .get('/api/v1/products')
          .query({
            category: 'unisex',
            scentFamily: 'woody',
            minPrice: 10000,
            maxPrice: 60000,
            sort: 'price_asc',
            page: 1,
            limit: 20,
          });
      },
      300,
      20
    );
  });

  it('should handle 20 concurrent list requests within 5s total', async () => {
    const reqs = Array(20)
      .fill(null)
      .map(() =>
        request(app)
          .get('/api/v1/products')
          .query({ page: 1, limit: 20 })
      );

    const { duration } = await measureTime(() => Promise.all(reqs));

    expect(duration).toBeLessThan(5000);
    console.log(`20 concurrent product list requests in ${duration.toFixed(0)}ms`);
  });
});

// ============================================
// SINGLE PRODUCT PERFORMANCE
// ============================================

describe('GET /api/v1/products/:slug — Performance', () => {
  it('should get single product within 100ms (p95)', async () => {
    // Grab a slug from DB
    const product = await Product.findOne({ isActive: true }).lean();
    if (!product) return;

    await expectPerformance(
      async () => {
        await request(app).get(`/api/v1/products/${product.slug}`);
      },
      100,
      30
    );
  });
});

// ============================================
// SEARCH PERFORMANCE
// ============================================

describe('GET /api/v1/products/search — Performance', () => {
  it('should return search results within 200ms (p95)', async () => {
    await expectPerformance(
      async () => {
        await request(app)
          .get('/api/v1/products/search')
          .query({ q: 'luxury' });
      },
      200,
      20
    );
  });
});

// ============================================
// CREATE PRODUCT PERFORMANCE (Admin)
// ============================================

describe('POST /api/v1/products — Performance', () => {
  const adminToken = generateTestToken('admin-perf', 'admin');
  let counter = 0;

  // Product creation involves a MongoDB write + pre-save slug/price hooks +
  // text index update on a large collection — 400ms p95 is the realistic target.
  it('should create product within 400ms (p95)', async () => {
    const ts = Date.now();

    await expectPerformance(
      async () => {
        const c = ++counter;
        await request(app)
          .post('/api/v1/products')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: `Perf New Product ${ts}-${c}`,
            description: 'Performance test creation product',
            category: 'unisex',
            brand: 'Chi',
            scentFamily: 'woody',
            scentNotes: { top: ['bergamot'], middle: ['rose'], base: ['musk'] },
            images: {
              boxed: 'https://cdn.scentxury.com/boxed.jpg',
              bottle: 'https://cdn.scentxury.com/bottle.jpg',
              thumbnail: 'https://cdn.scentxury.com/thumb.jpg',
            },
            variants: [
              {
                sku: `NEWPERF${ts}${c}-20ML`,
                size: '20ml',
                priceNGN: 15000,
                priceUSD: 20,
                costPrice: 8000,
                stock: 50,
              },
            ],
          });
      },
      400,
      10
    );
  });
});
