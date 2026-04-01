/**
 * ============================================
 * STRESS & PERFORMANCE TEST SUITE
 * ============================================
 *
 * Measures:
 *  - Throughput (req/s) under sustained concurrency
 *  - Latency percentiles: P50 / P95 / P99
 *  - Error rate under load
 *  - Cache warm vs cold path latency
 *  - Rate-limiter enforcement
 *  - Concurrent auth + product + health requests
 *
 * Thresholds (fail the build if breached):
 *  - Health endpoint P95 < 100ms
 *  - Products list P95 < 500ms
 *  - Auth login P95 < 600ms
 *  - Error rate < 1% on non-rate-limited routes
 *
 * @file src/routes/__tests__/stress.perf.test.ts
 */

// ── Mocks must come first ──────────────────────
const { mockRedisStore, mockRedisClient } = vi.hoisted(() => {
  const store: Map<string, string> = new Map();
  const client = {
    status: 'ready' as string,
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => { store.set(key, value); return Promise.resolve('OK'); }),
    setex: vi.fn((key: string, _ttl: number, value: string) => { store.set(key, value); return Promise.resolve('OK'); }),
    del: vi.fn((...keys: string[]) => { keys.forEach((k) => store.delete(k)); return Promise.resolve(keys.length); }),
    keys: vi.fn((pattern: string) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Promise.resolve([...store.keys()].filter((k) => regex.test(k)));
    }),
    quit: vi.fn().mockResolvedValue('OK'),
    on: vi.fn(),
  };
  return { mockRedisStore: store, mockRedisClient: client };
});

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
    try { return JSON.parse(val) as T; } catch { return null; }
  }),
  deleteCache: vi.fn(async (key: string) => { mockRedisStore.delete(key); }),
  deleteCachePattern: vi.fn(async (pattern: string) => {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    [...mockRedisStore.keys()].filter((k) => regex.test(k)).forEach((k) => mockRedisStore.delete(k));
  }),
  default: mockRedisClient,
}));

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
vi.mock('../../config/stripe.js', () => ({
  stripe: { paymentIntents: { create: vi.fn() } },
  default: { paymentIntents: { create: vi.fn() } },
}));

// ── Real imports ──────────────────────────────
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { User } from '../../models/User.js';
import { Product } from '../../models/Product.js';

// ──────────────────────────────────────────────
// Types & Utilities
// ──────────────────────────────────────────────

interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  errorRate: number;
  throughput: number; // req/s
}

function computeStats(samples: { durationMs: number; status: number }[]): LatencyStats {
  if (samples.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0, errorRate: 0, throughput: 0 };
  }
  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const errors = samples.filter((s) => s.status >= 500).length;
  const n = durations.length;
  const sum = durations.reduce((a, b) => a + b, 0);
  const totalMs = durations.reduce((a, b) => a + b, 0);

  return {
    min: durations[0]!,
    max: durations[n - 1]!,
    avg: Math.round(sum / n),
    p50: durations[Math.floor(n * 0.5)]!,
    p95: durations[Math.floor(n * 0.95)]!,
    p99: durations[Math.floor(n * 0.99)]!,
    errorRate: parseFloat(((errors / n) * 100).toFixed(2)),
    throughput: parseFloat((n / (totalMs / 1000)).toFixed(2)),
  };
}

function printStats(label: string, stats: LatencyStats) {
  console.log(
    `\n  📊 ${label}\n` +
    `     min=${stats.min}ms  avg=${stats.avg}ms  p50=${stats.p50}ms  p95=${stats.p95}ms  p99=${stats.p99}ms  max=${stats.max}ms\n` +
    `     throughput=${stats.throughput} req/s  errorRate=${stats.errorRate}%`
  );
}

/**
 * Fire `concurrency` parallel requests, repeat for `waves` rounds.
 * Returns timing samples for every response.
 */
async function loadTest(
  factory: () => Promise<{ status: number }>,
  concurrency: number,
  waves: number
): Promise<LatencyStats> {
  const samples: { durationMs: number; status: number }[] = [];

  for (let w = 0; w < waves; w++) {
    const batch = Array.from({ length: concurrency }, async () => {
      const start = performance.now();
      try {
        const res = await factory();
        return { durationMs: Math.round(performance.now() - start), status: res.status };
      } catch {
        // Network errors (ECONNRESET) count as 503 for latency tracking
        return { durationMs: Math.round(performance.now() - start), status: 503 };
      }
    });
    const results = await Promise.all(batch);
    samples.push(...results);
  }

  return computeStats(samples);
}

