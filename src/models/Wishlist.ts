/**
 * ============================================
 * WISHLIST MODEL
 * ============================================
 *
 * Per-user wishlist stored in MongoDB.
 * One document per user, with an array of saved products.
 *
 * @file src/models/Wishlist.ts
 */

import mongoose, { Schema, Document } from 'mongoose';

// ============================================
// INTERFACES
// ============================================

export interface IWishlistItem {
  productId: mongoose.Types.ObjectId;
  variantSku?: string;
  addedAt: Date;
}

export interface IWishlist extends Document {
  userId: mongoose.Types.ObjectId;
  items: IWishlistItem[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// SCHEMA
// ============================================

const WishlistItemSchema = new Schema<IWishlistItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID is required'],
    },
    variantSku: {
      type: String,
      trim: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const WishlistSchema = new Schema<IWishlist>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
      index: true,
    },
    items: {
      type: [WishlistItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// Index for fast product lookups within a wishlist
WishlistSchema.index({ userId: 1, 'items.productId': 1 });

// ============================================
// EXPORT
// ============================================

export const Wishlist: mongoose.Model<IWishlist> =
  (mongoose.models['Wishlist'] as mongoose.Model<IWishlist>) ||
  mongoose.model<IWishlist>('Wishlist', WishlistSchema);
export default Wishlist;
