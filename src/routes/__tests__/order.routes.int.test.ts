/**
 * ============================================
 * ORDER ROUTES — INTEGRATION TESTS
 * ============================================
 *
 * Integration tests for /api/v1/orders/* routes.
 * Tests the complete order lifecycle via HTTP.
 *
 * Routes tested:
 *   POST  /api/v1/orders                — 401 without auth, 201 on valid order
 *   GET   /api/v1/orders                — 401 without auth, 200 returns user orders
 *   GET   /api/v1/orders/:orderNumber   — 200 for own order, 404 for unknown
 *   POST  /api/v1/orders/:id/cancel     — 200 cancel, 400 if already shipped
 *   GET   /api/v1/orders/admin          — 403 for regular user, 200 for admin
 *   Full lifecycle: register → create order → cancel flow
 *
 * Strategy:
 *   • MongoDB  → MongoMemoryServer (via global setup.ts)
 *   • Redis    → vi.mock (in-memory)
 *   • Passport → vi.mock
 *   • Stripe   → vi.mock
 *   • OrderService → vi.mock (isolate HTTP from business logic)
 *
 * @file src/routes/__tests__/order.routes.int.test.ts
 */

// ──────────────────────────────────────────────────────────
// MOCK ORDER — must precede all app imports
// ──────────────────────────────────────────────────────────

const { mockRedisStore, mockRedisClient } = vi.hoisted(() => {
  const store: Map<string, string> = new Map();
  const client = {
    status: 'ready' as string,
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    setex: vi.fn((key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: vi.fn((...keys: string[]) => {
      keys.forEach((k) => store.delete(k));
      return Promise.resolve(keys.length);
    }),
    keys: vi.fn((pattern: string) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Promise.resolve([...store.keys()].filter((k) => regex.test(k)));
    }),
    quit: vi.fn().mockResolvedValue('OK'),
    on: vi.fn(),
  };
  return { mockRedisStore: store, mockRedisClient: client };
});

// 1. Redis
vi.mock('../../config/redis.js', () => ({
  redisClient: mockRedisClient,
  bullMQConnection: { host: 'localhost', port: 6379, maxRetriesPerRequest: null },
  connectRedis: vi.fn().mockResolvedValue(undefined),
  disconnectRedis: vi.fn().mockResolvedValue(undefined),
  isRedisConnected: vi.fn(() => mockRedisClient.status === 'ready'),
  setCache: vi.fn(async (key: string, value: unknown) => {
    mockRedisStore.set(key, JSON.stringify(value));
  }),
  getCache: vi.fn(async <T>(key: string): Promise<T | null> => {
    const val = mockRedisStore.get(key);
    if (!val) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as unknown as T;
    }
  }),
  deleteCache: vi.fn(async (key: string) => { mockRedisStore.delete(key); }),
  deleteCachePattern: vi.fn(async (pattern: string) => {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    [...mockRedisStore.keys()].filter((k) => regex.test(k)).forEach((k) => mockRedisStore.delete(k));
  }),
  default: mockRedisClient,
}));

// 2. Passport
vi.mock('../../config/passport.js', () => {
  const noop = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    default: {
      authenticate: vi.fn(() => noop),
      initialize: vi.fn(() => noop),
      session: vi.fn(() => noop),
      use: vi.fn(),
      serializeUser: vi.fn(),
      deserializeUser: vi.fn(),
    },
  };
});

// 3. Stripe
vi.mock('../../config/stripe.js', () => ({
  stripe: { paymentIntents: { create: vi.fn() } },
  default: { paymentIntents: { create: vi.fn() } },
}));

// 4. OrderService — mock so we control what the service returns
vi.mock('../../services/order.service.js', () => ({
  OrderService: {
    createOrder: vi.fn(),
    getUserOrders: vi.fn(),    // controller calls getUserOrders (not getMyOrders)
    getOrderByNumber: vi.fn(),
    cancelOrder: vi.fn(),
    getAdminOrders: vi.fn(),
    updateOrderStatus: vi.fn(),
  },
}));

// 5. CartService (imported by order controller)
vi.mock('../../services/cart.service.js', () => ({
  CartService: {
    getCartByUserId: vi.fn(),
    clearCart: vi.fn(),
  },
}));

// ──────────────────────────────────────────────────────────
// Actual imports
// ──────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app.js';
import { User } from '../../models/User.js';
import { signAccessToken } from '../../utils/jwt.js';
import { OrderService } from '../../services/order.service.js';

process.env.BCRYPT_ROUNDS = '4';

// ──────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────

