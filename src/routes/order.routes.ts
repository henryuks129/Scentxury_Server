/**
 * ============================================
 * ORDER ROUTES
 * ============================================
 *
 * Order lifecycle endpoints.
 * All routes require authentication.
 * Admin routes additionally require admin role.
 *
 * Mounted at: /api/v1/orders
 *
 * @file src/routes/order.routes.ts
 */

import { Router } from 'express';
import {
  createOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
  getAdminOrders,
  updateOrderStatus,
} from '@controllers/order.controller.js';
import { authenticate, adminOnly } from '@middleware/auth.middleware.js';
import { validate } from '@middleware/validate.middleware.js';
import {
  CreateOrderSchema,
  UpdateOrderStatusSchema,
  CancelOrderSchema,
} from '@validators/order.validator.js';

const router = Router();

// All order routes require auth
router.use(authenticate);

// ============================================
// ORDER ROUTES (authenticated users)
// ============================================

// POST /api/v1/orders — create order
router.post('/', validate(CreateOrderSchema), createOrder);

// GET /api/v1/orders — user's orders (must be before /:orderNumber)
router.get('/', getMyOrders);

// GET /api/v1/orders/admin — admin: all orders (must be before /:orderNumber)
router.get('/admin', adminOnly, getAdminOrders);

// GET /api/v1/orders/:orderNumber — single order (user gets own, admin gets any)
router.get('/:orderNumber', getOrder);

// POST /api/v1/orders/:orderNumber/cancel — cancel order
router.post('/:orderNumber/cancel', validate(CancelOrderSchema), cancelOrder);

// PATCH /api/v1/orders/:orderNumber/status — admin: update status
router.patch('/:orderNumber/status', adminOnly, validate(UpdateOrderStatusSchema), updateOrderStatus);

export default router;