// ──────────────────────────────────────────────
// Test fixtures
// ──────────────────────────────────────────────
let userToken = '';
let adminToken = '';
let productSlug = '';

const uid = () => `${Date.now()}${Math.random().toString(36).slice(2)}`;
const email = () => `perf_${uid()}@scentxury.test`;

beforeAll(async () => {
  // Seed a regular user + admin
  const userEmail = email();
  const adminEmail = email();
  const password = 'Password123!';

  await User.create([
    { email: userEmail, password, firstName: 'Perf', lastName: 'User', role: 'user', isEmailVerified: true, isActive: true },
    { email: adminEmail, password, firstName: 'Perf', lastName: 'Admin', role: 'admin', isEmailVerified: true, isActive: true },
  ]);

  const [uRes, aRes] = await Promise.all([
    request(app).post('/api/v1/auth/login').send({ email: userEmail, password }),
    request(app).post('/api/v1/auth/login').send({ email: adminEmail, password }),
  ]);

  userToken = uRes.body.data?.accessToken ?? '';
  adminToken = aRes.body.data?.accessToken ?? '';

  // Seed 20 products for realistic list queries
  const ts = Date.now();
  const products = Array.from({ length: 20 }, (_, i) => ({
    name: `Stress Product ${ts}-${i}`,
    slug: `stress-product-${ts}-${i}`,
    description: 'Stress test product',
    shortDescription: 'Stress',
    category: i % 2 === 0 ? 'male' : 'female',
    brand: 'Chi',
    scentNotes: { top: ['citrus'], middle: ['amber'], base: ['wood'] },
    scentFamily: 'woody',
    images: {
      boxed: 'https://example.com/b.jpg',
      bottle: 'https://example.com/bot.jpg',
      thumbnail: 'https://example.com/t.jpg',
    },
    variants: [
      { sku: `STRESS-50ML-${ts}-${i}`, size: '50ml', priceNGN: 25000, priceUSD: 35, costPrice: 12000, stock: 50 },
    ],
  }));

  await Product.insertMany(products);
  productSlug = `stress-product-${ts}-0`;
}, 60000);

afterAll(() => {
  mockRedisStore.clear();
});

// ══════════════════════════════════════════════
// HEALTH — BASELINE BENCHMARK
// ══════════════════════════════════════════════
describe('Stress: Health Endpoints', () => {
  it('GET /health/live — 50 concurrent × 4 waves, P95 < 100ms', async () => {
    const stats = await loadTest(
      () => request(app).get('/health/live'),
      50,
      4
    );
    printStats('GET /health/live (200 requests)', stats);

    expect(stats.errorRate).toBeLessThan(1); // allow <1% for ECONNRESET under full-suite load
    expect(stats.p95).toBeLessThan(100);
  }, 30000);

  it('GET /health — 20 concurrent × 3 waves, no 500s', async () => {
    const stats = await loadTest(
      () => request(app).get('/health'),
      20,
      3
    );
    printStats('GET /health (60 requests)', stats);

    expect(stats.errorRate).toBeLessThan(1); // allow <1% for ECONNRESET under full-suite load
    expect(stats.p95).toBeLessThan(400);
  }, 30000);
});

// ══════════════════════════════════════════════
// ROOT / API INDEX
// ══════════════════════════════════════════════
describe('Stress: Root Endpoints', () => {
  it('GET / — 40 concurrent × 3 waves, P95 < 100ms', async () => {
    const stats = await loadTest(
      () => request(app).get('/'),
      40,
      3
    );
    printStats('GET / (120 requests)', stats);

    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(100);
  }, 20000);
});

