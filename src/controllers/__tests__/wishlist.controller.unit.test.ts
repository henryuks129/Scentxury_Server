/**
 * ============================================
 * WISHLIST CONTROLLER — UNIT TESTS
 * ============================================
 *
 * @file src/controllers/__tests__/wishlist.controller.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
  checkWishlistStatus,
} from '../wishlist.controller.js';
import { WishlistService } from '@services/wishlist.service.js';
import { mockRequest, mockResponse } from '../../test/helpers.js';
import { Types } from 'mongoose';
import { NotFoundError } from '@utils/errors.js';

vi.mock('@services/wishlist.service.js');

const userId = new Types.ObjectId().toString();
const productId = new Types.ObjectId().toString();

const makeWishlist = (itemCount = 0) => ({
  userId: new Types.ObjectId(userId),
  items: Array(itemCount)
    .fill(null)
    .map(() => ({ productId: new Types.ObjectId(), addedAt: new Date() })),
});

describe('WishlistController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // getWishlist
  // ============================================================
  describe('getWishlist', () => {
    it('should return user wishlist with item count', async () => {
      vi.mocked(WishlistService.getWishlist).mockResolvedValue(makeWishlist(3) as never);

      const req = mockRequest({ user: { id: userId, role: 'user' } });
      const res = mockResponse();
      const next = vi.fn();

      await getWishlist(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ total: 3 }),
        })
      );
    });

    it('should return empty wishlist', async () => {
      vi.mocked(WishlistService.getWishlist).mockResolvedValue(makeWishlist(0) as never);

      const req = mockRequest({ user: { id: userId, role: 'user' } });
      const res = mockResponse();
      const next = vi.fn();

      await getWishlist(req as never, res as never, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 0 }) })
      );
    });
  });

  // ============================================================
  // addToWishlist
  // ============================================================
  describe('addToWishlist', () => {
    it('should add item and return updated wishlist', async () => {
      vi.mocked(WishlistService.addToWishlist).mockResolvedValue(makeWishlist(1) as never);

      const req = mockRequest({
        body: { productId },
        user: { id: userId, role: 'user' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await addToWishlist(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(WishlistService.addToWishlist).toHaveBeenCalledWith(
        userId,
        { productId, variantSku: undefined }
      );
    });

    it('should add item with variantSku', async () => {
      vi.mocked(WishlistService.addToWishlist).mockResolvedValue(makeWishlist(1) as never);

      const req = mockRequest({
        body: { productId, variantSku: 'OUD-50ML' },
        user: { id: userId, role: 'user' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await addToWishlist(req as never, res as never, next);

      expect(WishlistService.addToWishlist).toHaveBeenCalledWith(
        userId,
        { productId, variantSku: 'OUD-50ML' }
      );
    });

    it('should call next with error if product not found', async () => {
      vi.mocked(WishlistService.addToWishlist).mockRejectedValue(new NotFoundError('Product'));

      const req = mockRequest({
        body: { productId: 'invalid' },
        user: { id: userId, role: 'user' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await addToWishlist(req as never, res as never, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });

  // ============================================================
  // removeFromWishlist
  // ============================================================
  describe('removeFromWishlist', () => {
    it('should remove item and return updated wishlist', async () => {
      vi.mocked(WishlistService.removeFromWishlist).mockResolvedValue(makeWishlist(0) as never);

      const req = mockRequest({
        params: { productId },
        user: { id: userId, role: 'user' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await removeFromWishlist(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 0 }) })
      );
    });
  });

  // ============================================================
  // clearWishlist
  // ============================================================
  describe('clearWishlist', () => {
    it('should clear wishlist and return empty state', async () => {
      vi.mocked(WishlistService.clearWishlist).mockResolvedValue(undefined);

      const req = mockRequest({ user: { id: userId, role: 'user' } });
      const res = mockResponse();
      const next = vi.fn();

      await clearWishlist(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { items: [], total: 0 } })
      );
    });
  });

  // ============================================================
  // checkWishlistStatus
  // ============================================================
  describe('checkWishlistStatus', () => {
    it('should return isWishlisted: true when in wishlist', async () => {
      vi.mocked(WishlistService.isInWishlist).mockResolvedValue(true);

      const req = mockRequest({
        params: { productId },
        user: { id: userId, role: 'user' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await checkWishlistStatus(req as never, res as never, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isWishlisted: true } })
      );
    });

    it('should return isWishlisted: false when not in wishlist', async () => {
      vi.mocked(WishlistService.isInWishlist).mockResolvedValue(false);

      const req = mockRequest({
        params: { productId },
        user: { id: userId, role: 'user' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await checkWishlistStatus(req as never, res as never, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isWishlisted: false } })
      );
    });
  });
});
