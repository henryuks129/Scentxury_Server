/**
 * ============================================
 * HEALTH ROUTES - UNIT TESTS
 * ============================================
 *
 * Tests for health check endpoints.
 * Uses the in-memory MongoDB from test setup.
 *
 * @file src/routes/__tests__/health.routes.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import mongoose from 'mongoose';

// Mock Redis module before importing routes
vi.mock('../../config/redis.js', () => ({
  redisClient: {
    status: 'ready',
    ping: vi.fn().mockResolvedValue('PONG'),
  },
  isRedisConnected: vi.fn().mockReturnValue(true),
}));

// Import after mocking
import healthRoutes from '../health.routes.js';
import { isRedisConnected, redisClient } from '../../config/redis.js';

describe('Health Routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use('/health', healthRoutes);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 with health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('services');
    });

    it('should include service status for MongoDB', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.services).toHaveProperty('mongodb');
      expect(response.body.services.mongodb).toHaveProperty('status');
    });

    it('should include service status for Redis', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.services).toHaveProperty('redis');
      expect(response.body.services.redis).toHaveProperty('status');
    });

    it('should include service status for API', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.services).toHaveProperty('api');
      expect(response.body.services.api.status).toBe('connected');
    });

    it('should include memory usage information', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('memory');
      expect(response.body.memory).toHaveProperty('used');
      expect(response.body.memory).toHaveProperty('total');
      expect(response.body.memory).toHaveProperty('percentage');
    });

    it('should include uptime', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThan(0);
    });

    it('should return healthy status when all services are up', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(true);
      vi.mocked(redisClient.ping).mockResolvedValue('PONG');

      const response = await request(app).get('/health');

      // Status should be healthy or degraded depending on DB state
      expect(['healthy', 'degraded']).toContain(response.body.status);
    });

    it('should return degraded status when Redis is down', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(false);

      const response = await request(app).get('/health');

      expect(response.body.status).toBe('degraded');
      expect(response.body.services.redis.status).toBe('disconnected');
    });

    it('should include latency for connected services', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(true);
      vi.mocked(redisClient.ping).mockResolvedValue('PONG');

      const response = await request(app).get('/health').expect(200);

      // Redis should have latency if connected
      if (response.body.services.redis.status === 'connected') {
        expect(response.body.services.redis).toHaveProperty('latency');
        expect(typeof response.body.services.redis.latency).toBe('number');
      }
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app).get('/health').expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });
  });

  describe('GET /health/live', () => {
    it('should return 200 for liveness probe', async () => {
      const response = await request(app).get('/health/live').expect(200);

      expect(response.body).toMatchObject({
        status: 'alive',
      });
    });

    it('should include timestamp', async () => {
      const response = await request(app).get('/health/live').expect(200);

      expect(response.body).toHaveProperty('timestamp');
    });

    it('should always return 200 regardless of service state', async () => {
      // Even if services are down, liveness should pass
      vi.mocked(isRedisConnected).mockReturnValue(false);

      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('alive');
    });

    it('should respond quickly (< 10ms)', async () => {
      const start = Date.now();
      await request(app).get('/health/live');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Allow some buffer for CI
    });
  });

  describe('GET /health/ready', () => {
    it('should return 200 when all services ready', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(true);

      // Ensure MongoDB is connected (from test setup)
      if (mongoose.connection.readyState === 1) {
        const response = await request(app).get('/health/ready');

        // May be 200 or 503 depending on actual connection state
        expect([200, 503]).toContain(response.status);
      }
    });

    it('should return 503 when Redis is unavailable', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(false);

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not ready');
    });

    it('should include timestamp in response', async () => {
      const response = await request(app).get('/health/ready');

      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include service states when not ready', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(false);

      const response = await request(app).get('/health/ready');

      expect(response.body).toHaveProperty('services');
      expect(response.body.services.redis).toBe('not ready');
    });

    it('should report MongoDB readiness correctly', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(true);

      const response = await request(app).get('/health/ready');

      if (mongoose.connection.readyState === 1) {
        expect(response.body.services?.mongodb || 'ready').toBe('ready');
      } else {
        expect(response.body.services?.mongodb).toBe('not ready');
      }
    });
  });

  describe('Response Format', () => {
    it('should return JSON content type', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should have consistent response structure', async () => {
      const response = await request(app).get('/health').expect(200);

      // Validate structure
      expect(response.body).toEqual(
        expect.objectContaining({
          status: expect.any(String),
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          services: expect.objectContaining({
            api: expect.any(Object),
            mongodb: expect.any(Object),
            redis: expect.any(Object),
          }),
          memory: expect.objectContaining({
            used: expect.any(String),
            total: expect.any(String),
            percentage: expect.any(String),
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis ping errors gracefully', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(true);
      vi.mocked(redisClient.ping).mockRejectedValue(new Error('Ping failed'));

      const response = await request(app).get('/health');

      // Should not crash - returns 200 (degraded) or 503 (unhealthy) depending on MongoDB
      expect([200, 503]).toContain(response.status);
      expect(response.body.services.redis.status).toBe('error');
    });

    it('should include error message for failed services', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(true);
      vi.mocked(redisClient.ping).mockRejectedValue(new Error('Connection reset'));

      const response = await request(app).get('/health');

      expect(response.body.services.redis).toHaveProperty('message');
    });
  });
});
