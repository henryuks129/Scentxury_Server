/**
 * ============================================
 * EXPRESS TYPE EXTENSIONS
 * ============================================
 *
 * Extends Express & Passport types with Scentxury-specific properties.
 *
 * @file src/types/express.d.ts
 */

import 'express';
import 'passport';

declare global {
  namespace Express {
    /**
     * Augment Passport's Express.User interface so that req.user has
     * the correct shape after our authenticate middleware runs.
     */
    interface User {
      id: string;
      role: 'user' | 'admin';
    }

    interface Request {
      /**
       * Request ID for tracing (set by request logger middleware)
       */
      requestId?: string;
    }
  }
}

export {};
