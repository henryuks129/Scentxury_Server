/**
 * ============================================
 * COUPON ROUTES
 * ============================================
 *
 * Public (authenticated user):
 *   POST /api/v1/coupons/validate  — validate code before checkout
 *
 * Admin only:
 *   GET    /api/v1/admin/coupons        — list all coupons
 *   POST   /api/v1/admin/coupons        — create coupon
 *   GET    /api/v1/admin/coupons/:code  — get single coupon
 *   PATCH  /api/v1/admin/coupons/:code  — update coupon
 *   DELETE /api/v1/admin/coupons/:code  — deactivate coupon
 *
 * Note: admin endpoints are mounted inside admin.routes.ts.
 * This file exports the user-facing coupon router only.
 *
 * @file src/routes/coupon.routes.ts
 */

import { Router } from 'express';
import { authenticate } from '@middleware/auth.middleware.js';
import { validateCoupon } from '@controllers/coupon.controller.js';

const router = Router();

// User: validate coupon (auth required — we need userId for per-user limit check)
router.post('/validate', authenticate, validateCoupon);

export default router;
