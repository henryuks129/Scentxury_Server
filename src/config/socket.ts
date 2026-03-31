/**
 * ============================================
 * SOCKET.IO GLOBAL ACCESSOR
 * ============================================
 *
 * Provides a module-level reference to the Socket.io
 * server instance so services can emit events without
 * requiring a direct dependency on Express app.
 *
 * Usage:
 *   - Call setIO(io) once during app startup (app.ts)
 *   - Call getIO() in services to emit events
 *
 * @file src/config/socket.ts
 */

import type { Server as SocketServer } from 'socket.io';

let _io: SocketServer | null = null;

/**
 * Register the Socket.io server instance (called once in app.ts)
 */
export function setIO(io: SocketServer): void {
  _io = io;
}

/**
 * Retrieve the Socket.io server instance.
 * Returns null if called before setIO (e.g. in tests).
 */
export function getIO(): SocketServer | null {
  return _io;
}
