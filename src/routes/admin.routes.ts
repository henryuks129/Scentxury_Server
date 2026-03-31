/**
 * ============================================
 * ADMIN ROUTES
 * ============================================
 *
 * /api/v1/admin/* — All routes require admin role.
 *
 * Dashboard:
 *   GET  /dashboard
 *
 * Analytics:
 *   GET  /analytics/sales
 *   GET  /analytics/inventory
 *   GET  /analytics/pnl
 *   GET  /analytics/chart
 *
 * Expenses:
 *   POST   /expenses
 *   GET    /expenses
 *   DELETE /expenses/:id
 *
 * Inventory Transactions:
 *   GET /inventory/transactions
 *
 * Daily Summaries:
 *   GET  /summaries
 *   POST /summaries/generate
 *
 * Coupons:
 *   GET    /coupons
 *   POST   /coupons
 *   GET    /coupons/:code
 *   PATCH  /coupons/:code
 *   DELETE /coupons/:code
 *
 * @file src/routes/admin.routes.ts
 */

import { Router } from 'express';
import { authenticate, adminOnly } from '@middleware/auth.middleware.js';
import {
  getDashboardStats,
  getSalesAnalytics,
  getInventoryReport,
  getPnLReport,
  getChartData,
  createExpense,
  getExpenses,
  deleteExpense,
  getInventoryTransactions,
  generateDailySummary,
  getDailySummaries,
} from '@controllers/admin.controller.js';
import {
  createCoupon,
  getAllCoupons,
  getCoupon,
  updateCoupon,
  deactivateCoupon,
} from '@controllers/coupon.controller.js';
import {
  getChurnRiskUsers,
  triggerUserClustering,
} from '@controllers/recommendation.controller.js';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate, adminOnly);

// ============================================
// DASHBOARD
// ============================================

router.get('/dashboard', getDashboardStats);

// ============================================
// ANALYTICS
// ============================================

router.get('/analytics/sales', getSalesAnalytics);
router.get('/analytics/inventory', getInventoryReport);
router.get('/analytics/pnl', getPnLReport);
router.get('/analytics/chart', getChartData);

// ============================================
// EXPENSES
// ============================================

router.post('/expenses', createExpense);
router.get('/expenses', getExpenses);
router.delete('/expenses/:id', deleteExpense);

// ============================================
// INVENTORY TRANSACTIONS
// ============================================

router.get('/inventory/transactions', getInventoryTransactions);

// ============================================
// DAILY SUMMARIES
// ============================================

router.get('/summaries', getDailySummaries);
router.post('/summaries/generate', generateDailySummary);

// ============================================
// COUPONS
// ============================================

router.get('/coupons', getAllCoupons);
router.post('/coupons', createCoupon);
router.get('/coupons/:code', getCoupon);
router.patch('/coupons/:code', updateCoupon);
router.delete('/coupons/:code', deactivateCoupon);

// ============================================
// CUSTOMER SEGMENTATION & CHURN (Day 6)
// ============================================

// GET  /customers/churn-risk — returns at_risk + churned users
router.get('/customers/churn-risk', getChurnRiskUsers);

// POST /customers/cluster — triggers user segmentation job on demand
router.post('/customers/cluster', triggerUserClustering);

export default router;
