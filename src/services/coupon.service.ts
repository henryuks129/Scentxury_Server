/**
 * ============================================
 * COUPON SERVICE
 * ============================================
 *
 * Business logic for coupon/discount management:
 * - Validate and calculate discount amount
 * - Track coupon usage per user and order
 * - Admin CRUD for coupons
 *
 * @file src/services/coupon.service.ts
 */

import { Coupon, ICoupon, ICouponUsage } from '@models/Coupon.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from '@utils/errors.js';
import mongoose from 'mongoose';

// ============================================
// TYPES
// ============================================

export interface CouponValidationResult {
  coupon: ICoupon;
  discountAmount: number; // Absolute NGN discount to apply
}

export interface CreateCouponData {
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  maxUses?: number;
  perUserLimit?: number;
  startsAt?: Date;
  expiresAt?: Date;
}

// ============================================
// COUPON SERVICE
// ============================================

export class CouponService {
  /**
   * Validate a coupon and return the discount amount.
   * Does NOT mark as used — call applyCoupon after order is created.
   */
  static async validateCoupon(
    code: string,
    userId: string,
    orderSubtotal: number
  ): Promise<CouponValidationResult> {
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon) {
      throw new NotFoundError('Coupon', 'CPN_001');
    }

    if (!coupon.isActive) {
      throw new BadRequestError('Coupon is no longer active', 'CPN_002');
    }

    const now = new Date();
    if (coupon.startsAt && now < coupon.startsAt) {
      throw new BadRequestError('Coupon is not yet valid', 'CPN_003');
    }
    if (coupon.expiresAt && now > coupon.expiresAt) {
      throw new BadRequestError('Coupon has expired', 'CPN_004');
    }

    if (coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.currentUses >= coupon.maxUses) {
      throw new BadRequestError('Coupon usage limit reached', 'CPN_005');
    }

    if (orderSubtotal < coupon.minOrderAmount) {
      throw new BadRequestError(
        `Minimum order amount for this coupon is ₦${coupon.minOrderAmount.toLocaleString()}`,
        'CPN_006'
      );
    }

    // Check per-user usage
    const userUses = coupon.usedBy.filter(
      (u: ICouponUsage) => u.userId.toString() === userId
    ).length;
    if (userUses >= coupon.perUserLimit) {
      throw new BadRequestError(
        `You have already used this coupon the maximum number of times`,
        'CPN_007'
      );
    }

    // Calculate discount
    let discountAmount: number;
    if (coupon.discountType === 'percentage') {
      discountAmount = (orderSubtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount !== null && coupon.maxDiscountAmount !== undefined) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
      }
    } else {
      discountAmount = coupon.discountValue;
    }

    // Discount cannot exceed the order subtotal
    discountAmount = Math.min(discountAmount, orderSubtotal);

    return { coupon, discountAmount };
  }

  /**
   * Mark a coupon as used by a user for a given order.
   * Call this AFTER the order has been created successfully.
   */
  static async applyCoupon(
    code: string,
    userId: string,
    orderId: string
  ): Promise<void> {
    await Coupon.updateOne(
      { code: code.toUpperCase() },
      {
        $inc: { currentUses: 1 },
        $push: {
          usedBy: {
            userId: new mongoose.Types.ObjectId(userId),
            orderId: new mongoose.Types.ObjectId(orderId),
            usedAt: new Date(),
          },
        },
      }
    );
  }

  /**
   * Admin: Create a new coupon
   */
  static async createCoupon(
    data: CreateCouponData,
    adminId: string
  ): Promise<ICoupon> {
    const existing = await Coupon.findOne({ code: data.code.toUpperCase() });
    if (existing) {
      throw new ConflictError(`Coupon code "${data.code}" already exists`, 'CPN_008');
    }

    const coupon = await Coupon.create({
      ...data,
      code: data.code.toUpperCase(),
      createdBy: new mongoose.Types.ObjectId(adminId),
    });

    return coupon;
  }

  /**
   * Admin: Get all active coupons
   */
  static async getActiveCoupons(): Promise<ICoupon[]> {
    return Coupon.find({ isActive: true }).sort({ createdAt: -1 }).lean() as unknown as ICoupon[];
  }

  /**
   * Admin: Get all coupons (active and inactive)
   */
  static async getAllCoupons(): Promise<ICoupon[]> {
    return Coupon.find({}).sort({ createdAt: -1 }).lean() as unknown as ICoupon[];
  }

  /**
   * Admin: Get coupon by code
   */
  static async getCouponByCode(code: string): Promise<ICoupon> {
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (!coupon) {
      throw new NotFoundError('Coupon', 'CPN_001');
    }
    return coupon;
  }

  /**
   * Admin: Deactivate a coupon
   */
  static async deactivateCoupon(code: string): Promise<ICoupon> {
    const coupon = await Coupon.findOneAndUpdate(
      { code: code.toUpperCase() },
      { isActive: false },
      { new: true }
    );

    if (!coupon) {
      throw new NotFoundError('Coupon', 'CPN_001');
    }

    return coupon;
  }

  /**
   * Admin: Update a coupon (non-critical fields only)
   */
  static async updateCoupon(
    code: string,
    updates: Partial<CreateCouponData>
  ): Promise<ICoupon> {
    const coupon = await Coupon.findOneAndUpdate(
      { code: code.toUpperCase() },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!coupon) {
      throw new NotFoundError('Coupon', 'CPN_001');
    }

    return coupon;
  }
}

export default CouponService;
