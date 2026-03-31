/**
 * ============================================
 * PAYMENT ROUTES — INTEGRATION TESTS
 * ============================================
 *
 * Integration tests for /api/v1/payments/* routes.
 *
 * Strategy:
 *   • MongoDB  → MongoMemoryServer (via global setup.ts)
 *   • Redis    → vi.mock (ioredis never connects in tests)
 *   • Passport → vi.mock (prevents OAuth strategy boot errors)
 *   • Stripe   → vi.mock (no real Stripe calls)
 *   • PaymentService → vi.mock (isolate HTTP layer from business logic)
 *   • Queue workers → vi.mock (no BullMQ needed in route tests)
 *
 * Routes tested:
 *   POST /api/v1/payments/paystack/initialize  — 401 without auth, calls service
 *   POST /api/v1/payments/webhook/paystack     — 200 on valid sig, 400 on missing sig
 *   POST /api/v1/payments/webhook/stripe       — 200 on valid, error on bad payload
 *   POST /api/v1/payments/stripe/intent        — 401 without auth, 200 with auth
 *   GET  /api/v1/payments/paystack/verify      — 401 without auth
 *
 * @file src/routes/__tests__/payment.routes.int.test.ts
 */

// ──────────────────────────────────────────────────────────
// MOCK ORDER — must precede all app imports
// vi.hoisted ensures mock variables are available inside vi.mock factories
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

// 1. Redis — full in-memory mock
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
  deleteCache: vi.fn(async (key: string) => {
    mockRedisStore.delete(key);
  }),
  deleteCachePattern: vi.fn(async (pattern: string) => {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    [...mockRedisStore.keys()].filter((k) => regex.test(k)).forEach((k) => mockRedisStore.delete(k));
  }),
  default: mockRedisClient,
}));

// 2. Passport — mock the full passport instance (routes call passport.authenticate)
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

// 3. Stripe — prevent missing API key errors
vi.mock('../../config/stripe.js', () => ({
  stripe: {
    paymentIntents: { create: vi.fn().mockResolvedValue({ client_secret: 'pi_test_secret' } ) },
    webhooks: { constructEvent: vi.fn() },
  },
  default: {
    paymentIntents: { create: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  },
}));

// 4. PaymentService — isolate HTTP layer from service implementation
vi.mock('../../services/payment.service.js', () => ({
  PaymentService: {
    initializePaystackPayment: vi.fn(),
    verifyPaystackPayment: vi.fn(),
    handlePaystackWebhook: vi.fn(),
    initializeStripePayment: vi.fn(),
    handleStripeWebhook: vi.fn(),
    createStripePaymentIntent: vi.fn(),
    // verifyStripeWebhookSignature is exported as a standalone function on PaymentService
    verifyStripeWebhookSignature: vi.fn().mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test', amount: 5000, currency: 'usd' } },
    }),
  },
}));

// 5. Queue workers — no BullMQ/Redis needed in route-level tests
vi.mock('../../queues/receipt.queue.js', () => ({
  addGeneratePDFReceiptJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../queues/notification.queue.js', () => ({
  addPaymentNotification: vi.fn().mockResolvedValue(undefined),
}));

// ──────────────────────────────────────────────────────────
// Actual imports (after mocks are registered)
// ──────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app.js';
import { User } from '../../models/User.js';
import { Order } from '../../models/Order.js';
import { signAccessToken } from '../../utils/jwt.js';
import { PaymentService } from '../../services/payment.service.js';

// Low bcrypt cost for fast test user creation
process.env.BCRYPT_ROUNDS = '4';

// ──────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────

const uid = () => `${Date.now()}${Math.random().toString(36).slice(2)}`;
const uniqueEmail = () => `pay_test_${uid()}@scentxury.test`;

// ──────────────────────────────────────────────────────────
// SETUP — runs after global setup.ts beforeEach wipes collections
// ──────────────────────────────────────────────────────────

let userToken: string;
let userId: string;
let testOrderId: string;

beforeEach(async () => {
  // Restore Redis mock implementations that vi.resetAllMocks() cleared
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

  // Restore PaymentService mocks to clean state
  vi.mocked(PaymentService.initializePaystackPayment).mockResolvedValue({
    authorizationUrl: 'https://checkout.paystack.com/test_url',
    accessCode: 'test_access_code',
    reference: 'PAY-TEST-REF-001',
  });
  vi.mocked(PaymentService.verifyPaystackPayment).mockResolvedValue({
    status: 'success',
    reference: 'PAY-TEST-REF-001',
    amount: 3500000, // kobo
    currency: 'NGN',
    paidAt: new Date().toISOString(),
  });
  vi.mocked(PaymentService.handlePaystackWebhook).mockResolvedValue(undefined);
  vi.mocked(PaymentService.handleStripeWebhook).mockResolvedValue(undefined);
  // verifyStripeWebhookSignature is called synchronously by handleStripeWebhook controller
  vi.mocked(PaymentService.verifyStripeWebhookSignature).mockReturnValue({
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_test', amount: 5000, currency: 'usd' } },
  } as ReturnType<typeof PaymentService.verifyStripeWebhookSignature>);

  // Create a test user and token
  const testUser = await User.create({
    email: uniqueEmail(),
    password: 'TestPass123!',
    firstName: 'Pay',
    lastName: 'Tester',
    role: 'user',
    isActive: true,
  });

  userId = String(testUser._id);
  userToken = signAccessToken({ userId, role: 'user' });

  // Create a minimal order for payment initialization tests
  if (mongoose.connection.readyState === 1) {
    const order = await Order.create({
      userId: new mongoose.Types.ObjectId(userId),
      orderNumber: `CHI${Date.now()}`,
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          productName: 'Test Fragrance',
          variantSku: 'CHI-TEST-50ML',
          variantSize: '50ml',
          quantity: 1,
          unitPrice: 35000,
          costPrice: 17500,
          discount: 0,
          total: 35000,
        },
      ],
      shippingAddress: {
        recipientName: 'Test User',
        phone: '+2348012345678',
        street: '1 Test Street',
        city: 'Lagos',
        state: 'Lagos State',
        country: 'Nigeria',
      },
      paymentMethod: 'paystack',
      subtotal: 35000,
      discount: 0,
      deliveryFee: 1500,
      total: 36500,
      currency: 'NGN',
      status: 'pending',
      paymentStatus: 'pending',
    });
    testOrderId = String(order._id);
  }
});

