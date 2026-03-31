/**
 * ============================================
 * CART ROUTES
 * ============================================
 *
 * Redis-backed cart endpoints.
 * All routes require authentication.
 *
 * Mounted at: /api/v1/cart
 *
 * @file src/routes/cart.routes.ts
 */

import { Router } from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  validateCart,
  mergeGuestCart,
} from '@controllers/order.controller.js';
import { authenticate } from '@middleware/auth.middleware.js';
import { validate } from '@middleware/validate.middleware.js';
import { z } from 'zod';

// Inline Zod schemas for cart operations (lightweight, cart-specific)
const AddToCartSchema = z.object({
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid product ID'),
  variantSku: z.string().min(1, 'Variant SKU is required').regex(/^[A-Z0-9-]+$/, 'Invalid SKU format'),
  quantity: z.number().int().positive('Quantity must be at least 1').default(1),
});

const UpdateCartItemSchema = z.object({
  quantity: z.number().int().min(0, 'Quantity cannot be negative'),
});

const MergeGuestCartSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid product ID'),
      variantSku: z.string().min(1),
      quantity: z.number().int().positive(),
    })
  ).min(1, 'items must be a non-empty array'),
});

const router = Router();

// All cart routes require auth
router.use(authenticate);

// GET  /api/v1/cart             — get cart summary
router.get('/', getCart);

// POST /api/v1/cart/items       — add item to cart
router.post('/items', validate(AddToCartSchema), addToCart);

// PATCH /api/v1/cart/items/:sku — update item quantity
router.patch('/items/:sku', validate(UpdateCartItemSchema), updateCartItem);

// DELETE /api/v1/cart/items/:sku — remove single item
router.delete('/items/:sku', removeCartItem);

// DELETE /api/v1/cart           — clear entire cart
router.delete('/', clearCart);

// POST /api/v1/cart/validate    — validate before checkout
router.post('/validate', validateCart);

// POST /api/v1/cart/merge       — merge guest (localStorage) cart after login
router.post('/merge', validate(MergeGuestCartSchema), mergeGuestCart);

export default router;
