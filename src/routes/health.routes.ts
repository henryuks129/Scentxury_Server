import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { redisClient, isRedisConnected } from '../config/redis.js';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  services: {
    api: ServiceStatus;
    mongodb: ServiceStatus;
    redis: ServiceStatus;
  };
  memory: {
    used: string;
    total: string;
    percentage: string;
  };
}

interface ServiceStatus {
  status: 'connected' | 'disconnected' | 'error';
  latency?: number;
  message?: string;
}

/**
 * @route   GET /health
 * @desc    Comprehensive health check for all services
 * @access  Public
 */
router.get('/', async (_req: Request, res: Response) => {
  const healthStatus: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      api: { status: 'connected' },
      mongodb: { status: 'disconnected' },
      redis: { status: 'disconnected' },
    },
    memory: {
      used: '0 MB',
      total: '0 MB',
      percentage: '0%',
    },
  };

  // Check MongoDB
  try {
    const mongoStart = Date.now();
    const mongoState = mongoose.connection.readyState;
    
    if (mongoState === 1) {
      // Ping database to verify actual connectivity
      await mongoose.connection.db?.admin().ping();
      healthStatus.services.mongodb = {
        status: 'connected',
        latency: Date.now() - mongoStart,
      };
    } else {
      healthStatus.services.mongodb = {
        status: 'disconnected',
        message: getMongoStateMessage(mongoState),
      };
      healthStatus.status = 'degraded';
    }
  } catch (error) {
    healthStatus.services.mongodb = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    healthStatus.status = 'degraded';
  }

  // Check Redis
  try {
    const redisStart = Date.now();
    
    if (isRedisConnected()) {
      await redisClient.ping();
      healthStatus.services.redis = {
        status: 'connected',
        latency: Date.now() - redisStart,
      };
    } else {
      healthStatus.services.redis = {
        status: 'disconnected',
        message: `Redis status: ${redisClient.status}`,
      };
      healthStatus.status = 'degraded';
    }
  } catch (error) {
    healthStatus.services.redis = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    healthStatus.status = 'degraded';
  }

  // Memory usage
  const memUsage = process.memoryUsage();
  healthStatus.memory = {
    used: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
    total: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
    percentage: `${Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)}%`,
  };

  // Determine overall status
  const allServicesHealthy = 
    healthStatus.services.mongodb.status === 'connected' &&
    healthStatus.services.redis.status === 'connected';

  if (!allServicesHealthy) {
    healthStatus.status = 'degraded';
  }

  const anyServiceError = 
    healthStatus.services.mongodb.status === 'error' ||
    healthStatus.services.redis.status === 'error';

  if (anyServiceError) {
    healthStatus.status = 'unhealthy';
  }

  // Response status code based on health
  const statusCode = healthStatus.status === 'healthy' ? 200 : 
                     healthStatus.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(healthStatus);
});

/**
 * @route   GET /health/live
 * @desc    Kubernetes liveness probe - is the app running?
 * @access  Public
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @route   GET /health/ready
 * @desc    Kubernetes readiness probe - can the app accept traffic?
 * @access  Public
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const mongoReady = mongoose.connection.readyState === 1;
  const redisReady = isRedisConnected();

  if (mongoReady && redisReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      services: {
        mongodb: mongoReady ? 'ready' : 'not ready',
        redis: redisReady ? 'ready' : 'not ready',
      },
    });
  }
});

/**
 * Get MongoDB connection state message
 */
function getMongoStateMessage(state: number): string {
  const states: Record<number, string> = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting',
  };
  return states[state] || 'Unknown';
}

export default router;
