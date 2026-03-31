/**
 * ============================================
 * PRODUCT ROUTES
 * ============================================
 *
 * Public routes: GET product(s), search, featured
 * Admin routes: POST, PATCH, DELETE, stock update
 *
 * @file src/routes/product.routes.ts
 */

import { Router } from 'express';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  getFeaturedProducts,
  updateStock,
  getProductsByCategory,
} from '@controllers/product.controller.js';
import { authenticate, adminOnly } from '@middleware/auth.middleware.js';
import { validate } from '@middleware/validate.middleware.js';
import {
  CreateProductSchema,
  UpdateProductSchema,
  UpdateStockSchema,
} from '@validators/product.validator.js';

const router = Router();

// ============================================
// PUBLIC ROUTES
// ============================================

// GET /api/v1/products — list with filters & pagination
router.get('/', getProducts);

// GET /api/v1/products/search?q=oud — text search (must be before /:slug)
router.get('/search', searchProducts);

// GET /api/v1/products/featured — featured & new arrivals
router.get('/featured', getFeaturedProducts);

// GET /api/v1/products/category/:category
router.get('/category/:category', getProductsByCategory);

// GET /api/v1/products/:slug — single product
router.get('/:slug', getProduct);

// ============================================
// ADMIN ROUTES (auth + admin required)
// ============================================

// POST /api/v1/products — create
router.post('/', authenticate, adminOnly, validate(CreateProductSchema), createProduct);

// PATCH /api/v1/products/:id/stock — stock management (must be before /:slug to avoid collision)
router.patch('/:id/stock', authenticate, adminOnly, validate(UpdateStockSchema), updateStock);

// PATCH /api/v1/products/:slug — update
router.patch('/:slug', authenticate, adminOnly, validate(UpdateProductSchema), updateProduct);

// DELETE /api/v1/products/:slug — soft delete
router.delete('/:slug', authenticate, adminOnly, deleteProduct);

export default router;
