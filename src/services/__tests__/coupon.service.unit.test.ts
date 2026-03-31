/**
 * ============================================
 * COUPON SERVICE — UNIT TESTS
 * ============================================
 *
 * @file src/services/__tests__/coupon.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CouponService } from '../coupon.service.js';
import { Coupon } from '@models/Coupon.js';
import { BadRequestError, NotFoundError, ConflictError } from '@utils/errors.js';
import { Types } from 'mongoose';

vi.mock('@models/Coupon.js');

const userId = new Types.ObjectId().toString();
const adminId = new Types.ObjectId().toString();
const orderId = new Types.ObjectId().toString();

const makeActiveCoupon = (overrides = {}) => ({
  code: 'SAVE10',
  discountType: 'percentage',
  discountValue: 10,
  minOrderAmount: 0,
  maxUses: undefined,
  currentUses: 0,
  usedBy: [],
  perUserLimit: 1,
  isActive: true,
  startsAt: undefined,
  expiresAt: undefined,
  ...overrides,
});

describe('CouponService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // validateCoupon
  // ============================================================
  describe('validateCoupon', () => {
    it('should return discount amount for valid percentage coupon', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(makeActiveCoupon() as never);

      const result = await CouponService.validateCoupon('SAVE10', userId, 50000);

      expect(result.discountAmount).toBe(5000); // 10% of 50000
      expect(result.coupon.code).toBe('SAVE10');
    });

    it('should return discount amount for valid fixed coupon', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(
        makeActiveCoupon({ discountType: 'fixed', discountValue: 3000 }) as never
      );

      const result = await CouponService.validateCoupon('FIXED3K', userId, 50000);

      expect(result.discountAmount).toBe(3000);
    });

    it('should cap percentage discount at maxDiscountAmount', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(
        makeActiveCoupon({ discountValue: 50, maxDiscountAmount: 5000 }) as never
      );

      const result = await CouponService.validateCoupon('BIG50', userId, 50000);

      // 50% of 50000 = 25000, capped at 5000
      expect(result.discountAmount).toBe(5000);
    });

    it('should not exceed order subtotal', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(
        makeActiveCoupon({ discountType: 'fixed', discountValue: 100000 }) as never
      );

      const result = await CouponService.validateCoupon('HUGE', userId, 10000);

      expect(result.discountAmount).toBe(10000); // capped at subtotal
    });

    it('should throw NotFoundError for unknown code', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(null);

      await expect(
        CouponService.validateCoupon('NOTEXIST', userId, 50000)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError for inactive coupon', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(
        makeActiveCoupon({ isActive: false }) as never
      );

      await expect(
        CouponService.validateCoupon('SAVE10', userId, 50000)
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError for expired coupon', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(
        makeActiveCoupon({ expiresAt: new Date('2020-01-01') }) as never
      );

      await expect(
        CouponService.validateCoupon('OLD', userId, 50000)
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError for not-yet-active coupon', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(
        makeActiveCoupon({ startsAt: new Date('2099-01-01') }) as never
      );

      await expect(
        CouponService.validateCoupon('FUTURE', userId, 50000)
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if usage limit reached', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(
        makeActiveCoupon({ maxUses: 10, currentUses: 10 }) as never
      );

      await expect(
        CouponService.validateCoupon('USED', userId, 50000)
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if order below minimum', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(
        makeActiveCoupon({ minOrderAmount: 20000 }) as never
      );

      await expect(
        CouponService.validateCoupon('SAVE10', userId, 5000)
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if user exceeded per-user limit', async () => {
      const uid = new Types.ObjectId(userId);
      vi.mocked(Coupon.findOne).mockResolvedValue(
        makeActiveCoupon({
          perUserLimit: 1,
          usedBy: [{ userId: uid, orderId: new Types.ObjectId(), usedAt: new Date() }],
        }) as never
      );

      await expect(
        CouponService.validateCoupon('SAVE10', userId, 50000)
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ============================================================
  // applyCoupon
  // ============================================================
  describe('applyCoupon', () => {
    it('should call updateOne to increment usage and push to usedBy', async () => {
      vi.mocked(Coupon.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);

      await CouponService.applyCoupon('SAVE10', userId, orderId);

      expect(Coupon.updateOne).toHaveBeenCalledWith(
        { code: 'SAVE10' },
        expect.objectContaining({
          $inc: { currentUses: 1 },
          $push: expect.objectContaining({ usedBy: expect.any(Object) }),
        })
      );
    });
  });

  // ============================================================
  // createCoupon
  // ============================================================
  describe('createCoupon', () => {
    it('should create a coupon when code does not exist', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(null);
      vi.mocked(Coupon.create).mockResolvedValue({
        code: 'NEW20',
        discountType: 'percentage',
        discountValue: 20,
      } as never);

      const coupon = await CouponService.createCoupon(
        { code: 'NEW20', discountType: 'percentage', discountValue: 20 },
        adminId
      );

      expect(coupon.code).toBe('NEW20');
      expect(Coupon.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NEW20', discountValue: 20 })
      );
    });

    it('should uppercase the coupon code on creation', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(null);
      vi.mocked(Coupon.create).mockResolvedValue({ code: 'LOWERCASE' } as never);

      await CouponService.createCoupon(
        { code: 'lowercase', discountType: 'fixed', discountValue: 500 },
        adminId
      );

      expect(Coupon.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'LOWERCASE' })
      );
    });

    it('should throw ConflictError if code already exists', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(makeActiveCoupon() as never);

      await expect(
        CouponService.createCoupon(
          { code: 'SAVE10', discountType: 'percentage', discountValue: 10 },
          adminId
        )
      ).rejects.toThrow(ConflictError);
    });
  });

  // ============================================================
  // deactivateCoupon
  // ============================================================
  describe('deactivateCoupon', () => {
    it('should deactivate an existing coupon', async () => {
      const mockCoupon = makeActiveCoupon({ isActive: false });
      vi.mocked(Coupon.findOneAndUpdate).mockResolvedValue(mockCoupon as never);

      const result = await CouponService.deactivateCoupon('SAVE10');

      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundError for unknown coupon', async () => {
      vi.mocked(Coupon.findOneAndUpdate).mockResolvedValue(null);

      await expect(CouponService.deactivateCoupon('GHOST')).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================
  // getCouponByCode
  // ============================================================
  describe('getCouponByCode', () => {
    it('should return coupon for valid code', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(makeActiveCoupon() as never);

      const coupon = await CouponService.getCouponByCode('save10'); // lowercase input

      expect(coupon.code).toBe('SAVE10');
      expect(Coupon.findOne).toHaveBeenCalledWith({ code: 'SAVE10' });
    });

    it('should throw NotFoundError for unknown code', async () => {
      vi.mocked(Coupon.findOne).mockResolvedValue(null);

      await expect(CouponService.getCouponByCode('NOPE')).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================
  // getAllCoupons
  // ============================================================
  describe('getAllCoupons', () => {
    it('should return all coupons sorted by createdAt desc', async () => {
      const mockCoupons = [makeActiveCoupon(), makeActiveCoupon({ code: 'SAVE20' })];
      vi.mocked(Coupon.find).mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockCoupons),
        }),
      } as never);

      const result = await CouponService.getAllCoupons();

      expect(result).toHaveLength(2);
      expect(Coupon.find).toHaveBeenCalledWith({});
    });
  });
});