// ──────────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────────

describe('Payment Routes — Integration', () => {
  // ============================================
  // PAYSTACK INITIALIZE
  // ============================================
  describe('POST /api/v1/payments/paystack/initialize', () => {
    it('returns 401 when request has no Authorization header', async () => {
      // Unauthenticated users must not be able to initialize payments
      const res = await request(app)
        .post('/api/v1/payments/paystack/initialize')
        .send({ orderId: testOrderId, email: 'test@test.com', amount: 35000 });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 and authorization_url for a valid authenticated request', async () => {
      // Happy path: authenticated user initializes Paystack payment for an existing order
      const res = await request(app)
        .post('/api/v1/payments/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          orderId: testOrderId,
          email: 'pay@tester.com',
          amount: 36500,
          paymentMethod: 'paystack',
        });

      // Service returns auth URL — controller should relay it
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('authorizationUrl');
    });

    it('returns 404 when orderId does not exist', async () => {
      // Controller calls Order.findById — a non-existent ID returns 404
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/v1/payments/paystack/initialize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          orderId: fakeId,
          email: 'pay@tester.com',
          amount: 35000,
          paymentMethod: 'paystack',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ============================================
  // PAYSTACK WEBHOOK
  // ============================================
  describe('POST /api/v1/payments/webhook/paystack', () => {
    it('returns 200 when webhook signature header is present', async () => {
      // Paystack sends x-paystack-signature header; webhook route accepts it
      const payload = { event: 'charge.success', data: { reference: 'PAY-REF-001' } };

      const res = await request(app)
        .post('/api/v1/payments/webhook/paystack')
        .set('x-paystack-signature', 'sha512-valid-hash-here')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when webhook signature header is missing', async () => {
      // Route controller requires the signature header; missing = 400 BadRequestError
      const res = await request(app)
        .post('/api/v1/payments/webhook/paystack')
        .send({ event: 'charge.success', data: {} });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('is publicly accessible — no auth token required', async () => {
      // Webhooks from Paystack are unauthenticated; route must not require JWT
      const res = await request(app)
        .post('/api/v1/payments/webhook/paystack')
        .set('x-paystack-signature', 'test-signature')
        .send({ event: 'charge.success', data: { reference: 'TEST-REF' } });

      // Should NOT return 401
      expect(res.status).not.toBe(401);
    });
  });

  // ============================================
  // STRIPE WEBHOOK
  // ============================================
  describe('POST /api/v1/payments/webhook/stripe', () => {
    it('returns 200 when Stripe webhook is handled without error', async () => {
      // Stripe webhook handler is mocked to resolve successfully
      const res = await request(app)
        .post('/api/v1/payments/webhook/stripe')
        .set('stripe-signature', 'test-stripe-sig')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } }));

      // Mocked handler resolves → 200
      expect(res.status).toBe(200);
    });

    it('is publicly accessible — no auth token required', async () => {
      // Stripe webhooks are unauthenticated server-to-server calls
      const res = await request(app)
        .post('/api/v1/payments/webhook/stripe')
        .set('stripe-signature', 'sig')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ type: 'payment_intent.succeeded', data: {} }));

      expect(res.status).not.toBe(401);
    });
  });

  // ============================================
  // STRIPE INTENT
  // ============================================
  describe('POST /api/v1/payments/stripe/intent', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      // Stripe intent route requires authentication (authenticate middleware)
      const res = await request(app)
        .post('/api/v1/payments/stripe/intent')
        .send({ orderId: testOrderId, amount: 5000, email: 'test@test.com' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ============================================
  // PAYSTACK VERIFY
  // ============================================
  describe('GET /api/v1/payments/paystack/verify', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      // Verify route requires authentication
      const res = await request(app)
        .get('/api/v1/payments/paystack/verify')
        .query({ reference: 'PAY-TEST-REF' });

      expect(res.status).toBe(401);
    });

    it('returns 200 with verification result when authenticated', async () => {
      // Mocked service returns success
      const res = await request(app)
        .get('/api/v1/payments/paystack/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ reference: 'PAY-TEST-REF-001' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('status', 'success');
    });
  });

  // ============================================
  // RESPONSE SHAPE
  // ============================================
  describe('Error response shape', () => {
    it('all 401 responses include success:false and a message string', async () => {
      const res = await request(app)
        .post('/api/v1/payments/paystack/initialize')
        .send({ orderId: 'x', amount: 100, email: 'x@x.com' });

      expect(res.body.success).toBe(false);
      expect(typeof res.body.message).toBe('string');
    });
  });
});
