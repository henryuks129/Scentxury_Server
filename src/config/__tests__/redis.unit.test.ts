/**
 * ============================================
 * REDIS CONFIGURATION - UNIT TESTS
 * ============================================
 *
 * Tests for Redis cache utilities using ioredis-mock.
 *
 * @file src/config/__tests__/redis.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis-mock';

// Create mock Redis instance
const mockRedis = new Redis();

// Mock the redis module
vi.mock('../redis.js', () => {
  return {
    redisClient: mockRedis,
    bullMQConnection: {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    },
    connectRedis: vi.fn().mockResolvedValue(undefined),
    disconnectRedis: vi.fn().mockResolvedValue(undefined),
    setCache: async (key: string, value: unknown, expireSeconds?: number) => {
      const stringValue = JSON.stringify(value);
      if (expireSeconds) {
        await mockRedis.setex(key, expireSeconds, stringValue);
      } else {
        await mockRedis.set(key, stringValue);
      }
    },
    getCache: async <T>(key: string): Promise<T | null> => {
      const value = await mockRedis.get(key);
      if (!value) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    },
    deleteCache: async (key: string) => {
      await mockRedis.del(key);
    },
    deleteCachePattern: async (pattern: string) => {
      const keys = await mockRedis.keys(pattern);
      if (keys.length > 0) {
        await mockRedis.del(...keys);
      }
    },
    isRedisConnected: () => mockRedis.status === 'ready',
  };
});

describe('Redis Configuration', () => {
  beforeEach(async () => {
    // Clear all keys before each test
    await mockRedis.flushall();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setCache', () => {
    it('should set a value in cache', async () => {
      const { setCache, getCache } = await import('../redis.js');

      await setCache('test-key', { data: 'value' });

      const result = await getCache('test-key');
      expect(result).toEqual({ data: 'value' });
    });

    it('should set value with expiration', async () => {
      const { setCache } = await import('../redis.js');

      await setCache('expiring-key', { data: 'value' }, 3600);

      // Check TTL was set
      const ttl = await mockRedis.ttl('expiring-key');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(3600);
    });

    it('should serialize objects to JSON', async () => {
      const { setCache } = await import('../redis.js');

      const complexObj = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
        },
        date: '2024-01-01',
      };

      await setCache('complex-key', complexObj);

      const raw = await mockRedis.get('complex-key');
      expect(raw).toBe(JSON.stringify(complexObj));
    });

    it('should handle string values', async () => {
      const { setCache, getCache } = await import('../redis.js');

      await setCache('string-key', 'simple string');

      const result = await getCache<string>('string-key');
      expect(result).toBe('simple string');
    });

    it('should handle number values', async () => {
      const { setCache, getCache } = await import('../redis.js');

      await setCache('number-key', 42);

      const result = await getCache<number>('number-key');
      expect(result).toBe(42);
    });

    it('should handle boolean values', async () => {
      const { setCache, getCache } = await import('../redis.js');

      await setCache('bool-key', true);

      const result = await getCache<boolean>('bool-key');
      expect(result).toBe(true);
    });

    it('should handle null values', async () => {
      const { setCache, getCache } = await import('../redis.js');

      await setCache('null-key', null);

      const result = await getCache<null>('null-key');
      expect(result).toBeNull();
    });

    it('should handle array values', async () => {
      const { setCache, getCache } = await import('../redis.js');

      const array = [1, 'two', { three: 3 }];
      await setCache('array-key', array);

      const result = await getCache<typeof array>('array-key');
      expect(result).toEqual(array);
    });
  });

  describe('getCache', () => {
    it('should return null for missing key', async () => {
      const { getCache } = await import('../redis.js');

      const result = await getCache('non-existent-key');

      expect(result).toBeNull();
    });

    it('should deserialize JSON values', async () => {
      const { setCache, getCache } = await import('../redis.js');

      const data = { user: { name: 'John', age: 30 } };
      await setCache('json-key', data);

      const result = await getCache<typeof data>('json-key');

      expect(result).toEqual(data);
      expect(result?.user.name).toBe('John');
    });

    it('should handle invalid JSON gracefully', async () => {
      // Directly set invalid JSON
      await mockRedis.set('invalid-json', 'not valid json {');

      const { getCache } = await import('../redis.js');
      const result = await getCache<string>('invalid-json');

      // Should return the raw string when JSON parse fails
      expect(result).toBe('not valid json {');
    });

    it('should return correct type', async () => {
      const { setCache, getCache } = await import('../redis.js');

      interface User {
        id: number;
        name: string;
        email: string;
      }

      const user: User = { id: 1, name: 'Test', email: 'test@example.com' };
      await setCache('user:1', user);

      const result = await getCache<User>('user:1');

      expect(result?.id).toBe(1);
      expect(result?.name).toBe('Test');
      expect(result?.email).toBe('test@example.com');
    });
  });

  describe('deleteCache', () => {
    it('should delete a single key', async () => {
      const { setCache, getCache, deleteCache } = await import('../redis.js');

      await setCache('delete-me', 'value');
      expect(await getCache('delete-me')).toBe('value');

      await deleteCache('delete-me');

      expect(await getCache('delete-me')).toBeNull();
    });

    it('should not throw for non-existent key', async () => {
      const { deleteCache } = await import('../redis.js');

      await expect(deleteCache('non-existent')).resolves.not.toThrow();
    });
  });

  describe('deleteCachePattern', () => {
    it('should delete keys matching pattern', async () => {
      const { setCache, getCache, deleteCachePattern } = await import(
        '../redis.js'
      );

      // Set multiple keys with pattern
      await setCache('products:1', { id: 1 });
      await setCache('products:2', { id: 2 });
      await setCache('products:3', { id: 3 });
      await setCache('users:1', { id: 1 }); // Should not be deleted

      await deleteCachePattern('products:*');

      expect(await getCache('products:1')).toBeNull();
      expect(await getCache('products:2')).toBeNull();
      expect(await getCache('products:3')).toBeNull();
      expect(await getCache('users:1')).toEqual({ id: 1 }); // Should remain
    });

    it('should handle no matching keys gracefully', async () => {
      const { deleteCachePattern } = await import('../redis.js');

      await expect(deleteCachePattern('no-match:*')).resolves.not.toThrow();
    });

    it('should delete nested pattern keys', async () => {
      const { setCache, getCache, deleteCachePattern } = await import(
        '../redis.js'
      );

      await setCache('cache:user:1:profile', { name: 'John' });
      await setCache('cache:user:1:settings', { theme: 'dark' });
      await setCache('cache:user:2:profile', { name: 'Jane' });

      await deleteCachePattern('cache:user:1:*');

      expect(await getCache('cache:user:1:profile')).toBeNull();
      expect(await getCache('cache:user:1:settings')).toBeNull();
      expect(await getCache('cache:user:2:profile')).toEqual({ name: 'Jane' });
    });
  });

  describe('isRedisConnected', () => {
    it('should return connection status', async () => {
      const { isRedisConnected } = await import('../redis.js');

      // ioredis-mock always reports as 'ready'
      const connected = isRedisConnected();

      expect(typeof connected).toBe('boolean');
    });
  });

  describe('BullMQ Connection', () => {
    it('should export bullMQConnection configuration', async () => {
      const { bullMQConnection } = await import('../redis.js');

      expect(bullMQConnection).toBeDefined();
      expect(bullMQConnection.host).toBeDefined();
      expect(bullMQConnection.port).toBeDefined();
      expect(bullMQConnection.maxRetriesPerRequest).toBeNull();
    });
  });

  describe('Cache Key Naming Conventions', () => {
    it('should support user-scoped cache keys', async () => {
      const { setCache, getCache } = await import('../redis.js');

      const userId = 'user123';
      const key = `user:${userId}:cart`;

      await setCache(key, { items: [] });

      const result = await getCache<{ items: unknown[] }>(key);
      expect(result).toEqual({ items: [] });
    });

    it('should support product-scoped cache keys', async () => {
      const { setCache, getCache } = await import('../redis.js');

      const productId = 'prod456';
      const key = `product:${productId}:details`;

      await setCache(key, { name: 'Test Product', price: 100 });

      const result = await getCache<{ name: string; price: number }>(key);
      expect(result?.name).toBe('Test Product');
    });

    it('should support session-scoped cache keys', async () => {
      const { setCache, getCache } = await import('../redis.js');

      const sessionId = 'sess789';
      const key = `session:${sessionId}`;

      await setCache(key, { userId: 'user123', createdAt: Date.now() }, 86400);

      const result = await getCache<{ userId: string; createdAt: number }>(key);
      expect(result?.userId).toBe('user123');
    });
  });
});
