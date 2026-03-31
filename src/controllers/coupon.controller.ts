/**
 * ============================================
 * COUPON CONTROLLER
 * ============================================
 *
 * Request handlers for coupon management:
 * - User: validate coupon before checkout
 * - Admin: CRUD for coupon codes
 *
 * @file src/controllers/coupon.controller.ts
 */

import { Request, Response, NextFunction } from 'express';
import { CouponService } from '@services/coupon.service.js';

// ============================================
// USER ENDPOINTS
// ============================================

/**
 * POST /api/v1/coupons/validate
 * Validate a coupon code against the current cart subtotal.
 * Does NOT consume the coupon — just returns the discount amount.
 */
export async function validateCoupon(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { code, orderSubtotal } = req.body as { code: string; orderSubtotal: number };
    const userId = req.user!.id;

    const result = await CouponService.validateCoupon(code, userId, orderSubtotal);

    res.status(200).json({
      success: true,
      message: 'Coupon is valid',
      data: {
        code: result.coupon.code,
        discountType: result.coupon.discountType,
        discountValue: result.coupon.discountValue,
        discountAmount: result.discountAmount,
        description: result.coupon.description,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * POST /api/v1/admin/coupons
 */
export async function createCoupon(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const coupon = await CouponService.createCoupon(req.body, req.user!.id);
    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: { coupon },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/coupons
 */
export async function getAllCoupons(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const coupons = await CouponService.getAllCoupons();
    res.status(200).json({
      success: true,
      message: 'Coupons retrieved successfully',
      data: { coupons, total: coupons.length },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/coupons/:code
 */
export async function getCoupon(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const coupon = await CouponService.getCouponByCode(String(req.params['code']));
    res.status(200).json({
      success: true,
      message: 'Coupon retrieved successfully',
      data: { coupon },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/coupons/:code
 */
export async function updateCoupon(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const coupon = await CouponService.updateCoupon(String(req.params['code']), req.body);
    res.status(200).json({
      success: true,
      message: 'Coupon updated successfully',
      data: { coupon },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/admin/coupons/:code
 */
export async function deactivateCoupon(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const coupon = await CouponService.deactivateCoupon(String(req.params['code']));
    res.status(200).json({
      success: true,
      message: 'Coupon deactivated successfully',
      data: { coupon },
    });
  } catch (error) {
    next(error);
  }
}
