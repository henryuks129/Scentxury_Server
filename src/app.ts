/**
 * ============================================
 * SCENTXURY - Express Application Configuration
 * ============================================
 * 
 * This file contains the Express app setup WITHOUT starting the server.
 * This separation allows for:
 * - Easy testing (import app without starting server)
 * - Serverless deployment compatibility
 * - Clean separation of concerns
 * 
 * @file src/app.ts
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
// import mongoSanitize from 'express-mongo-sanitize'; // Incompatible with Express 5.x
import hpp from 'hpp';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';

// Custom NoSQL injection sanitizer (replaces express-mongo-sanitize for Express 5)
import { sanitize } from './middleware/sanitize.middleware.js';

// Import custom error classes for structured error handling
import { AppError as ScentxuryAppError, ValidationError as ScentxuryValidationError } from './utils/errors.js';

// Import routes
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/product.routes.js';
import orderRoutes from './routes/order.routes.js';
import cartRoutes from './routes/cart.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import adminRoutes from './routes/admin.routes.js';
import wishlistRoutes from './routes/wishlist.routes.js';
import couponRoutes from './routes/coupon.routes.js';
// Day 6 routes
import recommendationRoutes from './routes/recommendation.routes.js';
import surveyRoutes from './routes/survey.routes.js';
import chatbotRoutes from './routes/chatbot.routes.js';
import exportRoutes from './routes/export.routes.js';

// Import Passport config (registers strategies as side effect)
import './config/passport.js';

// Socket.io module accessor (allows services to emit events)
import { setIO } from './config/socket.js';
// Day 6: socket service initialiser and analytics cron starter
import { initializeSocket } from './services/socket.service.js';
import { startAnalyticsCrons } from './jobs/analytics.cron.js';

// Import middleware
// import { errorHandler } from './middleware/error.middleware.js';
// import { requestLogger } from './middleware/logger.middleware.js';

// ============================================
// Create Express App
// ============================================
const app: Express = express();

// ============================================
// Create HTTP Server (for Socket.io)
// ============================================
const httpServer: HttpServer = createServer(app);

// ============================================
// Socket.io Configuration
// ============================================
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ============================================
// Security Middleware
// ============================================

// Set security HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Enable CORS
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.FRONTEND_URL || ''
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Limit each IP
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// More strict rate limit for auth routes (production only — avoids test interference)
if (process.env.NODE_ENV === 'production') {
  const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 attempts per hour
    message: {
      success: false,
      message: 'Too many login attempts, please try again after an hour.',
    },
  });
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);
}

// Data sanitization against NoSQL injection
// Uses custom middleware (express-mongo-sanitize is incompatible with Express 5.x)
// Strips MongoDB operator keys ($gt, $where, etc.) from req.body and req.params.
// req.query is left to Zod validators in controllers (read-only in Express 5).
app.use(sanitize);

// Prevent HTTP Parameter Pollution
app.use(hpp({
  whitelist: ['category', 'scentFamily', 'price', 'size', 'sort'],
}));

// ============================================
// Body Parser Middleware
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// ============================================
// Request Logging (Development)
// ============================================
if (process.env.NODE_ENV !== 'test') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
  });
}

// ============================================
// Health & Status Routes (No auth required)
// ============================================
app.use('/health', healthRoutes);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: '🌸 Welcome to Scentxury API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// API documentation endpoint
app.get('/api/v1', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Scentxury API v1',
    documentation: 'https://docs.scentxury.com',
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      products: '/api/v1/products',
      orders: '/api/v1/orders',
      recommendations: '/api/v1/recommendations',
      admin: '/api/v1/admin',
      payments: '/api/v1/payments',
    },
  });
});

// ============================================
// API Routes
// ============================================
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/wishlist', wishlistRoutes);
app.use('/api/v1/coupons', couponRoutes);
// Day 6: AI, survey, chatbot, export routes
app.use('/api/v1/recommendations', recommendationRoutes);
app.use('/api/v1/surveys', surveyRoutes);
app.use('/api/v1/chat', chatbotRoutes);
app.use('/api/v1/admin/export', exportRoutes);

// ============================================
// Socket.io Events
// ============================================
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Admin joins dashboard room for real-time BI updates
  socket.on('join:admin', () => {
    socket.join('admin-dashboard');
    console.log(`📊 Admin joined dashboard: ${socket.id}`);
  });

  // User joins their order tracking room
  socket.on('join:order', (orderNumber: string) => {
    socket.join(`order:${orderNumber}`);
    console.log(`📦 User tracking order: ${orderNumber}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Register io in the module-level accessor so services can emit events
setIO(io);
// Day 6: initialise socket service (registers room handlers + typed emitters)
initializeSocket(io);
// Also keep on app for any legacy req.app.get('io') usage
app.set('io', io);

// Day 6: start analytics cron jobs (skip in test env to avoid open handles)
if (process.env.NODE_ENV !== 'test') {
  startAnalyticsCrons();
}

// ============================================
// 404 Handler
// ============================================
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: _req.path,
  });
});

// ============================================
// Global Error Handler
// ============================================
interface AppError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
  code?: number | string;
  errors?: Record<string, unknown>[];
}

app.use((err: AppError, _req: Request, res: Response, _next: NextFunction): void => {
  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';

  console.error(`❌ [${new Date().toISOString()}] Error:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: _req.path,
    method: _req.method,
  });

  // ── Our custom AppError subclasses (ValidationError, UnauthorizedError, etc.) ──
  // Check this BEFORE the Mongoose name checks to ensure our 422 errors include
  // field-level errors and our 401/403/404/409 errors include error codes.
  if (err instanceof ScentxuryAppError) {
    // ValidationError carries a field-level errors array
    if (err instanceof ScentxuryValidationError) {
      res.status(err.statusCode).json({
        success: false,
        status: err.status,
        message: err.message,
        errors: err.errors,
        ...(err.code && { code: err.code }),
      });
      return;
    }

    // All other operational errors (UnauthorizedError, ForbiddenError, NotFoundError, …)
    res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
      ...(err.code && { code: err.code }),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
    return;
  }

  // ── Mongoose schema validation error (name is 'ValidationError') ──
  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors,
    });
    return;
  }

  // ── Mongoose duplicate key error → 409 Conflict ──
  if (err.code === 11000) {
    res.status(409).json({
      success: false,
      message: 'Resource already exists',
    });
    return;
  }

  // ── JWT errors ──
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      message: 'Token expired',
    });
    return;
  }

  // ── Unhandled / programming errors ──
  res.status(statusCode).json({
    success: false,
    status,
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong'
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ============================================
// Exports
// ============================================
export { app, httpServer, io };
