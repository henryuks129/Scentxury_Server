/**
 * ============================================
 * RECOMMENDATION ROUTES
 * ============================================
 *
 * /api/v1/recommendations/*
 *
 * GET  /                   — hybrid recommendations (public / optional auth)
 * GET  /product/:productId — content-based similar products (public)
 * GET  /combo/:productId   — fragrance layering suggestions (public)
 * GET  /user               — user-preference based (auth required)
 *
 * Admin churn endpoints are mounted on /api/v1/admin:
 *   GET  /customers/churn-risk   — at-risk users
 *   POST /customers/cluster      — trigger segmentation
 *
 * @file src/routes/recommendation.routes.ts
 */

import { Router } from 'express';
import { authenticate, optionalAuth } from '@middleware/auth.middleware.js';
import {
  getHybridRecommendations,
  getProductRecommendations,
  getComboMix,
  getUserRecommendations,
} from '@controllers/recommendation.controller.js';

const router = Router();

// Public — optionally enriched when user is authenticated
router.get('/', optionalAuth, getHybridRecommendations);

// Public — products with similar scent profiles
router.get('/product/:productId', getProductRecommendations);

// Public — fragrance layering suggestions
router.get('/combo/:productId', getComboMix);

// Auth required — personalised to user's stored scent preferences
router.get('/user', authenticate, getUserRecommendations);

export default router;
