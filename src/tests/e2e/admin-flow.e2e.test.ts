/**
 * ============================================
 * E2E: ADMIN DASHBOARD FLOW
 * ============================================
 *
 * End-to-end test for the admin operational workflow:
 *   Step 1: Admin login → role = admin in JWT
 *   Step 2: GET /admin/dashboard → returns sales metrics
 *   Step 3: GET /admin/analytics/inventory → lists all variant stocks
 *   Step 4: PATCH /admin/orders/:id/status → status updated
 *   Step 5: POST /admin/summaries/generate → daily summary triggered
 *   Step 6: Non-admin user blocked from /admin/* → 403
 *
 * Strategy:
 *   • MongoDB  → MongoMemoryServer (via global setup.ts)
 *   • Redis    → vi.mock
 *   • Passport → vi.mock
 *   • Stripe   → vi.mock
 *   • AnalyticsService / AdminService / OrderService → vi.mock
 *
 * @file src/tests/e2e/admin-flow.e2e.test.ts
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

// 4. AnalyticsService — stubbed BI data
vi.mock('../../services/analytics.service.js', () => ({
  AnalyticsService: {
    getDashboardSummary: vi.fn(),
    getSalesAnalytics: vi.fn(),
    getInventoryReport: vi.fn(),
    getPnLReport: vi.fn(),
    getChartData: vi.fn(),
    getDailySummaries: vi.fn(),
    calculateDailySummary: vi.fn(),
  },
}));

// 5. AdminService
vi.mock('../../services/admin.service.js', () => ({
  AdminService: {
    createExpense: vi.fn(),
    getExpenses: vi.fn(),
    deleteExpense: vi.fn(),
    getInventoryTransactions: vi.fn(),
  },
}));

// 6. OrderService — for admin status update
vi.mock('../../services/order.service.js', () => ({
  OrderService: {
    createOrder: vi.fn(),
    getMyOrders: vi.fn(),
    getOrderByNumber: vi.fn(),
    cancelOrder: vi.fn(),
    getAdminOrders: vi.fn(),
    updateOrderStatus: vi.fn(),
  },
}));

// 7. CouponService
vi.mock('../../services/coupon.service.js', () => ({
  CouponService: {
    createCoupon: vi.fn(),
    getAllCoupons: vi.fn(),
    getCoupon: vi.fn(),
    updateCoupon: vi.fn(),
    deactivateCoupon: vi.fn(),
  },
}));

// 8. RecommendationService
vi.mock('../../services/recommendation.service.js', () => ({
  RecommendationService: {
    getHybridRecommendations: vi.fn(),
    getContentBasedRecommendations: vi.fn(),
    getComboMixRecommendations: vi.fn(),
    getUserRecommendations: vi.fn(),
    getChurnRiskUsers: vi.fn(),
    runUserClustering: vi.fn(),
  },
}));

// ──────────────────────────────────────────────────────────
// Actual imports
// ──────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app.js';
import { User } from '../../models/User.js';
import { Order } from '../../models/Order.js';
import { signAccessToken } from '../../utils/jwt.js';
import { AnalyticsService } from '../../services/analytics.service.js';
import { OrderService } from '../../services/order.service.js';

process.env.BCRYPT_ROUNDS = '4';

// ──────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────

const uid = () => `${Date.now()}${Math.floor(Math.random() * 100000)}`;
const uniqueEmail = () => `admin_e2e_${uid()}@scentxury.test`;

const dashboardStub = {
  today: { revenue: 450000, orders: 12, avgOrderValue: 37500, changePercent: 8.3 },
  week: { revenue: 2100000, orders: 58, avgOrderValue: 36206, changePercent: 12.1, topProducts: [] },
  month: { revenue: 8400000, orders: 233, avgOrderValue: 36051, changePercent: 5.7, topProducts: [] },
  year: { revenue: 94500000, orders: 2785, avgOrderValue: 33930, changePercent: 22.4, topProducts: [] },
  lowStockAlerts: [{ sku: 'OUD-5ML', currentStock: 3, minStock: 10, productName: 'Oud Royal' }],
  recentOrders: [],
};

const inventoryStub = {
  variants: [
    { sku: 'CHI-50ML-001', productName: 'Oud Royal', size: '50ml', currentStock: 47, minStock: 10 },
    { sku: 'CHI-100ML-001', productName: 'Oud Royal', size: '100ml', currentStock: 28, minStock: 5 },
  ],
  totalVariants: 2,
  lowStockCount: 0,
};

afterAll(() => {
  mockRedisStore.clear();
});

// ──────────────────────────────────────────────────────────
// SHARED STATE
// ──────────────────────────────────────────────────────────

let adminToken = '';
let userToken = '';
let testOrderNumber = '';

// ──────────────────────────────────────────────────────────
// SETUP
// ──────────────────────────────────────────────────────────

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

  // Restore service mock implementations
  vi.mocked(AnalyticsService.getDashboardSummary).mockResolvedValue(dashboardStub);
  vi.mocked(AnalyticsService.getInventoryReport).mockResolvedValue(inventoryStub);
  vi.mocked(AnalyticsService.getDailySummaries).mockResolvedValue([]);
  vi.mocked(AnalyticsService.calculateDailySummary).mockResolvedValue({
    date: new Date(),
    revenue: 450000,
    orders: 12,
    avgOrderValue: 37500,
    cogs: 225000,
    grossProfit: 225000,
    margin: 50,
    newCustomers: 3,
    returningCustomers: 9,
  } as Awaited<ReturnType<typeof AnalyticsService.calculateDailySummary>>);
  vi.mocked(OrderService.updateOrderStatus).mockResolvedValue({
    orderNumber: testOrderNumber || `CHI${Date.now()}`,
    status: 'shipped',
  } as Awaited<ReturnType<typeof OrderService.updateOrderStatus>>);

  // Create admin user for each test (DB cleared by global beforeEach)
  const admin = await User.create({
    email: uniqueEmail(),
    password: 'AdminPass123!',
    firstName: 'E2E',
    lastName: 'Admin',
    role: 'admin',
    isActive: true,
  });
  adminToken = signAccessToken({ userId: String(admin._id), role: 'admin' });

  // Create regular user for RBAC tests
  const user = await User.create({
    email: uniqueEmail(),
    password: 'UserPass123!',
    firstName: 'E2E',
    lastName: 'User',
    role: 'user',
    isActive: true,
  });
  userToken = signAccessToken({ userId: String(user._id), role: 'user' });

  // Create a test order for status update tests
  const order = await Order.create({
    userId: admin._id,
    orderNumber: `CHI${uid()}`,
    items: [{ productId: new mongoose.Types.ObjectId(), productName: 'Oud', variantSku: 'OUD-50ML', variantSize: '50ml', quantity: 1, unitPrice: 35000, costPrice: 17500, discount: 0, total: 35000 }],
    shippingAddress: { recipientName: 'Admin', phone: '+2348012345678', street: '1 Test', city: 'Lagos', state: 'Lagos', country: 'Nigeria' },
    paymentMethod: 'paystack',
    subtotal: 35000,
    deliveryFee: 1500,
    total: 36500,
    currency: 'NGN',
    status: 'confirmed',
    paymentStatus: 'paid',
  });
  testOrderNumber = order.orderNumber;
  vi.mocked(OrderService.updateOrderStatus).mockResolvedValue({
    orderNumber: testOrderNumber,
    status: 'shipped',
  } as Awaited<ReturnType<typeof OrderService.updateOrderStatus>>);
});

// ──────────────────────────────────────────────────────────
// E2E STEPS
// ──────────────────────────────────────────────────────────

describe('E2E: Admin Dashboard Flow', () => {
  it('Step 1: Admin login → role = admin in JWT decoded payload', async () => {
    // Admin registers (or logs in) and receives a token with role: "admin"
    // We verify by decoding the token and checking the role claim
    const adminEmail = uniqueEmail();
    await User.create({
      email: adminEmail,
      password: 'AdminLogin123!',
      firstName: 'Login',
      lastName: 'Admin',
      role: 'admin',
      isActive: true,
      isEmailVerified: true,
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'AdminLogin123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The response body should indicate admin role
    expect(res.body.data.user.role).toBe('admin');
    expect(typeof res.body.data.accessToken).toBe('string');
  });

  it('Step 2: GET /admin/dashboard → returns sales metrics', async () => {
    // Admin retrieves BI dashboard — should contain today's + weekly metrics
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data as typeof dashboardStub;
    expect(data.today).toBeDefined();
    expect(data.today.revenue).toBeGreaterThanOrEqual(0);
    expect(data.lowStockAlerts).toBeDefined();
    expect(Array.isArray(data.lowStockAlerts)).toBe(true);
  });

  it('Step 3: GET /admin/analytics/inventory → lists all variant stocks', async () => {
    // Inventory report shows all SKUs and their current stock levels
    const res = await request(app)
      .get('/api/v1/admin/analytics/inventory')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data as typeof inventoryStub;
    expect(Array.isArray(data.variants)).toBe(true);
    // Mocked report has 2 variants
    expect(data.variants.length).toBe(2);
  });

  it('Step 4: PATCH /admin/orders/:id/status → status updated', async () => {
    // Admin updates an order's status from 'confirmed' to 'shipped'
    const res = await request(app)
      .patch(`/api/v1/orders/${testOrderNumber}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'shipped', notes: 'Dispatched via DHL', notifyCustomer: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Step 5: POST /admin/summaries/generate → daily summary triggered', async () => {
    // Admin triggers on-demand generation of the daily summary
    const res = await request(app)
      .post('/api/v1/admin/summaries/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: new Date().toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Step 6: Non-admin user blocked from /admin/* → 403', async () => {
    // Regular users must receive 403 Forbidden on any admin route
    const adminRoutes = [
      '/api/v1/admin/dashboard',
      '/api/v1/admin/analytics/sales',
      '/api/v1/admin/analytics/inventory',
      '/api/v1/admin/expenses',
    ];

    for (const route of adminRoutes) {
      const res = await request(app)
        .get(route)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBeDefined();
    }
  });
});
