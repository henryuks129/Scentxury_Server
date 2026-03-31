/**
 * ============================================
 * WISHLIST CONTROLLER
 * ============================================
 *
 * Request handlers for user wishlist management.
 *
 * @file src/controllers/wishlist.controller.ts
 */

import { Request, Response, NextFunction } from 'express';
import { WishlistService } from '@services/wishlist.service.js';

/**
 * GET /api/v1/wishlist
 */
export async function getWishlist(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const wishlist = await WishlistService.getWishlist(req.user!.id);
    res.status(200).json({
      success: true,
      message: 'Wishlist retrieved successfully',
      data: {
        items: wishlist.items,
        total: wishlist.items.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/wishlist/items
 */
export async function addToWishlist(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { productId, variantSku } = req.body as { productId: string; variantSku?: string };
    const wishlist = await WishlistService.addToWishlist(req.user!.id, { productId, variantSku });
    res.status(200).json({
      success: true,
      message: 'Item added to wishlist',
      data: {
        items: wishlist.items,
        total: wishlist.items.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/wishlist/items/:productId
 */
export async function removeFromWishlist(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const wishlist = await WishlistService.removeFromWishlist(req.user!.id, String(req.params['productId']));
    res.status(200).json({
      success: true,
      message: 'Item removed from wishlist',
      data: {
        items: wishlist.items,
        total: wishlist.items.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/wishlist
 */
export async function clearWishlist(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await WishlistService.clearWishlist(req.user!.id);
    res.status(200).json({
      success: true,
      message: 'Wishlist cleared',
      data: { items: [], total: 0 },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/wishlist/check/:productId
 */
export async function checkWishlistStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isWishlisted = await WishlistService.isInWishlist(req.user!.id, String(req.params['productId']));
    res.status(200).json({
      success: true,
      data: { isWishlisted },
    });
  } catch (error) {
    next(error);
  }
}