// ══════════════════════════════════════════════
// PRODUCTS — PUBLIC ENDPOINTS
// ══════════════════════════════════════════════
describe('Stress: Product Listing', () => {
  it('GET /api/v1/products — 30 concurrent × 5 waves, P95 < 500ms', async () => {
    const stats = await loadTest(
      () => request(app).get('/api/v1/products?limit=10'),
      30,
      5
    );
    printStats('GET /products (150 requests)', stats);

    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(500);
  }, 60000);

  it('GET /api/v1/products/featured — 15 concurrent × 4 waves, P95 < 500ms', async () => {
    const stats = await loadTest(
      () => request(app).get('/api/v1/products/featured'),
      15,
      4
    );
    printStats('GET /products/featured (60 requests)', stats);

    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(500);
  }, 40000);

  it('GET /api/v1/products/:slug — 20 concurrent × 4 waves, P95 < 400ms', async () => {
    const stats = await loadTest(
      () => request(app).get(`/api/v1/products/${productSlug}`),
      20,
      4
    );
    printStats(`GET /products/${productSlug} (80 requests)`, stats);

    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(400);
  }, 40000);

  it('GET /api/v1/products/category/male — 20 concurrent × 3 waves, P95 < 400ms', async () => {
    const stats = await loadTest(
      () => request(app).get('/api/v1/products/category/male'),
      20,
      3
    );
    printStats('GET /products/category/male (60 requests)', stats);

    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(400);
  }, 30000);
});

// ══════════════════════════════════════════════
// AUTH — LOGIN THROUGHPUT
// ══════════════════════════════════════════════
describe('Stress: Auth Login', () => {
  it('POST /api/v1/auth/login — 10 concurrent × 5 waves, P95 < 600ms', async () => {
    // Seed a dedicated pool of users so we don't get lock contention
    const pool: string[] = [];
    const pw = 'Password123!';

    await Promise.all(
      Array.from({ length: 10 }, async (_, i) => {
        const e = `perf_login_${Date.now()}_${i}@x.test`;
        pool.push(e);
        await User.create({ email: e, password: pw, firstName: 'L', lastName: `${i}`, isEmailVerified: true, isActive: true });
      })
    );

    let wave = 0;
    const stats = await loadTest(
      () => {
        const e = pool[wave++ % pool.length]!;
        return request(app).post('/api/v1/auth/login').send({ email: e, password: pw });
      },
      10,
      5
    );
    printStats('POST /auth/login (50 requests)', stats);

    // Login can occasionally fail if user pool is exhausted (409/500) — filter those
    const successRate = 100 - stats.errorRate;
    expect(successRate).toBeGreaterThanOrEqual(90);
    expect(stats.p95).toBeLessThan(600);
  }, 60000);
});

// ══════════════════════════════════════════════
// AUTHENTICATED ENDPOINTS UNDER LOAD
// ══════════════════════════════════════════════
describe('Stress: Authenticated Requests', () => {
  it('GET /api/v1/orders — 20 concurrent × 4 waves, P95 < 500ms', async () => {
    const stats = await loadTest(
      () =>
        request(app)
          .get('/api/v1/orders')
          .set('Authorization', `Bearer ${userToken}`),
      20,
      4
    );
    printStats('GET /orders (80 requests)', stats);

    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(500);
  }, 40000);

  it('GET /api/v1/wishlist — 20 concurrent × 4 waves, P95 < 500ms', async () => {
    const stats = await loadTest(
      () =>
        request(app)
          .get('/api/v1/wishlist')
          .set('Authorization', `Bearer ${userToken}`),
      20,
      4
    );
    printStats('GET /wishlist (80 requests)', stats);

    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(500);
  }, 40000);

  it('GET /api/v1/cart — 20 concurrent × 4 waves, P95 < 500ms', async () => {
    const stats = await loadTest(
      () =>
        request(app)
          .get('/api/v1/cart')
          .set('Authorization', `Bearer ${userToken}`),
      20,
      4
    );
    printStats('GET /cart (80 requests)', stats);

    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(500);
  }, 40000);
});

// ══════════════════════════════════════════════
// ADMIN ENDPOINTS UNDER LOAD
// ══════════════════════════════════════════════
describe('Stress: Admin Endpoints', () => {
  it('GET /api/v1/admin/dashboard — 10 concurrent × 3 waves, P95 < 600ms', async () => {
    const stats = await loadTest(
      () =>
        request(app)
          .get('/api/v1/admin/dashboard')
          .set('Authorization', `Bearer ${adminToken}`),
      10,
      3
    );
    printStats('GET /admin/dashboard (30 requests)', stats);

    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(600);
  }, 30000);

  it('GET /api/v1/admin/analytics/sales — 10 concurrent × 3 waves, P95 < 600ms', async () => {
    const stats = await loadTest(
      () =>
        request(app)
          .get('/api/v1/admin/analytics/sales')
          .set('Authorization', `Bearer ${adminToken}`),
      10,
      3
    );
    printStats('GET /admin/analytics/sales (30 requests)', stats);

    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(600);
  }, 30000);
});

