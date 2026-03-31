/**
 * ============================================
 * SCENTXURY - Main Entry Point
 * ============================================
 *
 * This file serves as the main entry point and re-exports
 * key modules for convenience.
 *
 * Project Structure:
 * - app.ts    → Express app configuration (for testing)
 * - server.ts → Server startup (production entry)
 * - index.ts  → Re-exports (this file)
 *
 * Usage:
 * - Production: Run `server.ts` directly via `npm start`
 * - Testing: Import from this file or `app.ts`
 * - General: Import from this file
 *
 * NOTE: Do NOT import from server.ts here as it auto-starts the server.
 * For programmatic server control, import directly from server.ts.
 *
 * @file src/index.ts
 */

// Re-export app components
export { app, httpServer, io } from './app.js';

// Re-export configuration utilities
export { connectDatabase, disconnectDatabase } from './config/database.js';
export {
  connectRedis,
  disconnectRedis,
  redisClient,
  setCache,
  getCache,
  deleteCache,
  isRedisConnected
} from './config/redis.js';

// Default export is the app for convenience
import { app } from './app.js';
export default app;
