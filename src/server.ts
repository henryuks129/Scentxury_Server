/**
 * ============================================
 * SCENTXURY - Server Entry Point
 * ============================================
 * 
 * This file is responsible for:
 * - Connecting to databases (MongoDB, Redis)
 * - Starting the HTTP server
 * - Graceful shutdown handling
 * - Process error handling
 * 
 * IMPORTANT: This file should NOT be imported in tests.
 * Import `app` from './app.ts' instead for testing.
 * 
 * @file src/server.ts
 */

import mongoose from 'mongoose';
import { httpServer, io } from './app.js';
import { connectDatabase } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ============================================
// Configuration
// ============================================
const PORT = parseInt(process.env.PORT || '5000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================
// Server State
// ============================================
let isShuttingDown = false;

// ============================================
// Start Server
// ============================================
async function startServer(): Promise<void> {
  try {
    console.log('🚀 Starting Scentxury API Server...\n');

    // Step 1: Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    await connectDatabase();
    console.log('✅ MongoDB connected successfully\n');

    // Step 2: Connect to Redis
    console.log('🔴 Connecting to Redis...');
    await connectRedis();
    console.log('✅ Redis connected successfully\n');

    // Step 3: Start HTTP server
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🌸 SCENTXURY API SERVER - Chi Fragrance E-commerce             ║
║                                                                  ║
║   ┌──────────────────────────────────────────────────────────┐   ║
║   │  Status:      ✅ Running                                 │   ║
║   │  Port:        ${PORT}                                        │   ║
║   │  Environment: ${NODE_ENV.padEnd(20)}                    │   ║
║   │  Process ID:  ${process.pid}                                    │   ║
║   │  Node.js:     ${process.version.padEnd(20)}                │   ║
║   └──────────────────────────────────────────────────────────┘   ║
║                                                                  ║
║   📡 Endpoints:                                                  ║
║   • Health:    http://localhost:${PORT}/health                     ║
║   • API:       http://localhost:${PORT}/api/v1                     ║
║   • WebSocket: ws://localhost:${PORT}                              ║
║                                                                  ║
║   📊 Services:                                                   ║
║   • MongoDB:   Connected                                         ║
║   • Redis:     Connected                                         ║
║   • Socket.io: Ready                                             ║
║                                                                  ║
║   🕐 Started:  ${new Date().toISOString()}               ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
      `);
    });

    // Step 4: Initialize background jobs (optional)
    // await initializeCronJobs();
    // await initializeBullMQWorkers();

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// ============================================
// Graceful Shutdown
// ============================================
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log('⚠️ Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;
  console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);

  const shutdownTimeout = setTimeout(() => {
    console.error('❌ Shutdown timed out. Forcing exit...');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // Step 1: Stop accepting new connections
    console.log('📡 Closing HTTP server...');
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✅ HTTP server closed');

    // Step 2: Close Socket.io connections
    console.log('🔌 Closing Socket.io connections...');
    io.close();
    console.log('✅ Socket.io closed');

    // Step 3: Close Redis connection
    console.log('🔴 Closing Redis connection...');
    if (redisClient) {
      await redisClient.quit();
    }
    console.log('✅ Redis connection closed');

    // Step 4: Close MongoDB connection
    console.log('📦 Closing MongoDB connection...');
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');

    clearTimeout(shutdownTimeout);
    console.log('\n👋 Graceful shutdown complete. Goodbye!\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

// ============================================
// Process Event Handlers
// ============================================

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error.message);
  console.error(error.stack);
  
  // In production, attempt graceful shutdown
  if (NODE_ENV === 'production') {
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  } else {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('❌ UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
  
  // In production, attempt graceful shutdown
  if (NODE_ENV === 'production') {
    gracefulShutdown('UNHANDLED_REJECTION');
  }
});

// Handle SIGTERM (Docker, Kubernetes, Heroku)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle SIGUSR2 (Nodemon restart)
process.on('SIGUSR2', () => {
  console.log('🔄 SIGUSR2 received (Nodemon restart)');
  gracefulShutdown('SIGUSR2');
});

// ============================================
// Start the Server
// ============================================
startServer();

// ============================================
// Export for testing (if needed)
// ============================================
export { startServer, gracefulShutdown };
