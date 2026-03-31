/**
 * ============================================
 * RECOMMENDATION CONTROLLER
 * ============================================
 *
 * HTTP handlers for the AI recommendation engine.
 *
 * Routes:
 *   GET  /api/v1/recommendations              — hybrid (public/optional auth)
 *   GET  /api/v1/recommendations/product/:id  — content-based (public)
 *   GET  /api/v1/recommendations/combo/:id    — combo mix (public)
 *   GET  /api/v1/recommendations/user         — user-based (auth required)
 *   GET  /api/v1/admin/customers/churn-risk   — admin only
 *   POST /api/v1/admin/customers/cluster      — admin only
 *
 * @file src/controllers/recommendation.controller.ts
 */

import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { RecommendationService } from '@services/recommendation.service.js';
import { BadRequestError, NotFoundError } from '@utils/errors.js';

// ============================================
// HYBRID RECOMMENDATIONS
// ============================================

/**
 * GET /api/v1/recommendations
 * Works for guests and authenticated users.
 * Query: ?productId=<id>&limit=<n>
 */
export async function getHybridRecommendations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    const productId = req.query.productId as string | undefined;
    const rawLimit = parseInt(String(req.query.limit ?? '10'), 10);
    const limit = Math.min(Math.max(rawLimit, 1), 20); // clamp 1–20

    const result = await RecommendationService.getHybridRecommendations({
      userId,
      currentProductId: productId,
      limit,
    });

    res.status(200).json({
      success: true,
      data: {
        products: result.products,
        source: result.source,
        count: result.products.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// CONTENT-BASED (PRODUCT-SIMILARITY)
// ============================================

/**
 * GET /api/v1/recommendations/product/:productId
 * Public — no auth required.
 */
export async function getProductRecommendations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const productId = String(req.params['productId'] ?? '');

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return next(new BadRequestError('Invalid productId — must be a valid MongoDB ObjectId'));
    }

    const products = await RecommendationService.getContentBasedRecommendations(productId, 10);

    res.status(200).json({
      success: true,
      data: { products, count: products.length },
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// COMBO MIX
// ============================================

/**
 * GET /api/v1/recommendations/combo/:productId
 * Returns fragrance layering suggestions.
 */
export async function getComboMix(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const productId = String(req.params['productId'] ?? '');

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return next(new BadRequestError('Invalid productId'));
    }

    const combos = await RecommendationService.getComboMixRecommendations(productId);

    if (combos.length === 0) {
      return next(new NotFoundError('Product or combo recommendations'));
    }

    res.status(200).json({
      success: true,
      data: { combos, count: combos.length },
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// USER-BASED (AUTH REQUIRED)
// ============================================

/**
 * GET /api/v1/recommendations/user
 * Requires authentication — uses stored scentPreferences.
 */
export async function getUserRecommendations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id; // guaranteed by authenticate middleware

    const products = await RecommendationService.getUserBasedRecommendations(userId, 10);

    res.status(200).json({
      success: true,
      data: { products, count: products.length },
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// ADMIN — CHURN RISK USERS
// ============================================

/**
 * GET /api/v1/admin/customers/churn-risk
 * Admin only — returns at_risk and churned user list.
 * Query: ?limit=<n>
 */
export async function getChurnRiskUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);

    const users = await RecommendationService.getChurnRiskUsers(limit);

    res.status(200).json({
      success: true,
      data: { users, count: users.length },
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// ADMIN — TRIGGER USER CLUSTERING
// ============================================

/**
 * POST /api/v1/admin/customers/cluster
 * Admin only — runs segmentation job on demand.
 */
export async function triggerUserClustering(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const segments = await RecommendationService.clusterUsersByBehaviour();

    res.status(200).json({
      success: true,
      message: 'User clustering completed',
      data: { segments },
    });
  } catch (err) {
    next(err);
  }
}
