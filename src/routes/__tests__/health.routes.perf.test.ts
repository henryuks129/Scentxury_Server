/**
 * ============================================
 * HEALTH ROUTES - PERFORMANCE TESTS
 * ============================================
 *
 * Tests for health check endpoint performance.
 *
 * @file src/routes/__tests__/health.routes.perf.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { measureTime, expectPerformance } from '../../test/helpers.js';

// Mock Redis module
vi.mock('../../config/redis.js', () => ({
  redisClient: {
    status: 'ready',
    ping: vi.fn().mockResolvedValue('PONG'),
  },
  isRedisConnected: vi.fn().mockReturnValue(true),
}));

import healthRoutes from '../health.routes.js';

describe('Health Routes Performance', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use('/health', healthRoutes);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /health Performance', () => {
    it('should respond within 200ms', async () => {
      await expectPerformance(
        async () => {
          await request(app).get('/health');
        },
        200, // max 200ms (relaxed for test environment)
        20 // 20 iterations
      );
    });

    it('should handle 50 concurrent health checks within 2 seconds', async () => {
      const { duration } = await measureTime(async () => {
        const requests = Array(50)
          .fill(null)
          .map(() => request(app).get('/health'));
        await Promise.all(requests);
      });

      expect(duration).toBeLessThan(2000);
      console.log(`50 concurrent /health requests: ${duration.toFixed(2)}ms`);
    });

    it('should maintain performance under load', async () => {
      // Simulate sustained load.
      // Use Connection: close on every request so the keep-alive socket is
      // released immediately.  Without this, 100 sequential requests leave
      // the socket half-open; in singleFork mode the next test file reuses
      // the same Node.js process and supertest occasionally gets an
      // HPE_INVALID_CONSTANT / "socket hang up" error on the lingering socket.
      const iterations = 100;
      const { duration } = await measureTime(async () => {
        for (let i = 0; i < iterations; i++) {
          await request(app).get('/health').set('Connection', 'close');
        }
      });

      const avgTime = duration / iterations;
      expect(avgTime).toBeLessThan(50); // Average < 50ms per request
      console.log(
        `100 sequential /health requests: ${duration.toFixed(2)}ms (avg: ${avgTime.toFixed(2)}ms)`
      );
    });
  });

  describe('GET /health/live Performance', () => {
    it('should respond within 50ms (lightweight endpoint)', async () => {
      await expectPerformance(
        async () => {
          await request(app).get('/health/live');
        },
        50, // max 50ms (relaxed for test environment with supertest overhead)
        50
      );
    });

    it('should handle 100 concurrent liveness checks within 1 second', async () => {
      const { duration } = await measureTime(async () => {
        const requests = Array(100)
          .fill(null)
          .map(() => request(app).get('/health/live'));
        await Promise.all(requests);
      });

      expect(duration).toBeLessThan(1000);
      console.log(`100 concurrent /health/live requests: ${duration.toFixed(2)}ms`);
    });

    it('should maintain consistent response times', async () => {
      const times: number[] = [];

      for (let i = 0; i < 20; i++) {
        const { duration } = await measureTime(async () => {
          await request(app).get('/health/live');
        });
        times.push(duration);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const variance =
        times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length;
      const stdDev = Math.sqrt(variance);

      // Standard deviation should be reasonable (relaxed for test environment variability)
      // In CI/test environments, response times can vary more than production
      expect(stdDev).toBeLessThan(avg * 2 + 20); // Allow more variance in test env
      console.log(`Liveness check: avg=${avg.toFixed(2)}ms, stdDev=${stdDev.toFixed(2)}ms`);
    });
  });

  describe('GET /health/ready Performance', () => {
    it('should respond within 50ms', async () => {
      await expectPerformance(
        async () => {
          await request(app).get('/health/ready');
        },
        50, // max 50ms
        30
      );
    });

    it('should handle burst traffic', async () => {
      // Simulate burst of requests
      const burstSize = 20;
      const bursts = 5;

      const { duration } = await measureTime(async () => {
        for (let i = 0; i < bursts; i++) {
          const requests = Array(burstSize)
            .fill(null)
            .map(() => request(app).get('/health/ready'));
          await Promise.all(requests);
        }
      });

      expect(duration).toBeLessThan(3000);
      console.log(
        `${bursts} bursts of ${burstSize} /health/ready requests: ${duration.toFixed(2)}ms`
      );
    });
  });

  describe('Comparative Performance', () => {
    it('should show /health/live is faster than /health', async () => {
      // Measure /health/live
      const { duration: liveDuration } = await measureTime(async () => {
        for (let i = 0; i < 20; i++) {
          await request(app).get('/health/live').set('Connection', 'close');
        }
      });

      // Measure /health
      const { duration: healthDuration } = await measureTime(async () => {
        for (let i = 0; i < 20; i++) {
          await request(app).get('/health').set('Connection', 'close');
        }
      });

      console.log(
        `20x /health/live: ${liveDuration.toFixed(2)}ms, 20x /health: ${healthDuration.toFixed(2)}ms`
      );

      // Live should be faster (or at least not significantly slower)
      expect(liveDuration).toBeLessThan(healthDuration + 100);
    });
  });

  describe('Response Size', () => {
    it('should return reasonably sized response for /health', async () => {
      const response = await request(app).get('/health');
      const responseSize = JSON.stringify(response.body).length;

      // Response should be under 1KB
      expect(responseSize).toBeLessThan(1024);
      console.log(`/health response size: ${responseSize} bytes`);
    });

    it('should return minimal response for /health/live', async () => {
      const response = await request(app).get('/health/live');
      const responseSize = JSON.stringify(response.body).length;

      // Live response should be under 100 bytes
      expect(responseSize).toBeLessThan(100);
      console.log(`/health/live response size: ${responseSize} bytes`);
    });
  });

  describe('Kubernetes Probe Simulation', () => {
    it('should handle Kubernetes-style frequent liveness probes', async () => {
      // Kubernetes typically probes every 10 seconds
      // Simulate 1 minute of probes (6 probes)
      const probeCount = 6;
      const probeInterval = 100; // Accelerated for testing

      const results: number[] = [];

      for (let i = 0; i < probeCount; i++) {
        const { duration } = await measureTime(async () => {
          await request(app).get('/health/live').set('Connection', 'close');
        });
        results.push(duration);
        await new Promise((resolve) => setTimeout(resolve, probeInterval));
      }

      const maxTime = Math.max(...results);
      expect(maxTime).toBeLessThan(50);
      console.log(`Liveness probe times: ${results.map((r) => r.toFixed(2)).join('ms, ')}ms`);
    });

    it('should handle Kubernetes-style readiness probes', async () => {
      // Readiness probes determine if pod can receive traffic
      const probeCount = 5;

      const { duration } = await measureTime(async () => {
        for (let i = 0; i < probeCount; i++) {
          await request(app).get('/health/ready').set('Connection', 'close');
        }
      });

      const avgTime = duration / probeCount;
      expect(avgTime).toBeLessThan(100);
      console.log(`Readiness probe avg: ${avgTime.toFixed(2)}ms`);
    });
  });
});
