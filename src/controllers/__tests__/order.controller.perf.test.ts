/**
 * ============================================
 * ORDER CONTROLLER — PERFORMANCE TESTS
 * ============================================
 *
 * Tests order API response times.
 *
 * @file src/controllers/__tests__/order.controller.perf.test.ts
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
// Four layers of mocking are needed:
//   1. @config/redis.js  — the main ioredis client used by CartService
//   2. @queues/payment.queue.js  — BullMQ Queue imported by PaymentController
//   3. @queues/notification.queue.js — BullMQ Queue imported by PaymentController
//   4. @queues/receipt.queue.js — BullMQ Queue imported by PaymentController

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
import { User } from '../../models/User.js';
import { Product } from '../../models/Product.js';
import { Order } from '../../models/Order.js';
import { measureTime, expectPerformance, generateTestToken } from '../../test/helpers.js';
import mongoose from 'mongoose';

// ============================================
// TEST DATA
// ============================================

let testUserId: string;
let testProductId: string;
let testVariantSku: string;
let userToken: string;

beforeAll(async () => {
  const ts = Date.now();

  const user = await User.create({
    email: `orderperf-${ts}@test.com`,
    password: 'Password123!',
    firstName: 'Perf',
    lastName: 'Test',
  });
  testUserId = user._id.toString();
  userToken = generateTestToken(testUserId, 'user');

  const product = await Product.create({
    name: `Perf Order Product ${ts}`,
    description: 'Performance test order product',
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
        sku: `PERFORDER${ts}-50ML`,
        size: '50ml',
        priceNGN: 30000,
        priceUSD: 40,
        costPrice: 15000,
        stock: 100000, // large stock for perf tests
      },
    ],
  });
  testProductId = product._id.toString();
  testVariantSku = product.variants[0]!.sku;

  // Pre-create 200 orders for list perf tests.
  // NOTE: We use insertMany with explicit orderNumber values because insertMany
  // bypasses Mongoose pre-save hooks — the orderNumber hook would never fire,
  // leaving the field null. Since orderNumber has a unique index, a second null
  // would throw E11000. We generate unique numbers here instead.
  const orderData = Array(200).fill(null).map((_, i) => ({
    // CHI + YYYYMM + zero-padded index — matches the format from Order pre-save hook
    orderNumber: `CHI${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(ts).slice(-4)}${String(i).padStart(3, '0')}`,
    userId: new mongoose.Types.ObjectId(testUserId),
    items: [
      {
        productId: new mongoose.Types.ObjectId(testProductId),
        productName: 'Perf Product',
        variantSku: testVariantSku,
        variantSize: '50ml',
        quantity: 1,
        unitPrice: 30000,
        costPrice: 15000,
        discount: 0,
        total: 30000,
      },
    ],
    subtotal: 30000,
    discount: 0,
    deliveryFee: 1500,
    total: 31500,
    currency: 'NGN',
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: 'paystack',
    shippingAddress: {
      street: '10 Test Street',
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      phone: '+2348012345678',
      recipientName: `User ${i}`,
    },
    deliveryType: 'standard',
    trackingHistory: [],
  }));

  await Order.insertMany(orderData);
}, 60000);

// ============================================
// LIST ORDERS PERFORMANCE
// ============================================

describe('GET /api/v1/orders — Performance', () => {
  it('should list user orders within 150ms (p95)', async () => {
    await expectPerformance(
      async () => {
        await request(app)
          .get('/api/v1/orders')
          .set('Authorization', `Bearer ${userToken}`)
          .query({ page: 1, limit: 20 });
      },
      150,
      20
    );
  });

  it('should handle 20 concurrent order list requests within 5s', async () => {
    const reqs = Array(20).fill(null).map(() =>
      request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ page: 1, limit: 20 })
    );

    const { duration } = await measureTime(() => Promise.all(reqs));

    expect(duration).toBeLessThan(5000);
    console.log(`20 concurrent order list requests in ${duration.toFixed(0)}ms`);
  });
});

// ============================================
// CREATE ORDER PERFORMANCE
// ============================================

describe('POST /api/v1/orders — Performance', () => {
  it('should create order within 300ms (p95)', async () => {
    await expectPerformance(
      async () => {
        await request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            items: [
              { productId: testProductId, variantSku: testVariantSku, quantity: 1 },
            ],
            paymentMethod: 'paystack',
            deliveryType: 'standard',
            shippingAddress: {
              recipientName: 'Perf User',
              phone: '+2348012345678',
              street: '10 Test Street',
              city: 'Lagos',
              state: 'Lagos',
            },
          });
      },
      300,
      10
    );
  });
});