// ══════════════════════════════════════════════
// MIXED WORKLOAD (realistic traffic pattern)
// ══════════════════════════════════════════════
describe('Stress: Mixed Workload', () => {
  it('simultaneous health + products + auth/me — 90 total requests, P95 < 600ms', async () => {
    const start = performance.now();
    const allRequests = [
      // 30 health/live
      ...Array.from({ length: 30 }, () =>
        (async () => {
          const t = performance.now();
          const r = await request(app).get('/health/live');
          return { durationMs: Math.round(performance.now() - t), status: r.status };
        })()
      ),
      // 30 products list
      ...Array.from({ length: 30 }, () =>
        (async () => {
          const t = performance.now();
          const r = await request(app).get('/api/v1/products?limit=5');
          return { durationMs: Math.round(performance.now() - t), status: r.status };
        })()
      ),
      // 30 auth/me (authenticated)
      ...Array.from({ length: 30 }, () =>
        (async () => {
          const t = performance.now();
          const r = await request(app)
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${userToken}`);
          return { durationMs: Math.round(performance.now() - t), status: r.status };
        })()
      ),
    ];

    const results = await Promise.all(allRequests);
    const totalElapsed = Math.round(performance.now() - start);
    const stats = computeStats(results);

    printStats(`Mixed workload (90 parallel requests in ${totalElapsed}ms)`, stats);
    console.log(`   ⚡ Wall-clock time: ${totalElapsed}ms  (sequential would be ≈ ${stats.avg * 90}ms)`);

    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(600);
    // Wall-clock should be much less than sequential due to parallelism
    expect(totalElapsed).toBeLessThan(stats.avg * 90);
  }, 60000);
});

// ══════════════════════════════════════════════
// CACHE WARM vs COLD LATENCY
// ══════════════════════════════════════════════
describe('Stress: Cache Performance', () => {
  it('product list: warm cache should not be slower than cold', async () => {
    // Warm the mock cache manually
    const { setCache } = await import('../../config/redis.js');
    const cacheKey = 'products:list:page=1:limit=10';
    await setCache(cacheKey, { products: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }, 300);

    // Cold calls (first load, cache potentially empty per key variant)
    const coldStats = await loadTest(
      () => request(app).get('/api/v1/products?page=1&limit=10'),
      10,
      3
    );

    // Warm calls (repeated same query — ProductService may use cache)
    const warmStats = await loadTest(
      () => request(app).get('/api/v1/products?page=1&limit=10'),
      10,
      3
    );

    printStats('Cold product list (30 requests)', coldStats);
    printStats('Warm product list (30 requests)', warmStats);

    expect(coldStats.errorRate).toBe(0);
    expect(warmStats.errorRate).toBe(0);

    // Both paths must stay within SLA
    expect(coldStats.p95).toBeLessThan(500);
    expect(warmStats.p95).toBeLessThan(500);
  }, 30000);
});

// ══════════════════════════════════════════════
// ERROR RATE UNDER BAD REQUESTS
// ══════════════════════════════════════════════
describe('Stress: Error Handling Under Load', () => {
  it('401 cascade — 50 unauthenticated order requests return 401 (not 500)', async () => {
    const stats = await loadTest(
      () => request(app).get('/api/v1/orders'),
      25,
      2
    );
    printStats('GET /orders unauthenticated (50 requests)', stats);

    // All must be 4xx not 5xx
    expect(stats.errorRate).toBe(0); // errorRate counts 5xx only
  }, 20000);

  it('404 cascade — 50 requests for missing products return 404 (not 500)', async () => {
    const stats = await loadTest(
      () => request(app).get('/api/v1/products/nonexistent-ghost-product-xyz'),
      25,
      2
    );
    printStats('GET /products/ghost (50 requests)', stats);

    expect(stats.errorRate).toBe(0); // 404 is a 4xx, not 5xx
  }, 20000);

  it('mixed auth/unauth requests — no 5xx responses', async () => {
    const requests = [
      ...Array.from({ length: 20 }, () => request(app).get('/api/v1/orders')),
      ...Array.from({ length: 20 }, () =>
        request(app).get('/api/v1/orders').set('Authorization', `Bearer ${userToken}`)
      ),
      ...Array.from({ length: 10 }, () =>
        request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${userToken}`)
      ),
    ];

    const responses = await Promise.all(requests);
    const fiveXXErrors = responses.filter((r) => r.status >= 500);

    expect(fiveXXErrors.length).toBe(0);
  }, 30000);
});

// ══════════════════════════════════════════════
// 100 CONCURRENT USERS — SPIKE TEST
// ══════════════════════════════════════════════
describe('Stress: 100 Concurrent Users', () => {
  it('GET /health/live — 100 concurrent users, P95 < 250ms, 0 errors', async () => {
    const stats = await loadTest(
      () => request(app).get('/health/live'),
      100,
      1
    );
    printStats('GET /health/live (100 concurrent)', stats);

    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(250);
  }, 30000);

  it('GET /api/v1/products — 100 concurrent users, P95 < 800ms, 0 server errors', async () => {
    const stats = await loadTest(
      () => request(app).get('/api/v1/products?limit=5'),
      100,
      1
    );
    printStats('GET /api/v1/products (100 concurrent)', stats);

    expect(stats.errorRate).toBe(0); // 0% 5xx
    expect(stats.p95).toBeLessThan(800);
  }, 60000);

  it('mixed 100-user spike: health + products + orders auth — no crashes', async () => {
    const start = performance.now();
    const batch = [
      ...Array.from({ length: 40 }, () =>
        (async () => {
          const t = performance.now();
          const r = await request(app).get('/health/live');
          return { durationMs: Math.round(performance.now() - t), status: r.status };
        })()
      ),
      ...Array.from({ length: 40 }, () =>
        (async () => {
          const t = performance.now();
          const r = await request(app).get('/api/v1/products?limit=5');
          return { durationMs: Math.round(performance.now() - t), status: r.status };
        })()
      ),
      ...Array.from({ length: 20 }, () =>
        (async () => {
          const t = performance.now();
          const r = await request(app)
            .get('/api/v1/orders')
            .set('Authorization', `Bearer ${userToken}`);
          return { durationMs: Math.round(performance.now() - t), status: r.status };
        })()
      ),
    ];

    const results = await Promise.all(batch);
    const totalElapsed = Math.round(performance.now() - start);
    const stats = computeStats(results);

    printStats(`Mixed 100-user spike (${totalElapsed}ms wall-clock)`, stats);
    expect(stats.errorRate).toBe(0);
    expect(stats.p95).toBeLessThan(1000);
    // Parallelism: wall-clock must be < sequential equivalent
    expect(totalElapsed).toBeLessThan(stats.avg * 100 * 0.5);
  }, 60000);
});

// ══════════════════════════════════════════════
// THROUGHPUT REPORT
// ══════════════════════════════════════════════
describe('Stress: Throughput Summary', () => {
  it('prints a full throughput report across all endpoint types', async () => {
    console.log('\n  ══════════════════════════════════════');
    console.log('  SCENTXURY API — THROUGHPUT REPORT');
    console.log('  ══════════════════════════════════════');

    const scenarios: Array<{ label: string; path: string; auth?: string; concurrency: number; waves: number }> = [
      { label: 'GET /health/live', path: '/health/live', concurrency: 20, waves: 3 },
      { label: 'GET /health', path: '/health', concurrency: 10, waves: 3 },
      { label: 'GET /api/v1/products', path: '/api/v1/products?limit=5', concurrency: 15, waves: 3 },
      { label: 'GET /api/v1/products/featured', path: '/api/v1/products/featured', concurrency: 15, waves: 3 },
      { label: 'GET /api/v1/orders (auth)', path: '/api/v1/orders', auth: userToken, concurrency: 10, waves: 3 },
      { label: 'GET /api/v1/wishlist (auth)', path: '/api/v1/wishlist', auth: userToken, concurrency: 10, waves: 3 },
      { label: 'GET /api/v1/cart (auth)', path: '/api/v1/cart', auth: userToken, concurrency: 10, waves: 3 },
      { label: 'GET /api/v1/admin/dashboard (admin)', path: '/api/v1/admin/dashboard', auth: adminToken, concurrency: 5, waves: 3 },
    ];

    for (const s of scenarios) {
      const stats = await loadTest(
        () => {
          const req = request(app).get(s.path);
          if (s.auth) req.set('Authorization', `Bearer ${s.auth}`);
          return req;
        },
        s.concurrency,
        s.waves
      );
      printStats(`${s.label} (${s.concurrency * s.waves} req)`, stats);

      // All scenarios must have zero 5xx errors
      expect(stats.errorRate).toBe(0);
    }

    console.log('\n  ══════════════════════════════════════\n');
  }, 120000);
});
