/**
 * ============================================
 * WISHLIST SERVICE — UNIT TESTS
 * ============================================
 *
 * @file src/services/__tests__/wishlist.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WishlistService } from '../wishlist.service.js';
import { Wishlist } from '@models/Wishlist.js';
import { Product } from '@models/Product.js';
import { NotFoundError, BadRequestError } from '@utils/errors.js';
import { Types } from 'mongoose';

vi.mock('@models/Wishlist.js');
vi.mock('@models/Product.js');

const userId = new Types.ObjectId().toString();
const productId = new Types.ObjectId().toString();
const variantSku = 'OUD-50ML';

const makeProduct = () => ({
  _id: new Types.ObjectId(productId),
  name: 'Oud Wood',
  isActive: true,
  variants: [{ sku: variantSku, size: '50ml', priceNGN: 30000, priceUSD: 40, stock: 10 }],
});

const makeWishlist = (items = []) => ({
  userId: new Types.ObjectId(userId),
  items,
});

describe('WishlistService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // getWishlist
  // ============================================================
  describe('getWishlist', () => {
    it('should return existing wishlist with populated items', async () => {
      const mockWishlist = makeWishlist([{ productId: new Types.ObjectId(productId), addedAt: new Date() }]);
      vi.mocked(Wishlist.findOne).mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockWishlist),
      } as never);

      const wishlist = await WishlistService.getWishlist(userId);

      expect(wishlist.items).toHaveLength(1);
    });

    it('should return empty wishlist when none exists', async () => {
      vi.mocked(Wishlist.findOne).mockReturnValue({
        populate: vi.fn().mockResolvedValue(null),
      } as never);
      // When no wishlist exists, the service calls `new Wishlist({...})`.
      // The auto-mock doesn't include Mongoose document internals, so we
      // explicitly mock the constructor to return a plain object.
      vi.mocked(Wishlist).mockImplementation(() => ({
        userId: new Types.ObjectId(userId),
        items: [],
      }) as never);

      const wishlist = await WishlistService.getWishlist(userId);

      expect(wishlist.items).toHaveLength(0);
    });
  });

  // ============================================================
  // addToWishlist
  // ============================================================
  describe('addToWishlist', () => {
    it('should add a product to the wishlist', async () => {
      vi.mocked(Product.findOne).mockResolvedValue(makeProduct() as never);
      const mockWishlist = makeWishlist([{ productId: new Types.ObjectId(productId), addedAt: new Date() }]);
      vi.mocked(Wishlist.findOneAndUpdate).mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockWishlist),
      } as never);

      const wishlist = await WishlistService.addToWishlist(userId, { productId });

      expect(wishlist.items).toHaveLength(1);
      expect(Wishlist.findOneAndUpdate).toHaveBeenCalled();
    });

    it('should throw NotFoundError for inactive/non-existent product', async () => {
      vi.mocked(Product.findOne).mockResolvedValue(null);

      await expect(
        WishlistService.addToWishlist(userId, { productId })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError for invalid variantSku', async () => {
      vi.mocked(Product.findOne).mockResolvedValue(makeProduct() as never);

      await expect(
        WishlistService.addToWishlist(userId, { productId, variantSku: 'BAD-SKU' })
      ).rejects.toThrow(BadRequestError);
    });

    it('should accept valid variantSku', async () => {
      vi.mocked(Product.findOne).mockResolvedValue(makeProduct() as never);
      vi.mocked(Wishlist.findOneAndUpdate).mockReturnValue({
        populate: vi.fn().mockResolvedValue(makeWishlist([{ productId: new Types.ObjectId(productId), variantSku, addedAt: new Date() }])),
      } as never);

      const wishlist = await WishlistService.addToWishlist(userId, { productId, variantSku });

      expect(wishlist.items[0]).toMatchObject(expect.objectContaining({ variantSku }));
    });
  });

  // ============================================================
  // removeFromWishlist
  // ============================================================
  describe('removeFromWishlist', () => {
    it('should remove a product from the wishlist', async () => {
      const mockWishlist = makeWishlist([]);
      vi.mocked(Wishlist.findOneAndUpdate).mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockWishlist),
      } as never);

      const wishlist = await WishlistService.removeFromWishlist(userId, productId);

      expect(wishlist.items).toHaveLength(0);
    });

    it('should throw NotFoundError if wishlist does not exist', async () => {
      vi.mocked(Wishlist.findOneAndUpdate).mockReturnValue({
        populate: vi.fn().mockResolvedValue(null),
      } as never);

      await expect(
        WishlistService.removeFromWishlist(userId, productId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================
  // clearWishlist
  // ============================================================
  describe('clearWishlist', () => {
    it('should clear all items', async () => {
      vi.mocked(Wishlist.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);

      await WishlistService.clearWishlist(userId);

      expect(Wishlist.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ userId: expect.any(Object) }),
        { $set: { items: [] } }
      );
    });
  });

  // ============================================================
  // isInWishlist
  // ============================================================
  describe('isInWishlist', () => {
    it('should return true if product is in wishlist', async () => {
      vi.mocked(Wishlist.countDocuments).mockResolvedValue(1 as never);

      const result = await WishlistService.isInWishlist(userId, productId);

      expect(result).toBe(true);
    });

    it('should return false if product is not in wishlist', async () => {
      vi.mocked(Wishlist.countDocuments).mockResolvedValue(0 as never);

      const result = await WishlistService.isInWishlist(userId, productId);

      expect(result).toBe(false);
    });
  });
});
