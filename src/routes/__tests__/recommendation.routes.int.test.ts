/**
 * ============================================
 * RECOMMENDATION ROUTES — INTEGRATION TESTS
 * ============================================
 *
 * Integration tests for /api/v1/recommendations/* routes.
 *
 * Routes tested:
 *   GET /api/v1/recommendations            — public, optional auth
 *   GET /api/v1/recommendations/product/:id — public, validates ObjectId
 *   GET /api/v1/recommendations/combo/:id   — public, 404 on no results
 *   GET /api/v1/recommendations/user        — auth required
 *
 * Strategy:
 *   • MongoDB  → MongoMemoryServer (via global setup.ts)
 *   • Redis    → vi.mock
 *   • Passport → vi.mock
 *   • Stripe   → vi.mock
 *   • RecommendationService → vi.mock (isolate HTTP layer)
 *
 * @file src/routes/__tests__/recommendation.routes.int.test.ts
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

// 4. RecommendationService — mock all recommendation methods
vi.mock('../../services/recommendation.service.js', () => ({
  RecommendationService: {
    getHybridRecommendations: vi.fn(),
    getContentBasedRecommendations: vi.fn(),
    getComboMixRecommendations: vi.fn(),
    // Controller calls getUserBasedRecommendations (not getUserRecommendations)
    getUserBasedRecommendations: vi.fn(),
    getChurnRiskUsers: vi.fn(),
    runUserClustering: vi.fn(),
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
import { RecommendationService } from '../../services/recommendation.service.js';

process.env.BCRYPT_ROUNDS = '4';

// ──────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────

const uid = () => `${Date.now()}${Math.random().toString(36).slice(2)}`;
const uniqueEmail = () => `rec_test_${uid()}@scentxury.test`;

/** Minimal product stub returned by service mocks */
const productStub = {
  _id: new mongoose.Types.ObjectId().toString(),
  name: 'Oud Royal',
  slug: 'oud-royal',
  category: 'unisex',
  variants: [{ sku: 'OUD-50ML', priceNGN: 30000, stock: 10 }],
};

// ──────────────────────────────────────────────────────────
// SETUP
// ──────────────────────────────────────────────────────────

let userToken: string;

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

  // Restore service mocks after vi.resetAllMocks() clears them in global afterEach
  vi.mocked(RecommendationService.getHybridRecommendations).mockResolvedValue({
    products: [productStub],
    source: 'trending',
  } as Awaited<ReturnType<typeof RecommendationService.getHybridRecommendations>>);

  vi.mocked(RecommendationService.getContentBasedRecommendations).mockResolvedValue(
    [productStub] as Awaited<ReturnType<typeof RecommendationService.getContentBasedRecommendations>>
  );

  vi.mocked(RecommendationService.getComboMixRecommendations).mockResolvedValue(
    [{ product: productStub, reason: 'Complements the base notes', score: 0.85, scentFamily: 'woody' }] as Awaited<ReturnType<typeof RecommendationService.getComboMixRecommendations>>
  );

  vi.mocked(RecommendationService.getUserBasedRecommendations).mockResolvedValue(
    [productStub] as Awaited<ReturnType<typeof RecommendationService.getUserBasedRecommendations>>
  );

  // Create a test user
  const user = await User.create({
    email: uniqueEmail(),
    password: 'TestPass123!',
    firstName: 'Rec',
    lastName: 'Tester',
    role: 'user',
    isActive: true,
  });
  userToken = signAccessToken({ userId: String(user._id), role: 'user' });
});

// ──────────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────────

describe('Recommendation Routes — Integration', () => {
  // ============================================
  // HYBRID RECOMMENDATIONS (public)
  // ============================================
  describe('GET /api/v1/recommendations', () => {
    it('returns 200 for unauthenticated guest user', async () => {
      // Public endpoint — no auth needed
      const res = await request(app).get('/api/v1/recommendations');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('products');
    });

    it('returns 200 for authenticated user (enriched by preferences)', async () => {
      // When auth token is present, service may use user preferences
      const res = await request(app)
        .get('/api/v1/recommendations')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('accepts optional productId and limit query parameters', async () => {
      const productId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get('/api/v1/recommendations')
        .query({ productId, limit: '5' });

      expect(res.status).toBe(200);
    });

    it('calls RecommendationService.getHybridRecommendations', async () => {
      await request(app).get('/api/v1/recommendations');
      expect(RecommendationService.getHybridRecommendations).toHaveBeenCalledOnce();
    });
  });

  // ============================================
  // PRODUCT-BASED RECOMMENDATIONS (public)
  // ============================================
  describe('GET /api/v1/recommendations/product/:productId', () => {
    it('returns 200 with similar products for a valid ObjectId', async () => {
      const productId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`/api/v1/recommendations/product/${productId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('products');
    });

    it('returns 400 for an invalid (non-ObjectId) productId', async () => {
      // Controller validates ObjectId format and throws BadRequestError
      const res = await request(app).get('/api/v1/recommendations/product/not-an-objectid');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns data without requiring auth token', async () => {
      const productId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`/api/v1/recommendations/product/${productId}`);
      expect(res.status).not.toBe(401);
    });
  });

  // ============================================
  // COMBO MIX RECOMMENDATIONS (public)
  // ============================================
  describe('GET /api/v1/recommendations/combo/:productId', () => {
    it('returns 200 with combo suggestions for valid productId', async () => {
      const productId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`/api/v1/recommendations/combo/${productId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('combos');
    });

    it('returns 404 when service returns empty combo list', async () => {
      // Empty result from service → controller sends 404 NotFoundError
      vi.mocked(RecommendationService.getComboMixRecommendations).mockResolvedValueOnce([]);

      const productId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`/api/v1/recommendations/combo/${productId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for invalid productId format', async () => {
      const res = await request(app).get('/api/v1/recommendations/combo/bad-id');
      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // USER RECOMMENDATIONS (auth required)
  // ============================================
  describe('GET /api/v1/recommendations/user', () => {
    it('returns 401 without auth token', async () => {
      // User recommendations require authentication
      const res = await request(app).get('/api/v1/recommendations/user');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with personalised recommendations for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/recommendations/user')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ============================================
  // RESPONSE SHAPE
  // ============================================
  describe('Response shape consistency', () => {
    it('successful responses include success:true', async () => {
      const res = await request(app).get('/api/v1/recommendations');
      expect(res.body.success).toBe(true);
    });

    it('error responses include success:false and a message', async () => {
      const res = await request(app).get('/api/v1/recommendations/product/invalid-id');
      expect(res.body.success).toBe(false);
      expect(typeof res.body.message).toBe('string');
    });
  });
});
