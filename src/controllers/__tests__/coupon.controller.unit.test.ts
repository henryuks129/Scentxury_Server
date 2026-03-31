/**
 * ============================================
 * COUPON CONTROLLER — UNIT TESTS
 * ============================================
 *
 * @file src/controllers/__tests__/coupon.controller.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateCoupon,
  createCoupon,
  getAllCoupons,
  getCoupon,
  updateCoupon,
  deactivateCoupon,
} from '../coupon.controller.js';
import { CouponService } from '@services/coupon.service.js';
import { mockRequest, mockResponse } from '../../test/helpers.js';
import { Types } from 'mongoose';
import { BadRequestError, NotFoundError } from '@utils/errors.js';

vi.mock('@services/coupon.service.js');

const adminId = new Types.ObjectId().toString();

const makeCoupon = (overrides = {}) => ({
  code: 'SAVE10',
  discountType: 'percentage',
  discountValue: 10,
  isActive: true,
  ...overrides,
});

describe('CouponController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // validateCoupon
  // ============================================================
  describe('validateCoupon', () => {
    it('should return discount amount for valid coupon', async () => {
      vi.mocked(CouponService.validateCoupon).mockResolvedValue({
        coupon: makeCoupon() as never,
        discountAmount: 5000,
      });

      const req = mockRequest({
        body: { code: 'SAVE10', orderSubtotal: 50000 },
        user: { id: adminId, role: 'user' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await validateCoupon(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ discountAmount: 5000 }),
        })
      );
    });

    it('should call next with error for invalid coupon', async () => {
      vi.mocked(CouponService.validateCoupon).mockRejectedValue(
        new BadRequestError('Coupon expired')
      );

      const req = mockRequest({
        body: { code: 'OLD', orderSubtotal: 50000 },
        user: { id: adminId, role: 'user' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await validateCoupon(req as never, res as never, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Coupon expired' }));
    });
  });

  // ============================================================
  // createCoupon (admin)
  // ============================================================
  describe('createCoupon', () => {
    it('should create coupon and return 201', async () => {
      vi.mocked(CouponService.createCoupon).mockResolvedValue(makeCoupon() as never);

      const req = mockRequest({
        body: { code: 'NEW20', discountType: 'percentage', discountValue: 20 },
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await createCoupon(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // ============================================================
  // getAllCoupons (admin)
  // ============================================================
  describe('getAllCoupons', () => {
    it('should return list of all coupons', async () => {
      vi.mocked(CouponService.getAllCoupons).mockResolvedValue([
        makeCoupon() as never,
        makeCoupon({ code: 'SAVE20' }) as never,
      ]);

      const req = mockRequest({ user: { id: adminId, role: 'admin' } });
      const res = mockResponse();
      const next = vi.fn();

      await getAllCoupons(req as never, res as never, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ total: 2 }),
        })
      );
    });
  });

  // ============================================================
  // getCoupon (admin)
  // ============================================================
  describe('getCoupon', () => {
    it('should return coupon by code', async () => {
      vi.mocked(CouponService.getCouponByCode).mockResolvedValue(makeCoupon() as never);

      const req = mockRequest({
        params: { code: 'SAVE10' },
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await getCoupon(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should call next with NotFoundError for unknown coupon', async () => {
      vi.mocked(CouponService.getCouponByCode).mockRejectedValue(new NotFoundError('Coupon'));

      const req = mockRequest({
        params: { code: 'NOPE' },
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await getCoupon(req as never, res as never, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });

  // ============================================================
  // updateCoupon (admin)
  // ============================================================
  describe('updateCoupon', () => {
    it('should update coupon and return updated data', async () => {
      vi.mocked(CouponService.updateCoupon).mockResolvedValue(
        makeCoupon({ discountValue: 25 }) as never
      );

      const req = mockRequest({
        params: { code: 'SAVE10' },
        body: { discountValue: 25 },
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await updateCoupon(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(CouponService.updateCoupon).toHaveBeenCalledWith('SAVE10', { discountValue: 25 });
    });
  });

  // ============================================================
  // deactivateCoupon (admin)
  // ============================================================
  describe('deactivateCoupon', () => {
    it('should deactivate the coupon', async () => {
      vi.mocked(CouponService.deactivateCoupon).mockResolvedValue(
        makeCoupon({ isActive: false }) as never
      );

      const req = mockRequest({
        params: { code: 'SAVE10' },
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await deactivateCoupon(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
