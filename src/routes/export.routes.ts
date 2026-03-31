/**
 * ============================================
 * EXPORT ROUTES
 * ============================================
 *
 * /api/v1/admin/export/*  — all routes require admin role
 *
 * POST /orders    — export orders to Google Sheets
 * POST /customers — export customers to Google Sheets
 * POST /pnl       — export P&L report to Google Sheets
 *
 * @file src/routes/export.routes.ts
 */

import { Router } from 'express';
import { authenticate, adminOnly } from '@middleware/auth.middleware.js';
import {
  exportOrdersToSheets,
  exportCustomersToSheets,
  exportPnLToSheets,
} from '@controllers/export.controller.js';

const router = Router();

// All export routes require admin authentication
router.use(authenticate, adminOnly);

// Export date-range orders to Sheets
router.post('/orders', exportOrdersToSheets);

// Export all customer accounts to Sheets
router.post('/customers', exportCustomersToSheets);

// Export monthly P&L to Sheets
router.post('/pnl', exportPnLToSheets);

export default router;
