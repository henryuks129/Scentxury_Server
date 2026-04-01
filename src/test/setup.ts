/**
 * ============================================
 * VITEST TEST SETUP
 * ============================================
 *
 * This file is listed in vitest.config.ts → test.setupFiles, which means
 * Vitest re-runs it before EVERY test file in the same worker process.
 *
 * With pool:"forks" + singleFork:true all test files share ONE process, so
 * this setup file executes multiple times.  Module-level variables reset on
 * each re-evaluation; we persist state that must survive across files on
 * `process` using string keys.
 *
 * Connection strategy:
 *  - beforeAll: if Mongoose is connected, disconnect first, then reconnect to
 *    the same MongoMemoryServer.  This ensures the server monitor (heartbeat
 *    timer) is freshly started for each file and cleanly stopped in afterAll.
 *  - afterAll: disconnect Mongoose.  This stops the MongoDB server monitor
 *    timer and prevents the Mongoose 9.x "Cannot set property readyState
 *    (getter-only)" unhandled rejection that fires when the monitor ticks
 *    after the test environment has been torn down.
 *  - Exit handler: stops the MongoMemoryServer process itself.
 *
 * @file src/test/setup.ts
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Module-level server reference — only valid in the invocation that created it.
let mongoServer: MongoMemoryServer | undefined;

// Keys on `process` that survive module re-evaluations in singleFork mode.
const MONGO_URI_KEY    = '__scentxury_mongo_uri__';
const HANDLER_FLAG     = '__scentxury_exit_handler_registered__';

type Proc = NodeJS.Process & Record<string, unknown>;

// Raise the default listener limit early to suppress MaxListenersExceededWarnings.
process.setMaxListeners(50);

// Register a one-time exit handler that stops the MongoMemoryServer.
// Mongoose connections are closed in afterAll (below); this only handles
// the memory server binary.
function ensureExitHandler() {
  if ((process as Proc)[HANDLER_FLAG]) return;
  (process as Proc)[HANDLER_FLAG] = true;

  const stopServer = async () => {
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    const storedUri = (process as Proc)[MONGO_URI_KEY] as string | undefined;
    if (storedUri && mongoServer) {
      try { await mongoServer.stop(); } catch { /* ignore */ }
    }
  };

  process.on('SIGTERM', () => { void stopServer().then(() => process.exit(0)); });
}

/**
 * Setup before all tests in the file.
 *
 * Always ensures a fresh Mongoose connection to the MongoMemoryServer so
 * that afterAll can safely disconnect without worrying about whether a
 * previous file's connection is still in use.
 */
beforeAll(async () => {
  process.env.NODE_ENV        = 'test';
  process.env.JWT_SECRET      = 'test-jwt-secret-for-testing-only';
  process.env.SESSION_SECRET  = 'test-session-secret';
  process.env.BCRYPT_ROUNDS   = '4'; // Fast bcrypt in tests (production uses 12)

  ensureExitHandler();

  // Disconnect any leftover connection from the previous test file so the
  // server monitor timer is cleanly restarted (and can be stopped in afterAll).
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Check whether a MongoMemoryServer was already started by a previous
  // module evaluation (its URI is stored on `process`).
  let mongoUri = (process as Proc)[MONGO_URI_KEY] as string | undefined;

  if (!mongoUri) {
    // First test file: start the in-memory database.
    mongoServer = await MongoMemoryServer.create({
      instance: { dbName: 'scentxury_test', launchTimeout: 120000 },
    });
    mongoUri = mongoServer.getUri();
    (process as Proc)[MONGO_URI_KEY] = mongoUri;
    console.log(`✅ Test MongoDB started: ${mongoUri}`);
  }

  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
    // High heartbeat interval so the monitor rarely fires between connect and
    // the afterAll disconnect; reduces the window for the readyState race.
    heartbeatFrequencyMS: 30000,
  });

  // Prevent MaxListenersExceededWarning across all model/connection listeners.
  mongoose.connection.setMaxListeners(50);
});

/**
 * Disconnect after every test file.
 *
 * In Mongoose 9.1.3, when MongoClient closes it emits `serverDescriptionChanged`
 * with type "Unknown" during shutdown, and Mongoose's listener tries to set
 * `conn.readyState = STATES.disconnected`.  On the NativeConnection instance
 * that setter is getter-only after teardown, which throws a TypeError that
 * becomes an unhandled rejection and fails the entire Vitest run — even though
 * every individual test passed.
 *
 * Fix: remove the topology event listeners from the MongoClient BEFORE calling
 * disconnect so that no code path tries to write `readyState` during close.
 */
afterAll(async () => {
  try {
    const client = mongoose.connection.client;
    if (client) {
      // Strip the listeners Mongoose registered in _setClient() so they don't
      // fire (and try to write readyState) when client.close() triggers topology
      // shutdown events.
      client.removeAllListeners('serverDescriptionChanged');
      client.removeAllListeners('topologyDescriptionChanged');
      client.removeAllListeners('serverHeartbeatSucceeded');
      client.removeAllListeners('serverHeartbeatFailed');
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  } catch { /* ignore */ }
});

/**
 * Reset database state before each individual test.
 */
beforeEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      if (collection) {
        await collection.deleteMany({});
      }
    }
  }
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
