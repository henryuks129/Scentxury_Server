/**
 * ============================================
 * WISHLIST SERVICE
 * ============================================
 *
 * Business logic for user wishlists:
 * - Add/remove products
 * - Get wishlist with populated product data
 * - Check if a product is wishlisted
 *
 * @file src/services/wishlist.service.ts
 */

import { Wishlist, IWishlist } from '@models/Wishlist.js';
import { Product } from '@models/Product.js';
import { NotFoundError, BadRequestError } from '@utils/errors.js';
import mongoose from 'mongoose';

// ============================================
// TYPES
// ============================================

export interface WishlistItem {
  productId: string;
  variantSku?: string;
}

// ============================================
// WISHLIST SERVICE
// ============================================

export class WishlistService {
  /**
   * Get user wishlist with populated product data
   */
  static async getWishlist(userId: string): Promise<IWishlist> {
    let wishlist = await Wishlist.findOne({
      userId: new mongoose.Types.ObjectId(userId),
    }).populate({
      path: 'items.productId',
      select: 'name slug images basePrice variants isActive',
    });

    if (!wishlist) {
      // Return empty wishlist (don't persist until first item is added)
      wishlist = new Wishlist({
        userId: new mongoose.Types.ObjectId(userId),
        items: [],
      });
    }

    return wishlist;
  }

  /**
   * Add a product to the wishlist.
   * Idempotent — adding the same productId twice is a no-op.
   */
  static async addToWishlist(userId: string, item: WishlistItem): Promise<IWishlist> {
    // Verify product exists
    const product = await Product.findOne({
      _id: new mongoose.Types.ObjectId(item.productId),
      isActive: true,
    });
    if (!product) {
      throw new NotFoundError('Product', 'RES_002');
    }

    // If variantSku provided, verify it exists on the product
    if (item.variantSku) {
      const variant = product.variants.find((v) => v.sku === item.variantSku);
      if (!variant) {
        throw new BadRequestError(`Variant ${item.variantSku} not found on product`, 'RES_002');
      }
    }

    const productObjectId = new mongoose.Types.ObjectId(item.productId);

    // Upsert: create wishlist doc if not exists, add item if not already present
    const wishlist = await Wishlist.findOneAndUpdate(
      {
        userId: new mongoose.Types.ObjectId(userId),
        'items.productId': { $ne: productObjectId },
      },
      {
        $setOnInsert: { userId: new mongoose.Types.ObjectId(userId) },
        $push: {
          items: {
            productId: productObjectId,
            variantSku: item.variantSku,
            addedAt: new Date(),
          },
        },
      },
      { upsert: true, new: true }
    ).populate({
      path: 'items.productId',
      select: 'name slug images basePrice variants isActive',
    });

    return wishlist!;
  }

  /**
   * Remove a product from the wishlist
   */
  static async removeFromWishlist(userId: string, productId: string): Promise<IWishlist> {
    const wishlist = await Wishlist.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      {
        $pull: {
          items: { productId: new mongoose.Types.ObjectId(productId) },
        },
      },
      { new: true }
    ).populate({
      path: 'items.productId',
      select: 'name slug images basePrice variants isActive',
    });

    if (!wishlist) {
      throw new NotFoundError('Wishlist', 'RES_004');
    }

    return wishlist;
  }

  /**
   * Clear the entire wishlist
   */
  static async clearWishlist(userId: string): Promise<void> {
    await Wishlist.updateOne(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $set: { items: [] } }
    );
  }

  /**
   * Check if a specific product is in the user's wishlist
   */
  static async isInWishlist(userId: string, productId: string): Promise<boolean> {
    const count = await Wishlist.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      'items.productId': new mongoose.Types.ObjectId(productId),
    });
    return count > 0;
  }
}

export default WishlistService;
