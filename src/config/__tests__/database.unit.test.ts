/**
 * ============================================
 * DATABASE CONFIGURATION - UNIT TESTS
 * ============================================
 *
 * Tests for MongoDB connection logic without
 * actually connecting to a database.
 *
 * @file src/config/__tests__/database.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

// Mock mongoose before importing the module
vi.mock('mongoose', async () => {
  const actual = await vi.importActual('mongoose');
  return {
    ...actual,
    default: {
      ...actual,
      connect: vi.fn(),
      disconnect: vi.fn(),
      connection: {
        readyState: 0,
        on: vi.fn(),
        db: {
          admin: () => ({
            ping: vi.fn().mockResolvedValue({ ok: 1 }),
          }),
        },
      },
    },
  };
});

describe('Database Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    process.env.MONGO_URI = 'mongodb://localhost:27017/test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connectDatabase', () => {
    it('should call mongoose.connect with correct URI', async () => {
      const { connectDatabase } = await import('../database.js');

      vi.mocked(mongoose.connect).mockResolvedValue(mongoose);

      await connectDatabase();

      expect(mongoose.connect).toHaveBeenCalledWith(
        expect.stringContaining('mongodb'),
        expect.any(Object)
      );
    });

    it('should use connection options with pooling', async () => {
      const { connectDatabase } = await import('../database.js');

      vi.mocked(mongoose.connect).mockResolvedValue(mongoose);

      await connectDatabase();

      expect(mongoose.connect).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          maxPoolSize: 10,
        })
      );
    });

    it('should set server selection timeout', async () => {
      const { connectDatabase } = await import('../database.js');

      vi.mocked(mongoose.connect).mockResolvedValue(mongoose);

      await connectDatabase();

      expect(mongoose.connect).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          serverSelectionTimeoutMS: 5000,
        })
      );
    });

    it('should set socket timeout', async () => {
      const { connectDatabase } = await import('../database.js');

      vi.mocked(mongoose.connect).mockResolvedValue(mongoose);

      await connectDatabase();

      expect(mongoose.connect).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          socketTimeoutMS: 45000,
        })
      );
    });

    it('should throw error on connection failure', async () => {
      const { connectDatabase } = await import('../database.js');

      const connectionError = new Error('Connection failed');
      vi.mocked(mongoose.connect).mockRejectedValue(connectionError);

      await expect(connectDatabase()).rejects.toThrow('Connection failed');
    });

    it('should return mongoose connection on success', async () => {
      const { connectDatabase } = await import('../database.js');

      vi.mocked(mongoose.connect).mockResolvedValue(mongoose);

      const result = await connectDatabase();

      expect(result).toBeDefined();
    });
  });

  describe('disconnectDatabase', () => {
    it('should call mongoose.disconnect', async () => {
      const { disconnectDatabase } = await import('../database.js');

      vi.mocked(mongoose.disconnect).mockResolvedValue();

      await disconnectDatabase();

      expect(mongoose.disconnect).toHaveBeenCalled();
    });
  });

  describe('Connection Options', () => {
    it('should configure correct maxPoolSize for production load', async () => {
      const { connectDatabase } = await import('../database.js');

      vi.mocked(mongoose.connect).mockResolvedValue(mongoose);

      await connectDatabase();

      // maxPoolSize of 10 is appropriate for medium traffic
      const callArgs = vi.mocked(mongoose.connect).mock.calls[0];
      const options = callArgs?.[1] as { maxPoolSize?: number };
      expect(options?.maxPoolSize).toBe(10);
    });

    it('should configure appropriate server selection timeout', async () => {
      const { connectDatabase } = await import('../database.js');

      vi.mocked(mongoose.connect).mockResolvedValue(mongoose);

      await connectDatabase();

      // 5 seconds is reasonable for server selection
      const callArgs = vi.mocked(mongoose.connect).mock.calls[0];
      const options = callArgs?.[1] as { serverSelectionTimeoutMS?: number };
      expect(options?.serverSelectionTimeoutMS).toBe(5000);
    });

    it('should configure appropriate socket timeout', async () => {
      const { connectDatabase } = await import('../database.js');

      vi.mocked(mongoose.connect).mockResolvedValue(mongoose);

      await connectDatabase();

      // 45 seconds allows for slow queries without premature timeout
      const callArgs = vi.mocked(mongoose.connect).mock.calls[0];
      const options = callArgs?.[1] as { socketTimeoutMS?: number };
      expect(options?.socketTimeoutMS).toBe(45000);
    });
  });

  describe('Environment Variables', () => {
    it('should use MONGO_URI from environment', async () => {
      process.env.MONGO_URI = 'mongodb://custom-host:27017/custom-db';

      // Re-import to pick up new env
      vi.resetModules();
      const { connectDatabase } = await import('../database.js');

      vi.mocked(mongoose.connect).mockResolvedValue(mongoose);

      await connectDatabase();

      expect(mongoose.connect).toHaveBeenCalledWith(
        'mongodb://custom-host:27017/custom-db',
        expect.any(Object)
      );
    });

    it('should use default URI if MONGO_URI not set', async () => {
      delete process.env.MONGO_URI;

      vi.resetModules();
      const { connectDatabase } = await import('../database.js');

      vi.mocked(mongoose.connect).mockResolvedValue(mongoose);

      await connectDatabase();

      expect(mongoose.connect).toHaveBeenCalledWith(
        expect.stringContaining('mongodb://localhost:27017/scentxury'),
        expect.any(Object)
      );
    });
  });
});
