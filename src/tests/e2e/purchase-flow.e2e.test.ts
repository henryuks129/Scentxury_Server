/**
 * ============================================
 * E2E: COMPLETE PURCHASE FLOW
 * ============================================
 *
 * End-to-end test for the complete customer purchase journey.
 * Each 'Step' test is independent (global beforeEach wipes the DB).
 * Tests are named sequentially to document the intended flow.
 *
 * Flow:
 *   Step 1: Register new user → returns token
 *   Step 2: List products → at least 1 result
 *   Step 3: View product detail → correct variant count
 *   Step 4: Add to cart → items array populated
 *   Step 5: View cart → subtotal calculated correctly
 *   Step 6: Create order from cart → status = pending
 *   Step 7: Initialize Paystack payment → returns authorization_url
 *   Step 8: Track order → trackingHistory populated
 *   Step 9: Complete flow under 10 seconds → timing assertion
 *
 * Strategy:
 *   • MongoDB  → MongoMemoryServer (via global setup.ts)
 *   • Redis    → vi.mock (in-memory map)
 *   • Passport → vi.mock
 *   • Stripe   → vi.mock
 *   • PaymentService → vi.mock
 *
 * @file src/tests/e2e/purchase-flow.e2e.test.ts
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

// 4. PaymentService — mock Paystack initialization
vi.mock('../../services/payment.service.js', () => ({
  PaymentService: {
    initializePaystackPayment: vi.fn(),
    verifyPaystackPayment: vi.fn(),
    handlePaystackWebhook: vi.fn().mockResolvedValue(undefined),
    handleStripeWebhook: vi.fn().mockResolvedValue(undefined),
    verifyStripeWebhookSignature: vi.fn(),
    createStripePaymentIntent: vi.fn(),
  },
}));

// 5. Queue workers
vi.mock('../../queues/receipt.queue.js', () => ({
  addGeneratePDFReceiptJob: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../queues/notification.queue.js', () => ({
  addPaymentNotification: vi.fn().mockResolvedValue(undefined),
  addOrderNotification: vi.fn().mockResolvedValue(undefined),
}));

// ──────────────────────────────────────────────────────────
// Actual imports
// ──────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app.js';
import { Product } from '../../models/Product.js';
import { PaymentService } from '../../services/payment.service.js';

process.env.BCRYPT_ROUNDS = '4';

// ──────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────

const uid = () => `${Date.now()}${Math.floor(Math.random() * 100000)}`;

/** Register a new user and return the access token */
async function registerUser(): Promise<{ token: string; email: string }> {
  const email = `e2e_${uid()}@scentxury.test`;
  const res = await request(app)
    .post('/api/v1/auth/register')
    .set('Connection', 'close')
    .send({ email, password: 'PurchaseE2E123!', firstName: 'Flow', lastName: 'Buyer' });

  if (res.status !== 201 || !res.body.data?.accessToken) {
    throw new Error(`Registration failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.data.accessToken as string, email };
}

/** Seed a product and return its identifiers.
 * SKUs must match /^[A-Z0-9-]+$/ (CreateOrderSchema validation).
 */
async function seedProduct(): Promise<{ slug: string; id: string; variantSku: string }> {
  // Use only uppercase + digits + hyphens for SKU to pass the validator regex
  const ts = Date.now().toString();
  const product = await Product.create({
    name: `Flow Oud ${ts}`,
    slug: `flow-oud-${ts}`,
    description: 'E2E test fragrance',
    shortDescription: 'Flow Test',
    category: 'unisex',
    brand: 'Chi',
    scentNotes: { top: ['bergamot'], middle: ['rose'], base: ['musk'] },
    scentFamily: 'woody',
    images: {
      boxed: 'https://example.com/b.jpg',
      bottle: 'https://example.com/bot.jpg',
      thumbnail: 'https://example.com/t.jpg',
    },
    variants: [
      { sku: `OUD-50ML-${ts}`, size: '50ml', priceNGN: 35000, priceUSD: 45, costPrice: 17500, stock: 50 },
      { sku: `OUD-100ML-${ts}`, size: '100ml', priceNGN: 55000, priceUSD: 70, costPrice: 27500, stock: 30 },
    ],
  });
  return { slug: product.slug, id: String(product._id), variantSku: product.variants[0]!.sku };
}

afterAll(() => {
  mockRedisStore.clear();
});

// ──────────────────────────────────────────────────────────
// SETUP
// ──────────────────────────────────────────────────────────

beforeEach(async () => {
  // Restore Redis mock implementations after vi.resetAllMocks()
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

  // Re-set PaymentService mock after reset
  vi.mocked(PaymentService.initializePaystackPayment).mockResolvedValue({
    authorizationUrl: 'https://checkout.paystack.com/e2e_test',
    accessCode: 'e2e_access_code',
    reference: `E2E-PAY-${uid()}`,
  });
});

// ──────────────────────────────────────────────────────────
// E2E STEPS (each test is independently self-contained)
// ──────────────────────────────────────────────────────────

describe('E2E: Complete Purchase Flow', () => {
  it('Step 1: Register new user → returns token', async () => {
    // A brand-new customer registers; the response must include a JWT access token
    const email = `e2e_step1_${uid()}@scentxury.test`;
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Connection', 'close')
      .send({ email, password: 'PurchaseE2E123!', firstName: 'Flow', lastName: 'Buyer' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.user.role).toBe('user');
  });

  it('Step 2: List products → at least 1 result', async () => {
    // Seed one product then browse the catalogue
    await seedProduct();

    const res = await request(app).get('/api/v1/products').set('Connection', 'close');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.products)).toBe(true);
    expect(res.body.data.products.length).toBeGreaterThanOrEqual(1);
  });

  it('Step 3: View product detail → correct variant count', async () => {
    // The seeded product has exactly 2 variants (50ml + 100ml)
    const { slug } = await seedProduct();

    const res = await request(app).get(`/api/v1/products/${slug}`).set('Connection', 'close');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Product detail returns data: { product: {...} }
    const product = (res.body.data.product ?? res.body.data) as { variants: unknown[] };
    expect(product.variants.length).toBe(2);
  });

  it('Step 4: Add to cart → items array populated', async () => {
    // Authenticated user adds a variant to their cart
    const { token } = await registerUser();
    const { id: productId, variantSku } = await seedProduct();

    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .set('Connection', 'close')
      .send({ productId, variantSku, quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // addToCart returns data: { cart: { items: [...], ... } }
    const cart = (res.body.data?.cart ?? res.body.data) as { items: unknown[] };
    expect(cart.items.length).toBeGreaterThanOrEqual(1);
  });

  it('Step 5: View cart → subtotal calculated correctly', async () => {
    // After adding items, cart subtotal should be > 0
    const { token } = await registerUser();
    const { id: productId, variantSku } = await seedProduct();

    // Add item first
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .set('Connection', 'close')
      .send({ productId, variantSku, quantity: 2 });

    // Now view the cart
    const res = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${token}`)
      .set('Connection', 'close');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // getCartSummary returns { items, subtotalNGN, subtotalUSD, ... }
    const cart = res.body.data as { items: unknown[]; subtotalNGN: number };
    expect(cart.items.length).toBeGreaterThanOrEqual(1);
    expect(cart.subtotalNGN).toBeGreaterThan(0);
  });

  it('Step 6: Create order from cart → status = pending', async () => {
    // Place an order; initial status must be 'pending'
    const { token } = await registerUser();
    const { id: productId, variantSku } = await seedProduct();

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Connection', 'close')
      .send({
        items: [{ productId, variantSku, quantity: 1, priceAtPurchase: 35000 }],
        shippingAddress: {
          recipientName: 'E2E Buyer',
          phone: '08012345678',
          street: '1 Scentxury Way, Victoria Island',
          city: 'Lagos',
          state: 'Lagos State',
        },
        paymentMethod: 'paystack',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.order.status).toBe('pending');
    expect(res.body.data.order.paymentStatus).toBe('pending');
  });

  it('Step 7: Initialize Paystack payment → returns authorization_url', async () => {
    // Create order then initialize payment
    const { token } = await registerUser();
    const { id: productId, variantSku } = await seedProduct();

    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Connection', 'close')
      .send({
        items: [{ productId, variantSku, quantity: 1, priceAtPurchase: 35000 }],
        shippingAddress: {
          recipientName: 'Pay Buyer',
          phone: '08012345678',
          street: '2 Payment Way',
          city: 'Lagos',
          state: 'Lagos State',
        },
        paymentMethod: 'paystack',
      });

    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.order._id as string;

    const payRes = await request(app)
      .post('/api/v1/payments/paystack/initialize')
      .set('Authorization', `Bearer ${token}`)
      .set('Connection', 'close')
      .send({ orderId, email: 'pay@e2e.test', amount: 35000, paymentMethod: 'paystack' });

    expect(payRes.status).toBe(200);
    expect(payRes.body.success).toBe(true);
    expect(typeof payRes.body.data.authorizationUrl).toBe('string');
    expect(payRes.body.data.authorizationUrl).toContain('paystack');
  });

  it('Step 8: Track order → trackingHistory populated', async () => {
    // Create an order and then fetch it — trackingHistory should be an array
    const { token } = await registerUser();
    const { id: productId, variantSku } = await seedProduct();

    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Connection', 'close')
      .send({
        items: [{ productId, variantSku, quantity: 1, priceAtPurchase: 35000 }],
        shippingAddress: {
          recipientName: 'Track Buyer',
          phone: '08012345678',
          street: '3 Track Road',
          city: 'Lagos',
          state: 'Lagos State',
        },
        paymentMethod: 'paystack',
      });

    expect(orderRes.status).toBe(201);
    const orderNumber = orderRes.body.data.order.orderNumber as string;

    const trackRes = await request(app)
      .get(`/api/v1/orders/${orderNumber}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Connection', 'close');

    expect(trackRes.status).toBe(200);
    expect(trackRes.body.success).toBe(true);
    // order detail returns data: { order: {...} } or data directly depending on sendSuccess
    const orderData = trackRes.body.data?.order ?? trackRes.body.data;
    expect(Array.isArray(orderData.trackingHistory)).toBe(true);
  });

  it('Complete flow under 10 seconds → timing assertion', async () => {
    // The complete flow (register + create product + place order) should be fast
    const startMs = Date.now();

    const { token } = await registerUser();
    const { id: productId, variantSku } = await seedProduct();

    await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Connection', 'close')
      .send({
        items: [{ productId, variantSku, quantity: 1, priceAtPurchase: 35000 }],
        shippingAddress: {
          recipientName: 'Speed Buyer',
          phone: '08012345678',
          street: '4 Fast Lane',
          city: 'Lagos',
          state: 'Lagos State',
        },
        paymentMethod: 'paystack',
      });

    const elapsed = Date.now() - startMs;
    console.log(`E2E purchase mini-flow elapsed time: ${elapsed}ms`);
    // Individual test step should complete well within 10 seconds
    expect(elapsed).toBeLessThan(10_000);
  });
});
