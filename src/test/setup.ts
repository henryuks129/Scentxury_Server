/**
 * ============================================
 * VITEST TEST SETUP
 * ============================================
 *
 * This file is listed in vitest.config.ts → test.setupFiles, which means
 * Vitest re-runs it before EVERY test file in the same worker process.
 *
 * With pool:"forks" + singleFork:true all test files share ONE process, so
 * this setup file executes multiple times.  To avoid "can't call openUri()
 * on an active connection" errors we check whether a connection already
 * exists before creating a new MongoMemoryServer.
 *
 * Teardown (afterAll) does NOT close the Mongoose connection because that
 * would break every subsequent test file in the same fork.  The process-exit
 * handler registered below performs a graceful close when the last test file
 * has finished.
 *
 * @file src/test/setup.ts
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Module-level server reference — shared across invocations within one fork
let mongoServer: MongoMemoryServer | undefined;

// Raise the default listener limit early so test-suite noise is suppressed.
// The setup file is re-executed before each test file in singleFork mode which
// would otherwise trigger MaxListenersExceededWarnings for process/connection.
process.setMaxListeners(50);

// Register a one-time cleanup on process exit so the memory server is freed
// even when afterAll is skipped or throws.
// Use a symbol on `process` so the flag survives module re-evaluation in
// singleFork mode (module-level variables reset each time, process does not).
const HANDLER_FLAG = '__scentxury_exit_handler_registered__';
function ensureExitHandler() {
  if ((process as NodeJS.Process & Record<string, unknown>)[HANDLER_FLAG]) return;
  (process as NodeJS.Process & Record<string, unknown>)[HANDLER_FLAG] = true;

  const cleanup = async () => {
    try {
      for (const conn of mongoose.connections) {
        if (conn.readyState !== 0) {
          await conn.close(); // graceful close
        }
      }
    } catch { /* ignore */ }

    try {
      await mongoServer?.stop();
    } catch { /* ignore */ }
  };

  process.on('exit', () => { void cleanup(); });
  process.on('SIGTERM', () => { void cleanup(); });
}

/**
 * Setup before all tests in the file.
 *
 * If a connection is already open (from a previous test file in the same
 * fork) we reuse it and skip spinning up a new MongoMemoryServer.
 */
beforeAll(async () => {
  // Set test environment variables once
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
  process.env.SESSION_SECRET = 'test-session-secret';
  process.env.BCRYPT_ROUNDS = '4'; // Fast bcrypt in tests (production uses 12)

  ensureExitHandler();

  // If Mongoose is already connected (previous test file in singleFork mode),
  // reuse the existing connection — do NOT create a second MongoMemoryServer.
  if (mongoose.connection.readyState === 1) {
    return;
  }

  // First test file in this fork: spin up a fresh in-memory database
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'scentxury_test',
      launchTimeout: 120000,
    },
  });

  const mongoUri = mongoServer.getUri();

  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
  });

  // Prevent MaxListenersExceededWarning: test suite adds many listeners
  // across model files; 50 is safe for our current test count.
  mongoose.connection.setMaxListeners(50);

  console.log(`✅ Test MongoDB connected: ${mongoUri}`);
});

/**
 * Cleanup after all tests in the file.
 *
 * We intentionally do NOT close the Mongoose connection here because this
 * setup file re-runs before each test file (singleFork mode) and closing
 * the connection would break all subsequent test files with
 * "Connection was force closed" errors.
 *
 * The actual teardown happens in the process-exit handler above.
 */
afterAll(async () => {
  // Nothing to do — connection stays alive for the next test file
});

/**
 * Reset database state before each individual test.
 */
beforeEach(async () => {
  // Clear every collection so tests start with a clean slate
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      if (collection) {
        await collection.deleteMany({});
      }
    }
  }

  // Reset mocks
  vi.clearAllMocks();
});

/**
 * Cleanup after each individual test.
 */
afterEach(async () => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

// ============================================
// EXPORTS
// ============================================

export { mongoServer };

/** Returns the URI of the current in-memory database (empty string if not started). */
export function getTestMongoUri(): string {
  return mongoServer?.getUri() ?? '';
}

/** Returns true when Mongoose has an active connection to the test database. */
export function isTestDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
