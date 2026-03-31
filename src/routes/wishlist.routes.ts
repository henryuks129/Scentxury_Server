/**
 * ============================================
 * WISHLIST ROUTES
 * ============================================
 *
 * All routes require authentication.
 *
 *   GET    /api/v1/wishlist                   — get wishlist
 *   POST   /api/v1/wishlist/items             — add item
 *   DELETE /api/v1/wishlist/items/:productId  — remove item
 *   DELETE /api/v1/wishlist                   — clear wishlist
 *   GET    /api/v1/wishlist/check/:productId  — check wishlist status
 *
 * @file src/routes/wishlist.routes.ts
 */

import { Router } from 'express';
import { authenticate } from '@middleware/auth.middleware.js';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
  checkWishlistStatus,
} from '@controllers/wishlist.controller.js';

const router = Router();

// All wishlist routes require a logged-in user
router.use(authenticate);

router.get('/', getWishlist);
router.post('/items', addToWishlist);
router.get('/check/:productId', checkWishlistStatus);
router.delete('/items/:productId', removeFromWishlist);
router.delete('/', clearWishlist);

export default router;
