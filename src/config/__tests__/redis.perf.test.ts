/**
 * ============================================
 * REDIS CONFIGURATION - PERFORMANCE TESTS
 * ============================================
 *
 * Tests for Redis cache performance using ioredis-mock.
 * Note: Real Redis will have different performance characteristics.
 *
 * @file src/config/__tests__/redis.perf.test.ts
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Redis from 'ioredis-mock';
import { measureTime, expectPerformance } from '../../test/helpers.js';

// Create a fresh mock Redis for performance tests
const mockRedis = new Redis();

// Cache utility functions using mock Redis
async function setCache(
  key: string,
  value: unknown,
  expireSeconds?: number
): Promise<void> {
  const stringValue = JSON.stringify(value);
  if (expireSeconds) {
    await mockRedis.setex(key, expireSeconds, stringValue);
  } else {
    await mockRedis.set(key, stringValue);
  }
}

async function getCache<T>(key: string): Promise<T | null> {
  const value = await mockRedis.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

async function deleteCache(key: string): Promise<void> {
  await mockRedis.del(key);
}

async function deleteCachePattern(pattern: string): Promise<void> {
  const keys = await mockRedis.keys(pattern);
  if (keys.length > 0) {
    await mockRedis.del(...keys);
  }
}

describe('Redis Performance', () => {
  beforeEach(async () => {
    // Clear all data before each test
    await mockRedis.flushall();
  });

  afterAll(async () => {
    await mockRedis.flushall();
  });

  describe('Set Operations', () => {
    it('should set cache within 5ms', async () => {
      await expectPerformance(
        async () => {
          await setCache(`perf-set-${Date.now()}`, { data: 'value' });
        },
        5, // max 5ms
        100 // 100 iterations
      );
    });

    it('should set with TTL within 5ms', async () => {
      await expectPerformance(
        async () => {
          await setCache(`perf-ttl-${Date.now()}`, { data: 'value' }, 3600);
        },
        5, // max 5ms
        100
      );
    });

    it('should handle large objects within 10ms', async () => {
      const largeObject = {
        products: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: i,
            name: `Product ${i}`,
            description: 'A detailed product description'.repeat(10),
            variants: [
              { size: '20ml', price: 15000 },
              { size: '50ml', price: 30000 },
              { size: '100ml', price: 50000 },
            ],
          })),
      };

      await expectPerformance(
        async () => {
          await setCache(`large-obj-${Date.now()}`, largeObject);
        },
        10, // max 10ms
        20
      );
    });
  });

  describe('Get Operations', () => {
    beforeEach(async () => {
      // Seed data for get tests
      for (let i = 0; i < 1000; i++) {
        await mockRedis.set(
          `get-test:${i}`,
          JSON.stringify({ id: i, value: `data-${i}` })
        );
      }
    });

    it('should get cache within 5ms', async () => {
      await expectPerformance(
        async () => {
          await getCache(`get-test:${Math.floor(Math.random() * 1000)}`);
        },
        5, // max 5ms
        100
      );
    });

    it('should return null for missing key within 5ms', async () => {
      await expectPerformance(
        async () => {
          await getCache('non-existent-key');
        },
        5, // max 5ms
        100
      );
    });

    it('should deserialize JSON within 5ms', async () => {
      const complexData = {
        user: { name: 'Test', email: 'test@example.com' },
        products: [1, 2, 3],
        settings: { theme: 'dark', notifications: true },
      };
      await setCache('complex-get-test', complexData);

      await expectPerformance(
        async () => {
          await getCache<typeof complexData>('complex-get-test');
        },
        5, // max 5ms
        100
      );
    });
  });

  describe('Delete Operations', () => {
    beforeEach(async () => {
      // Seed data for delete tests
      for (let i = 0; i < 100; i++) {
        await mockRedis.set(`delete-test:${i}`, 'value');
      }
    });

    it('should delete single key within 5ms', async () => {
      let counter = 0;
      await expectPerformance(
        async () => {
          await deleteCache(`delete-test:${counter++ % 100}`);
        },
        5, // max 5ms
        50
      );
    });

    it('should delete pattern within 50ms', async () => {
      // Set up pattern keys
      for (let i = 0; i < 100; i++) {
        await mockRedis.set(`pattern:session:${i}`, 'value');
      }

      await expectPerformance(
        async () => {
          await deleteCachePattern('pattern:session:*');
          // Re-create for next iteration
          for (let i = 0; i < 100; i++) {
            await mockRedis.set(`pattern:session:${i}`, 'value');
          }
        },
        50, // max 50ms
        10
      );
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle 100 concurrent SET operations within 500ms', async () => {
      const { duration } = await measureTime(async () => {
        const operations = Array(100)
          .fill(null)
          .map((_, i) => setCache(`concurrent-set:${i}`, { index: i }));
        await Promise.all(operations);
      });

      expect(duration).toBeLessThan(500);
      console.log(`100 concurrent SETs: ${duration.toFixed(2)}ms`);
    });

    it('should handle 100 concurrent GET operations within 500ms', async () => {
      // Seed data
      for (let i = 0; i < 100; i++) {
        await setCache(`concurrent-get:${i}`, { index: i });
      }

      const { duration } = await measureTime(async () => {
        const operations = Array(100)
          .fill(null)
          .map((_, i) => getCache(`concurrent-get:${i}`));
        await Promise.all(operations);
      });

      expect(duration).toBeLessThan(500);
      console.log(`100 concurrent GETs: ${duration.toFixed(2)}ms`);
    });

    it('should handle mixed operations (SET/GET) within 500ms', async () => {
      const { duration } = await measureTime(async () => {
        const operations = Array(100)
          .fill(null)
          .map((_, i) => {
            if (i % 2 === 0) {
              return setCache(`mixed:${i}`, { index: i });
            } else {
              return getCache(`mixed:${i - 1}`);
            }
          });
        await Promise.all(operations);
      });

      expect(duration).toBeLessThan(500);
      console.log(`100 mixed operations: ${duration.toFixed(2)}ms`);
    });

    it('should handle 1000 concurrent operations within 2 seconds', async () => {
      const { duration } = await measureTime(async () => {
        const operations = Array(1000)
          .fill(null)
          .map((_, i) => setCache(`bulk:${i}`, { index: i, timestamp: Date.now() }));
        await Promise.all(operations);
      });

      expect(duration).toBeLessThan(2000);
      console.log(`1000 concurrent SETs: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Real-world Cache Scenarios', () => {
    it('should cache product list efficiently', async () => {
      const products = Array(50)
        .fill(null)
        .map((_, i) => ({
          id: `prod-${i}`,
          name: `Product ${i}`,
          price: Math.random() * 100000,
          variants: [
            { sku: `${i}-20ml`, size: '20ml', stock: 50 },
            { sku: `${i}-50ml`, size: '50ml', stock: 30 },
            { sku: `${i}-100ml`, size: '100ml', stock: 20 },
          ],
        }));

      await expectPerformance(
        async () => {
          await setCache('products:list:page:1', products, 300);
          await getCache<typeof products>('products:list:page:1');
        },
        15, // max 15ms for set + get
        30
      );
    });

    it('should cache user session efficiently', async () => {
      const session = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'user',
        cart: {
          items: [
            { productId: 'prod1', variantSku: 'prod1-50ml', quantity: 2 },
            { productId: 'prod2', variantSku: 'prod2-100ml', quantity: 1 },
          ],
          total: 75000,
        },
        preferences: {
          currency: 'NGN',
          language: 'en',
        },
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      await expectPerformance(
        async () => {
          const sessionId = `sess-${Date.now()}`;
          await setCache(`session:${sessionId}`, session, 86400);
          await getCache<typeof session>(`session:${sessionId}`);
        },
        10, // max 10ms
        50
      );
    });

    it('should handle cache invalidation pattern efficiently', async () => {
      // Simulate product update requiring cache invalidation
      const productId = 'prod-123';

      // Set various related caches
      await setCache(`product:${productId}:details`, { name: 'Test' });
      await setCache(`product:${productId}:variants`, [{ sku: '123-20ml' }]);
      await setCache(`product:${productId}:reviews`, [{ rating: 5 }]);
      await setCache('products:list:page:1', [{ id: productId }]);
      await setCache('products:featured', [{ id: productId }]);

      await expectPerformance(
        async () => {
          // Invalidate all product-specific caches
          await deleteCachePattern(`product:${productId}:*`);
          // Invalidate list caches
          await deleteCachePattern('products:list:*');
          await deleteCache('products:featured');
        },
        30, // max 30ms
        20
      );
    });
  });

  describe('Memory Efficiency', () => {
    it('should handle storing many small objects', async () => {
      const { duration } = await measureTime(async () => {
        for (let i = 0; i < 1000; i++) {
          await setCache(`small:${i}`, { id: i });
        }
      });

      expect(duration).toBeLessThan(3000);
      console.log(`1000 small objects stored: ${duration.toFixed(2)}ms`);

      // Verify all stored correctly
      const sample = await getCache<{ id: number }>('small:500');
      expect(sample?.id).toBe(500);
    });

    it('should handle few large objects', async () => {
      const largeArray = Array(1000)
        .fill(null)
        .map((_, i) => ({
          id: i,
          data: 'x'.repeat(1000), // 1KB per item
        }));

      const { duration } = await measureTime(async () => {
        await setCache('large-data', largeArray);
      });

      expect(duration).toBeLessThan(100);
      console.log(`Large object (~1MB) stored: ${duration.toFixed(2)}ms`);

      const retrieved = await getCache<typeof largeArray>('large-data');
      expect(retrieved?.length).toBe(1000);
    });
  });
});