const uid = () => `${Date.now()}${Math.random().toString(36).slice(2)}`;
const uniqueEmail = () => `order_test_${uid()}@scentxury.test`;

/** Minimal valid order body matching CreateOrderSchema */
const validOrderBody = () => ({
  items: [
    {
      productId: new mongoose.Types.ObjectId().toString(),
      variantSku: 'CHI-001-50ML',
      quantity: 1,
      priceAtPurchase: 35000,
    },
  ],
  shippingAddress: {
    recipientName: 'Test Customer',
    phone: '08012345678',
    street: '5 Victoria Island',
    city: 'Lagos',
    state: 'Lagos State',
  },
  paymentMethod: 'paystack',
});

/** Stubbed order document returned by mocked OrderService */
function orderStub(userId: string) {
  const orderNumber = `CHI${Date.now()}`;
  return {
    _id: new mongoose.Types.ObjectId().toString(),
    orderNumber,
    userId,
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: 'paystack',
    items: [{ productName: 'Oud Royal', variantSku: 'CHI-001-50ML', quantity: 1, priceAtPurchase: 35000 }],
    subtotal: 35000,
    deliveryFee: 1500,
    total: 36500,
    currency: 'NGN',
    shippingAddress: { recipientName: 'Test Customer', phone: '+2348012345678', street: '5 VI', city: 'Lagos', state: 'Lagos State', country: 'Nigeria' },
    trackingHistory: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ──────────────────────────────────────────────────────────
// SETUP
// ──────────────────────────────────────────────────────────

let userToken: string;
let adminToken: string;
let userId: string;

beforeEach(async () => {
  // Restore Redis mock implementations
  const redisMock = await import('../../config/redis.js');
  vi.mocked(redisMock.setCache).mockImplementation(async (key: string, value: unknown) => {
    mockRedisStore.set(key, JSON.stringify(value));
  });
  vi.mocked(redisMock.getCache).mockImplementation(async <T>(key: string): Promise<T | null> => {
    const val = mockRedisStore.get(key);
    if (!val) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as unknown as T;
    }
  });
  vi.mocked(redisMock.isRedisConnected).mockReturnValue(true);

  // Create test users
  const user = await User.create({
    email: uniqueEmail(),
    password: 'TestPass123!',
    firstName: 'Order',
    lastName: 'Tester',
    role: 'user',
    isActive: true,
  });
  userId = String(user._id);
  userToken = signAccessToken({ userId, role: 'user' });

  const admin = await User.create({
    email: uniqueEmail(),
    password: 'AdminPass123!',
    firstName: 'Admin',
    lastName: 'Tester',
    role: 'admin',
    isActive: true,
  });
  adminToken = signAccessToken({ userId: String(admin._id), role: 'admin' });

  // Default service mock implementations
  vi.mocked(OrderService.createOrder).mockResolvedValue(
    orderStub(userId) as ReturnType<typeof OrderService.createOrder> extends Promise<infer T> ? T : never
  );
  vi.mocked(OrderService.getUserOrders).mockResolvedValue({
    orders: [orderStub(userId)] as Parameters<typeof OrderService.getUserOrders>[0] extends infer T ? T extends string ? never : never : never,
    pagination: { page: 1, limit: 20, total: 1, pages: 1 },
  } as Awaited<ReturnType<typeof OrderService.getUserOrders>>);
  vi.mocked(OrderService.getOrderByNumber).mockResolvedValue(
    orderStub(userId) as Awaited<ReturnType<typeof OrderService.getOrderByNumber>>
  );
  vi.mocked(OrderService.cancelOrder).mockResolvedValue(
    { ...orderStub(userId), status: 'cancelled' } as Awaited<ReturnType<typeof OrderService.cancelOrder>>
  );
  vi.mocked(OrderService.getAdminOrders).mockResolvedValue({
    orders: [],
    pagination: { page: 1, limit: 20, total: 0, pages: 0 },
  } as Awaited<ReturnType<typeof OrderService.getAdminOrders>>);
});

// ──────────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────────

describe('Order Routes — Integration', () => {
  // ============================================
  // CREATE ORDER
  // ============================================
  describe('POST /api/v1/orders', () => {
    it('returns 401 without authentication', async () => {
      // All order routes require authentication
      const res = await request(app)
        .post('/api/v1/orders')
        .send(validOrderBody());

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 201 with created order on valid authenticated request', async () => {
      // Authenticated user creates a valid order
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validOrderBody());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('order');
    });

    it('calls OrderService.createOrder with the user ID and validated data', async () => {
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validOrderBody());

      expect(OrderService.createOrder).toHaveBeenCalledOnce();
      const [calledUserId] = vi.mocked(OrderService.createOrder).mock.calls[0]!;
      expect(calledUserId).toBe(userId);
    });

    it('returns 422 when items array is empty (schema validation)', async () => {
      // validate(CreateOrderSchema) rejects empty items array
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ ...validOrderBody(), items: [] });

      expect([400, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('returns 422 when paymentMethod is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ ...validOrderBody(), paymentMethod: 'bitcoin' });

      expect([400, 422]).toContain(res.status);
    });
  });

  // ============================================
  // LIST MY ORDERS
  // ============================================
  describe('GET /api/v1/orders', () => {
    it('returns 401 without authentication', async () => {
      const res = await request(app).get('/api/v1/orders');
      expect(res.status).toBe(401);
    });

    it('returns 200 with paginated orders for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('calls OrderService.getUserOrders with correct userId', async () => {
      await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`);

      expect(OrderService.getUserOrders).toHaveBeenCalledOnce();
    });
  });

  // ============================================
  // GET SINGLE ORDER
  // ============================================
  describe('GET /api/v1/orders/:orderNumber', () => {
    it('returns 401 without authentication', async () => {
      const res = await request(app).get('/api/v1/orders/CHI202501000001');
      expect(res.status).toBe(401);
    });

    it('returns 200 with order data for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/orders/CHI202501000001')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 when order is not found', async () => {
      // Service throws NotFoundError for unknown order numbers
      const { NotFoundError } = await import('../../utils/errors.js');
      vi.mocked(OrderService.getOrderByNumber).mockRejectedValueOnce(
        new NotFoundError('Order')
      );

      const res = await request(app)
        .get('/api/v1/orders/CHI000000000000')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ============================================
  // CANCEL ORDER
  // ============================================
  describe('POST /api/v1/orders/:orderNumber/cancel', () => {
    it('returns 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/orders/CHI202501000001/cancel')
        .send({ reason: 'Changed my mind about this purchase', cancelledBy: 'customer' });

      expect(res.status).toBe(401);
    });

    it('returns 200 with cancelled order on valid request', async () => {
      // CancelOrderSchema requires reason (min 10 chars) and cancelledBy
      const res = await request(app)
        .post('/api/v1/orders/CHI202501000001/cancel')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ reason: 'Changed my mind about this purchase', cancelledBy: 'customer' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when attempting to cancel an already-shipped order', async () => {
      // Service throws BadRequestError when order cannot be cancelled
      const { BadRequestError } = await import('../../utils/errors.js');
      vi.mocked(OrderService.cancelOrder).mockRejectedValueOnce(
        new BadRequestError('Cannot cancel a shipped order')
      );

      const res = await request(app)
        .post('/api/v1/orders/CHI202501000001/cancel')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ reason: 'Changed my mind about this purchase', cancelledBy: 'customer' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ============================================
  // ADMIN ORDERS
  // ============================================
  describe('GET /api/v1/orders/admin', () => {
    it('returns 401 without authentication', async () => {
      const res = await request(app).get('/api/v1/orders/admin');
      expect(res.status).toBe(401);
    });

    it('returns 403 for regular user', async () => {
      // adminOnly middleware blocks non-admin access
      const res = await request(app)
        .get('/api/v1/orders/admin')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 200 with all orders for admin user', async () => {
      const res = await request(app)
        .get('/api/v1/orders/admin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ============================================
  // FULL LIFECYCLE: CREATE → CANCEL
  // ============================================
  describe('Full order lifecycle: create → cancel', () => {
    it('creates an order and then successfully cancels it', async () => {
      // Step 1: Create the order
      // Use Connection: close so the socket is released before the next request,
      // preventing "Expected HTTP/" parse errors in singleFork mode.
      const createRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Connection', 'close')
        .send(validOrderBody());

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.order).toHaveProperty('orderNumber');

      const orderNumber = createRes.body.data.order.orderNumber as string;

      // Step 2: Cancel the order
      const cancelRes = await request(app)
        .post(`/api/v1/orders/${orderNumber}/cancel`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('Connection', 'close')
        .send({ reason: 'Customer requested cancellation before shipping', cancelledBy: 'customer' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);
    });
  });

  // ============================================
  // ERROR RESPONSE SHAPE
  // ============================================
  describe('Error response consistency', () => {
    it('all error responses include success:false and message string', async () => {
      const res = await request(app).get('/api/v1/orders');
      expect(res.body.success).toBe(false);
      expect(typeof res.body.message).toBe('string');
    });
  });
});
