import { Redis } from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

// Main Redis client for general caching
export const redisClient = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error('🔴 Redis: Max reconnection attempts reached');
      return null;
    }
    const delay = Math.min(times * 100, 3000);
    console.log(`🔄 Redis: Reconnecting in ${delay}ms...`);
    return delay;
  },
});

// Connection for BullMQ (needs separate connection)
export const bullMQConnection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

// Redis event handlers
redisClient.on('connect', () => {
  console.log('🔴 Redis: Connecting...');
});

redisClient.on('ready', () => {
  console.log('🟢 Redis: Ready and connected');
});

redisClient.on('error', (err: Error) => {
  console.error('🔴 Redis: Error:', err.message);
});

redisClient.on('close', () => {
  console.log('🔴 Redis: Connection closed');
});

redisClient.on('reconnecting', () => {
  console.log('🔄 Redis: Reconnecting...');
});

// Connect to Redis
export async function connectRedis(): Promise<void> {
  try {
    await redisClient.ping();
    console.log('🟢 Redis: PING successful');
  } catch (error) {
    console.error('🔴 Redis: Failed to connect:', error);
    throw error;
  }
}

// Disconnect from Redis
export async function disconnectRedis(): Promise<void> {
  await redisClient.quit();
}

// ============================================
// Cache Utility Functions
// ============================================

/**
 * Set a value in cache with optional expiration
 */
export async function setCache(
  key: string,
  value: unknown,
  expireSeconds?: number
): Promise<void> {
  const stringValue = JSON.stringify(value);
  if (expireSeconds) {
    await redisClient.setex(key, expireSeconds, stringValue);
  } else {
    await redisClient.set(key, stringValue);
  }
}

/**
 * Get a value from cache
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const value = await redisClient.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

/**
 * Delete a value from cache
 */
export async function deleteCache(key: string): Promise<void> {
  await redisClient.del(key);
}

/**
 * Delete all keys matching a pattern
 */
export async function deleteCachePattern(pattern: string): Promise<void> {
  const keys = await redisClient.keys(pattern);
  if (keys.length > 0) {
    await redisClient.del(...keys);
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisClient.status === 'ready';
}

export default redisClient;
