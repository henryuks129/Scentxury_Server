/**
 * ============================================
 * ADMIN ROUTES — INTEGRATION TESTS
 * ============================================
 *
 * Integration tests for /api/v1/admin/* routes.
 *
 * All admin routes require:
 *   1. authenticate  — valid JWT
 *   2. adminOnly     — user.role === 'admin'
 *
 * Strategy:
 *   • MongoDB  → MongoMemoryServer (via global setup.ts)
 *   • Redis    → vi.mock (in-memory)
 *   • Passport → vi.mock
 *   • Stripe   → vi.mock
 *   • AnalyticsService / AdminService → vi.mock (isolate HTTP layer)
 *
 * Routes tested:
 *   GET    /api/v1/admin/dashboard                — 401, 403, 200
 *   GET    /api/v1/admin/analytics/sales          — 401, 403, 200
 *   GET    /api/v1/admin/analytics/inventory      — 401, 403, 200
 *   GET    /api/v1/admin/analytics/pnl            — 401, 403, 200
 *   GET    /api/v1/admin/expenses                 — 401, 403, 200
 *   POST   /api/v1/admin/expenses                 — 401, 403
 *   GET    /api/v1/admin/inventory/transactions   — 401, 403, 200
 *   GET    /api/v1/admin/summaries                — 401, 403, 200
 *   GET    /api/v1/admin/coupons                  — 401, 403, 200
 *
 * @file src/routes/__tests__/admin.routes.int.test.ts
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
  deleteCache: vi.fn(async (key: string) => {
    mockRedisStore.delete(key);
  }),
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

// 4. AnalyticsService — returns stubbed BI data
vi.mock('../../services/analytics.service.js', () => ({
  AnalyticsService: {
    getDashboardSummary: vi.fn(),
    getSalesAnalytics: vi.fn(),
    getInventoryReport: vi.fn(),
    getPnLReport: vi.fn(),
    getChartData: vi.fn(),
    getDailySummaries: vi.fn(),
    generateDailySummary: vi.fn(),
  },
}));

// 5. AdminService — expense / inventory transaction operations
vi.mock('../../services/admin.service.js', () => ({
  AdminService: {
    createExpense: vi.fn(),
    getExpenses: vi.fn(),
    deleteExpense: vi.fn(),
    getInventoryTransactions: vi.fn(),
    getDailySummaries: vi.fn(),
  },
}));

// 6. CouponService
vi.mock('../../services/coupon.service.js', () => ({
  CouponService: {
    createCoupon: vi.fn(),
    getAllCoupons: vi.fn(),
    getCoupon: vi.fn(),
    updateCoupon: vi.fn(),
    deactivateCoupon: vi.fn(),
  },
}));

// 7. RecommendationService (admin cluster endpoints)
vi.mock('../../services/recommendation.service.js', () => ({
  RecommendationService: {
    getChurnRiskUsers: vi.fn(),
    runUserClustering: vi.fn(),
    getHybridRecommendations: vi.fn(),
    getProductRecommendations: vi.fn(),
    getComboMix: vi.fn(),
    getUserRecommendations: vi.fn(),
  },
}));

// ──────────────────────────────────────────────────────────
// Actual imports
// ──────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { User } from '../../models/User.js';
import { signAccessToken } from '../../utils/jwt.js';
import { AnalyticsService } from '../../services/analytics.service.js';
import { AdminService } from '../../services/admin.service.js';
import { CouponService } from '../../services/coupon.service.js';

process.env.BCRYPT_ROUNDS = '4';

// ──────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────

const uid = () => `${Date.now()}${Math.random().toString(36).slice(2)}`;
const uniqueEmail = () => `admin_test_${uid()}@scentxury.test`;

/** Minimal dashboard summary stub */
const dashboardStub = {
  today: { revenue: 0, orders: 0, avgOrderValue: 0, changePercent: 0 },
  week: { revenue: 0, orders: 0, avgOrderValue: 0, changePercent: 0, topProducts: [] },
  month: { revenue: 0, orders: 0, avgOrderValue: 0, changePercent: 0, topProducts: [] },
  year: { revenue: 0, orders: 0, avgOrderValue: 0, changePercent: 0, topProducts: [] },
  lowStockAlerts: [],
  recentOrders: [],
};

// ──────────────────────────────────────────────────────────
// SETUP
// ──────────────────────────────────────────────────────────

