/**
 * ============================================
 * COUPON MODEL
 * ============================================
 *
 * Discount coupons for checkout:
 * - Percentage or fixed-amount discounts
 * - Usage limits (global + per-user)
 * - Min order threshold
 * - Expiry window (startsAt / expiresAt)
 *
 * @file src/models/Coupon.ts
 */

import mongoose, { Schema, Document } from 'mongoose';

// ============================================
// INTERFACES
// ============================================

export type DiscountType = 'percentage' | 'fixed';

export interface ICouponUsage {
  userId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  usedAt: Date;
}

export interface ICoupon extends Document {
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;       // % (0–100) or fixed NGN amount
  minOrderAmount: number;      // minimum subtotal to apply coupon
  maxDiscountAmount?: number;  // cap for percentage discounts (NGN)
  maxUses?: number;            // total usage cap (undefined = unlimited)
  currentUses: number;
  usedBy: ICouponUsage[];
  perUserLimit: number;        // how many times one user can use it
  isActive: boolean;
  startsAt?: Date;
  expiresAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// SCHEMA
// ============================================

const CouponUsageSchema = new Schema<ICouponUsage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    usedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CouponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [50, 'Code cannot exceed 50 characters'],
      match: [/^[A-Z0-9_-]+$/, 'Code must contain only uppercase letters, digits, _ or -'],
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, 'Description cannot exceed 300 characters'],
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: [true, 'Discount type is required'],
    },
    discountValue: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: [0, 'Discount value cannot be negative'],
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      min: [0, 'Min order amount cannot be negative'],
    },
    maxDiscountAmount: {
      type: Number,
      min: [0, 'Max discount amount cannot be negative'],
    },
    maxUses: {
      type: Number,
      min: [1, 'Max uses must be at least 1'],
    },
    currentUses: {
      type: Number,
      default: 0,
      min: 0,
    },
    usedBy: [CouponUsageSchema],
    perUserLimit: {
      type: Number,
      default: 1,
      min: [1, 'Per-user limit must be at least 1'],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    startsAt: Date,
    expiresAt: {
      type: Date,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'createdBy is required'],
    },
  },
  { timestamps: true }
);

// Validate percentage is within 0–100
CouponSchema.pre('save', function () {
  if (this.discountType === 'percentage' && this.discountValue > 100) {
    throw new Error('Percentage discount cannot exceed 100%');
  }
});

// ============================================
// EXPORT
// ============================================

export const Coupon: mongoose.Model<ICoupon> =
  (mongoose.models['Coupon'] as mongoose.Model<ICoupon>) ||
  mongoose.model<ICoupon>('Coupon', CouponSchema);
export default Coupon;
