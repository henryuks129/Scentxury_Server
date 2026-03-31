/**
 * ============================================
 * CART SERVICE — UNIT TESTS
 * ============================================
 *
 * Tests CartService logic.
 * Redis is mocked to avoid requiring a live Redis instance.
 *
 * @file src/services/__tests__/cart.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CartService } from '../cart.service.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';

// ============================================
// MOCKS
// ============================================

// Mock Redis client
vi.mock('../../config/redis.js', () => ({
  redisClient: {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
  },
}));

// Mock Product model
vi.mock('../../models/Product.js', () => ({
  Product: {
    findOne: vi.fn(),
  },
}));

import { redisClient } from '../../config/redis.js';
import { Product } from '../../models/Product.js';

// ============================================
// FIXTURES
// ============================================

const userId = 'user123';
const productId = '64a1b2c3d4e5f6a7b8c9d0e1';
const variantSku = 'OUD-20ML';

const mockVariant = {
  sku: variantSku,
  size: '20ml',
  priceNGN: 15000,
  priceUSD: 20,
  costPrice: 7500,
  stock: 50,
  isAvailable: true,
};

const mockProduct = {
  _id: { toString: () => productId },
  name: 'Oud Wood',
  images: { thumbnail: 'http://thumb.jpg' },
  variants: [mockVariant],
};

const emptyCartJson = JSON.stringify({
  userId,
  items: [],
  updatedAt: new Date().toISOString(),
});

const cartWithItem = {
  userId,
  items: [
    {
      productId,
      productName: 'Oud Wood',
      variantSku,
      variantSize: '20ml',
      quantity: 2,
      priceNGN: 15000,
      priceUSD: 20,
      thumbnail: 'http://thumb.jpg',
      addedAt: new Date().toISOString(),
    },
  ],
  updatedAt: new Date().toISOString(),
};

// ============================================
// TESTS
// ============================================

// Tests CartService business logic with mocked Redis and Product model.
// The cart is stored as a JSON blob in Redis with a 7-day TTL.
// Cart item prices are stored at time of add; validateCartItems() refreshes them at checkout.
describe('CartService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // GET CART
  // ============================================
  // getCart: loads the cart JSON from Redis; returns empty cart if key not found
  describe('getCart', () => {
    // No Redis key: first visit or expired cart → empty cart returned (not an error)
    it('should return empty cart when no Redis entry', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(null);

      const cart = await CartService.getCart(userId);

      expect(cart.userId).toBe(userId);
      expect(cart.items).toHaveLength(0);
    });

    // Existing cart: Redis JSON is deserialised and returned intact
    it('should return existing cart from Redis', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(JSON.stringify(cartWithItem));

      const cart = await CartService.getCart(userId);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]!.variantSku).toBe(variantSku);
    });
  });

  // ============================================
  // ADD TO CART
  // ============================================
  // addToCart: resolves product from DB, validates availability+stock,
  // then adds to or increments existing item in Redis cart.
  describe('addToCart', () => {
    // Happy path: item added to empty cart, Redis setex called to persist
    it('should add a new item to an empty cart', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(emptyCartJson);
      vi.mocked(redisClient.setex).mockResolvedValue('OK');
      vi.mocked(Product.findOne).mockResolvedValue(mockProduct as any);

      const cart = await CartService.addToCart(userId, productId, variantSku, 1);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]!.variantSku).toBe(variantSku);
      expect(cart.items[0]!.quantity).toBe(1);
      expect(redisClient.setex).toHaveBeenCalled();
    });

    // Duplicate SKU: re-adding same SKU should increment, not create a second entry
    it('should increment quantity for existing item', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(JSON.stringify(cartWithItem));
      vi.mocked(redisClient.setex).mockResolvedValue('OK');
      vi.mocked(Product.findOne).mockResolvedValue(mockProduct as any);

      const cart = await CartService.addToCart(userId, productId, variantSku, 1);

      // Was 2, added 1 = 3
      expect(cart.items[0]!.quantity).toBe(3);
    });

    // Validation: quantity 0 or negative must be rejected before any DB/Redis call
    it('should throw BadRequestError when quantity < 1', async () => {
      await expect(
        CartService.addToCart(userId, productId, variantSku, 0)
      ).rejects.toThrow(BadRequestError);
    });

    // DB miss: product not found in MongoDB → NotFoundError (→ 404)
    it('should throw NotFoundError when product not found', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(emptyCartJson);
      vi.mocked(Product.findOne).mockResolvedValue(null);

      await expect(
        CartService.addToCart(userId, 'non-existent', variantSku, 1)
      ).rejects.toThrow(NotFoundError);
    });

    // Variant miss: product found but SKU not in variants array → NotFoundError
    it('should throw NotFoundError when variant not found', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(emptyCartJson);
      vi.mocked(Product.findOne).mockResolvedValue({
        ...mockProduct,
        variants: [],
      } as any);

      await expect(
        CartService.addToCart(userId, productId, 'BAD-SKU', 1)
      ).rejects.toThrow(NotFoundError);
    });

    // Stock check: adding more than available stock → BadRequestError (→ 400)
    it('should throw BadRequestError when stock is insufficient', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(emptyCartJson);
      vi.mocked(Product.findOne).mockResolvedValue({
        ...mockProduct,
        variants: [{ ...mockVariant, stock: 1 }],
      } as any);

      // Trying to add 5 when only 1 in stock
      await expect(
        CartService.addToCart(userId, productId, variantSku, 5)
      ).rejects.toThrow(BadRequestError);
    });

    // Availability flag: isAvailable:false must block add even if stock > 0
    it('should throw BadRequestError when variant is unavailable', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(emptyCartJson);
      vi.mocked(Product.findOne).mockResolvedValue({
        ...mockProduct,
        variants: [{ ...mockVariant, isAvailable: false }],
      } as any);

      await expect(
        CartService.addToCart(userId, productId, variantSku, 1)
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ============================================
  // REMOVE FROM CART
  // ============================================
  // removeFromCart: filters out item by SKU; throws NotFoundError if SKU not in cart
  describe('removeFromCart', () => {
    // Happy path: item removed, cart persisted back to Redis with one fewer item
    it('should remove an item from cart', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(JSON.stringify(cartWithItem));
      vi.mocked(redisClient.setex).mockResolvedValue('OK');

      const cart = await CartService.removeFromCart(userId, variantSku);

      expect(cart.items).toHaveLength(0);
    });

    // Not found: trying to remove a SKU that doesn't exist in cart → NotFoundError
    it('should throw NotFoundError when item not in cart', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(emptyCartJson);

      await expect(
        CartService.removeFromCart(userId, 'GHOST-SKU')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================
  // UPDATE QUANTITY
  // ============================================
  // updateQuantity: sets item quantity; quantity=0 removes the item entirely.
  // Validates against current DB stock before updating.
  describe('updateQuantity', () => {
    // Happy path: new quantity persisted to Redis
    it('should update item quantity', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(JSON.stringify(cartWithItem));
      vi.mocked(redisClient.setex).mockResolvedValue('OK');
      vi.mocked(Product.findOne).mockResolvedValue(mockProduct as any);

      const cart = await CartService.updateQuantity(userId, variantSku, 5);

      expect(cart.items[0]!.quantity).toBe(5);
    });

    // Zero quantity: quantity=0 is treated as removal (item filtered out of cart)
    it('should remove item when quantity is 0', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(JSON.stringify(cartWithItem));
      vi.mocked(redisClient.setex).mockResolvedValue('OK');

      const cart = await CartService.updateQuantity(userId, variantSku, 0);

      expect(cart.items).toHaveLength(0);
    });

    // Not found: updating a SKU not in cart → NotFoundError
    it('should throw NotFoundError for non-existent cart item', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(emptyCartJson);

      await expect(
        CartService.updateQuantity(userId, 'GHOST-SKU', 1)
      ).rejects.toThrow(NotFoundError);
    });

    // Validation: negative quantity (e.g. -1) must be rejected with BadRequestError
    it('should throw BadRequestError for negative quantity', async () => {
      await expect(
        CartService.updateQuantity(userId, variantSku, -1)
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ============================================
  // CLEAR CART
  // ============================================
  // clearCart: deletes the entire Redis key — used on checkout completion or manual clear
  describe('clearCart', () => {
    // Happy path: Redis del called with the correct cart key
    it('should delete the cart key from Redis', async () => {
      vi.mocked(redisClient.del).mockResolvedValue(1);

      await CartService.clearCart(userId);

      expect(redisClient.del).toHaveBeenCalledWith(`cart:${userId}`);
    });
  });

  // ============================================
  // CART SUMMARY
  // ============================================
  // getCartSummary: computes itemCount, uniqueItems, subtotalNGN/USD from Redis cart
  describe('getCartSummary', () => {
    // Happy path: totals correctly calculated from items stored in Redis
    it('should compute correct totals', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(JSON.stringify(cartWithItem));

      const summary = await CartService.getCartSummary(userId);

      // 2 items × 15000 NGN = 30000
      expect(summary.subtotalNGN).toBe(30000);
      // 2 items × 20 USD = 40
      expect(summary.subtotalUSD).toBe(40);
      expect(summary.itemCount).toBe(2);
      expect(summary.uniqueItems).toBe(1);
    });

    // Empty cart: no Redis key → all totals zero, no crash
    it('should return zero totals for empty cart', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(null);

      const summary = await CartService.getCartSummary(userId);

      expect(summary.subtotalNGN).toBe(0);
      expect(summary.itemCount).toBe(0);
    });
  });

  // ============================================
  // VALIDATE CART ITEMS
  // ============================================
  // validateCartItems: re-checks each cart item against current DB state.
  // Updates prices in Redis to reflect current DB values.
  // Removes unavailable items and adjusts quantities for partial stock.
  describe('validateCartItems', () => {
    // Happy path: all items valid → { valid: true, issues: [] }
    it('should return valid: true when all items are in stock', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(JSON.stringify(cartWithItem));
      vi.mocked(redisClient.setex).mockResolvedValue('OK');
      vi.mocked(Product.findOne).mockResolvedValue(mockProduct as any);

      const result = await CartService.validateCartItems(userId);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    // Product removed: product.findOne returns null → issue recorded, item removed from cart
    it('should return issues when product is no longer available', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(JSON.stringify(cartWithItem));
      vi.mocked(redisClient.setex).mockResolvedValue('OK');
      vi.mocked(Product.findOne).mockResolvedValue(null); // product removed

      const result = await CartService.validateCartItems(userId);

      expect(result.valid).toBe(false);
      expect(result.issues[0]!.issue).toMatch(/no longer available/i);
    });
  });
});