let userToken: string;
let adminToken: string;

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
  vi.mocked(AnalyticsService.getSalesAnalytics).mockResolvedValue({ periods: [], totals: { revenue: 0, orders: 0 } });
  vi.mocked(AnalyticsService.getInventoryReport).mockResolvedValue({ variants: [], totalVariants: 0, lowStockCount: 0 });
  vi.mocked(AnalyticsService.getPnLReport).mockResolvedValue({ revenue: 0, cogs: 0, grossProfit: 0, margin: 0, expenses: 0, netProfit: 0, netMargin: 0 });
  vi.mocked(AdminService.getDailySummaries).mockResolvedValue([]);
  vi.mocked(AdminService.getExpenses).mockResolvedValue({ expenses: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  vi.mocked(AdminService.getInventoryTransactions).mockResolvedValue({ transactions: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  vi.mocked(CouponService.getAllCoupons).mockResolvedValue({ coupons: [], total: 0 });

  // Create regular user
  const regularUser = await User.create({
    email: uniqueEmail(),
    password: 'TestPass123!',
    firstName: 'Regular',
    lastName: 'User',
    role: 'user',
    isActive: true,
  });
  userToken = signAccessToken({ userId: String(regularUser._id), role: 'user' });

  // Create admin user
  const adminUser = await User.create({
    email: uniqueEmail(),
    password: 'AdminPass123!',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    isActive: true,
  });
  adminToken = signAccessToken({ userId: String(adminUser._id), role: 'admin' });
});

// ──────────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────────

describe('Admin Routes — Integration', () => {
  // ============================================
  // AUTH & RBAC GUARD — repeated for every admin endpoint
  // ============================================
  describe('Authentication & Authorization guards', () => {
    const protectedRoutes = [
      { method: 'GET', path: '/api/v1/admin/dashboard' },
      { method: 'GET', path: '/api/v1/admin/analytics/sales' },
      { method: 'GET', path: '/api/v1/admin/analytics/inventory' },
      { method: 'GET', path: '/api/v1/admin/analytics/pnl' },
      { method: 'GET', path: '/api/v1/admin/expenses' },
      { method: 'GET', path: '/api/v1/admin/inventory/transactions' },
      { method: 'GET', path: '/api/v1/admin/summaries' },
      { method: 'GET', path: '/api/v1/admin/coupons' },
    ] as const;

    for (const route of protectedRoutes) {
      it(`${route.method} ${route.path} → 401 without token`, async () => {
        const res = await request(app)[route.method.toLowerCase() as 'get'](route.path);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      });

      it(`${route.method} ${route.path} → 403 for regular user`, async () => {
        const res = await request(app)
          [route.method.toLowerCase() as 'get'](route.path)
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
      });
    }
  });

  // ============================================
  // DASHBOARD
  // ============================================
  describe('GET /api/v1/admin/dashboard', () => {
    it('returns 200 with dashboard stats for admin user', async () => {
      // Admin user should receive the BI summary from AnalyticsService
      const res = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('today');
      expect(res.body.data).toHaveProperty('recentOrders');
    });

    it('calls AnalyticsService.getDashboardSummary exactly once', async () => {
      await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(AnalyticsService.getDashboardSummary).toHaveBeenCalledOnce();
    });
  });

  // ============================================
  // SALES ANALYTICS
  // ============================================
  describe('GET /api/v1/admin/analytics/sales', () => {
    it('returns 200 with sales analytics for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/sales')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('accepts optional date range query parameters', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-01-31', groupBy: 'day' });

      expect(res.status).toBe(200);
    });
  });

  // ============================================
  // INVENTORY ANALYTICS
  // ============================================
  describe('GET /api/v1/admin/analytics/inventory', () => {
    it('returns 200 with inventory report for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/inventory')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ============================================
  // P&L REPORT
  // ============================================
  describe('GET /api/v1/admin/analytics/pnl', () => {
    it('returns 200 with P&L data for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/pnl')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ============================================
  // EXPENSES
  // ============================================
  describe('GET /api/v1/admin/expenses', () => {
    it('returns 200 with expenses list for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/expenses')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/admin/expenses', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/v1/admin/expenses')
        .send({ category: 'marketing', amount: 5000, description: 'Ad spend' });

      expect(res.status).toBe(401);
    });

    it('returns 403 for regular user', async () => {
      const res = await request(app)
        .post('/api/v1/admin/expenses')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ category: 'marketing', amount: 5000, description: 'Ad spend' });

      expect(res.status).toBe(403);
    });
  });

  // ============================================
  // INVENTORY TRANSACTIONS
  // ============================================
  describe('GET /api/v1/admin/inventory/transactions', () => {
    it('returns 200 with transaction log for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/inventory/transactions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ============================================
  // DAILY SUMMARIES
  // ============================================
  describe('GET /api/v1/admin/summaries', () => {
    it('returns 200 with daily summaries for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/summaries')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ============================================
  // COUPONS
  // ============================================
  describe('GET /api/v1/admin/coupons', () => {
    it('returns 200 with coupon list for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ============================================
  // ERROR RESPONSE SHAPE
  // ============================================
  describe('Error response consistency', () => {
    it('all 401 responses have { success: false, message: string }', async () => {
      const res = await request(app).get('/api/v1/admin/dashboard');
      expect(res.body.success).toBe(false);
      expect(typeof res.body.message).toBe('string');
    });

    it('all 403 responses have { success: false, message: string }', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.body.success).toBe(false);
      expect(typeof res.body.message).toBe('string');
    });
  });
});
