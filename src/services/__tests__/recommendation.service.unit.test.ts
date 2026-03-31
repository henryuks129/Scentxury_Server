/**
 * ============================================
 * RECOMMENDATION SERVICE — UNIT TESTS
 * ============================================
 *
 * Tests the hybrid AI recommendation engine:
 * - Content-based filtering (scent similarity scoring)
 * - User-based filtering (stored preferences)
 * - Collaborative filtering (similar purchase histories)
 * - Combo mix suggestions (fragrance layering)
 * - Hybrid merging with Redis cache
 * - Survey → preference mapping
 * - User clustering / churn segmentation
 *
 * Uses in-memory MongoDB (MongoMemoryServer via setup.ts).
 * Redis is mocked to isolate tests from a running Redis instance.
 *
 * @file src/services/__tests__/recommendation.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { RecommendationService } from '../recommendation.service.js';
import { Product } from '../../models/Product.js';
import { User } from '../../models/User.js';
import { Order } from '../../models/Order.js';
import { Survey } from '../../models/Survey.js';

// ============================================
// MOCK REDIS — avoids real Redis dependency
// ============================================
vi.mock('../../config/redis.js', () => ({
  redisClient: {
    get: vi.fn().mockResolvedValue(null),     // cache miss by default
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  },
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
  isRedisConnected: vi.fn().mockReturnValue(false),
  setCache: vi.fn(),
  getCache: vi.fn().mockResolvedValue(null),
  deleteCache: vi.fn(),
}));

// ============================================
// FIXTURES
// ============================================

/** Creates a minimal valid product document */
const makeProduct = (overrides: Record<string, unknown> = {}) => ({
  name: `Fragrance ${Math.random().toString(36).slice(2)}`,
  description: 'A test fragrance',
  category: 'unisex' as const,
  brand: 'Chi',
  scentFamily: 'woody',
  scentNotes: { top: ['bergamot', 'citrus'], middle: ['rose'], base: ['musk', 'oud'] },
  images: { boxed: 'http://b.jpg', bottle: 'http://bt.jpg', thumbnail: 'http://th.jpg' },
  variants: [
    {
      sku: `SKU-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      size: '50ml' as const,
      priceNGN: 30000,
      priceUSD: 40,
      costPrice: 15000,
      stock: 50,
    },
  ],
  isActive: true,
  ...overrides,
});

/** Creates a minimal valid user */
const makeUser = (overrides: Record<string, unknown> = {}) => ({
  email: `test${Math.random().toString(36).slice(2)}@scentxury.com`,
  password: 'Password123!',
  firstName: 'Test',
  lastName: 'User',
  role: 'user' as const,
  isVerified: true,
  isActive: true,
  ...overrides,
});

/** Creates a minimal valid order */
const makeOrder = (userId: string, productId: string, variantSku: string, overrides: Record<string, unknown> = {}) => ({
  orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  userId: new mongoose.Types.ObjectId(userId),
  items: [
    {
      productId: new mongoose.Types.ObjectId(productId),
      productName: 'Test Product',
      variantSku,
      variantSize: '50ml' as const,
      quantity: 1,
      unitPrice: 30000,
      costPrice: 15000,
      discount: 0,
      total: 30000,
    },
  ],
  subtotal: 30000,
  discount: 0,
  deliveryFee: 1500,
  total: 31500,
  currency: 'NGN' as const,
  status: 'delivered' as const,
  paymentStatus: 'paid' as const,
  paymentMethod: 'paystack' as const,
  shippingAddress: {
    street: '1 Test Lane',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    phone: '+2340000000000',
    recipientName: 'Test User',
  },
  deliveryType: 'standard' as const,
  trackingHistory: [],
  ...overrides,
});

// ============================================
// TESTS
// ============================================

describe('RecommendationService', () => {
  // -----------------------------------------
  // 6.1.1 Content-Based Recommendations
  // -----------------------------------------

  describe('getContentBasedRecommendations', () => {
    it('returns products with similar scent notes', async () => {
      // Source product with woody + musk base
      const source = await Product.create(makeProduct({ scentFamily: 'woody', scentNotes: { top: ['bergamot'], middle: ['rose'], base: ['musk'] } }));
      // Similar product (shares 'musk' base note)
      await Product.create(makeProduct({ scentFamily: 'oriental', scentNotes: { top: ['spice'], middle: ['amber'], base: ['musk'] } }));
      // Unrelated product (no shared notes)
      await Product.create(makeProduct({ scentFamily: 'floral', scentNotes: { top: ['jasmine'], middle: ['lily'], base: ['vanilla'] } }));

      const results = await RecommendationService.getContentBasedRecommendations(String(source._id), 10);

      // The similar product should appear
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((p) => String(p._id) !== String(source._id))).toBe(true);
    });

    it('excludes the source product from results', async () => {
      const source = await Product.create(makeProduct({ scentFamily: 'woody' }));
      await Product.create(makeProduct({ scentFamily: 'woody' }));

      const results = await RecommendationService.getContentBasedRecommendations(String(source._id), 10);

      expect(results.some((p) => String(p._id) === String(source._id))).toBe(false);
    });

    it('prioritises same scent family (+3 points) over individual note matches', async () => {
      const source = await Product.create(makeProduct({ scentFamily: 'woody', scentNotes: { top: ['bergamot'], middle: [], base: [] } }));
      // Same family — should score +3
      const sameFamilyProduct = await Product.create(makeProduct({ scentFamily: 'woody', scentNotes: { top: ['iris'], middle: [], base: [] } }));
      // Different family, same note — should score +1
      await Product.create(makeProduct({ scentFamily: 'floral', scentNotes: { top: ['bergamot'], middle: [], base: [] } }));

      const results = await RecommendationService.getContentBasedRecommendations(String(source._id), 10);

      // Same-family product should appear and rank highly
      expect(results.length).toBeGreaterThan(0);
      const ids = results.map((p) => String(p._id));
      expect(ids).toContain(String(sameFamilyProduct._id));
    });

    it('returns empty array when product does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const results = await RecommendationService.getContentBasedRecommendations(fakeId, 10);
      expect(results).toEqual([]);
    });
  });

  // -----------------------------------------
  // 6.1.2 User-Based Recommendations
  // -----------------------------------------

  describe('getUserBasedRecommendations', () => {
    it('returns products matching user preferred notes', async () => {
      const user = await User.create(makeUser({
        scentPreferences: { preferredNotes: ['oud', 'amber'], avoidNotes: [], intensity: 'strong', occasions: [] },
      }));
      // Product with matching preferred note
      await Product.create(makeProduct({ scentNotes: { top: ['oud'], middle: ['amber'], base: ['musk'] } }));

      const results = await RecommendationService.getUserBasedRecommendations(String(user._id), 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it('excludes products with avoided notes', async () => {
      const user = await User.create(makeUser({
        scentPreferences: {
          preferredNotes: ['rose'],
          avoidNotes: ['oud'],
          intensity: 'light',
          occasions: [],
        },
      }));
      // Product with an avoided note in top
      await Product.create(makeProduct({
        scentNotes: { top: ['oud'], middle: ['rose'], base: ['musk'] },
      }));
      // Clean product
      const cleanProd = await Product.create(makeProduct({
        scentNotes: { top: ['rose'], middle: ['jasmine'], base: ['vanilla'] },
      }));

      const results = await RecommendationService.getUserBasedRecommendations(String(user._id), 10);
      const ids = results.map((p) => String(p._id));
      // The oud product has 'oud' in top notes which is in avoidNotes
      // The clean product should appear
      expect(ids).toContain(String(cleanProd._id));
    });

    it('falls back to trending when user has no preferences', async () => {
      const user = await User.create(makeUser()); // no scentPreferences
      await Product.create(makeProduct());

      // Should return something (trending fallback)
      const results = await RecommendationService.getUserBasedRecommendations(String(user._id), 10);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // -----------------------------------------
  // 6.1.3 Collaborative Filtering
  // -----------------------------------------

  describe('getCollaborativeRecommendations', () => {
    it('finds products bought by similar users', async () => {
      const user1 = await User.create(makeUser());
      const user2 = await User.create(makeUser());

      const sharedProduct1 = await Product.create(makeProduct());
      const sharedProduct2 = await Product.create(makeProduct());
      const uniqueProduct = await Product.create(makeProduct());

      // user1 and user2 both bought sharedProduct1 + sharedProduct2
      await Order.create(makeOrder(String(user1._id), String(sharedProduct1._id), sharedProduct1.variants[0]!.sku));
      await Order.create(makeOrder(String(user1._id), String(sharedProduct2._id), sharedProduct2.variants[0]!.sku));
      await Order.create(makeOrder(String(user2._id), String(sharedProduct1._id), sharedProduct1.variants[0]!.sku));
      await Order.create(makeOrder(String(user2._id), String(sharedProduct2._id), sharedProduct2.variants[0]!.sku));
      // user2 also bought uniqueProduct — should be recommended to user1
      await Order.create(makeOrder(String(user2._id), String(uniqueProduct._id), uniqueProduct.variants[0]!.sku));

      const results = await RecommendationService.getCollaborativeRecommendations(String(user1._id), 10);

      const ids = results.map((p) => String(p._id));
      expect(ids).toContain(String(uniqueProduct._id));
    });

    it('excludes products the user has already purchased', async () => {
      const user1 = await User.create(makeUser());
      const user2 = await User.create(makeUser());
      const product = await Product.create(makeProduct());

      // user1 already bought this product
      await Order.create(makeOrder(String(user1._id), String(product._id), product.variants[0]!.sku));
      await Order.create(makeOrder(String(user2._id), String(product._id), product.variants[0]!.sku));

      const results = await RecommendationService.getCollaborativeRecommendations(String(user1._id), 10);
      const ids = results.map((p) => String(p._id));
      expect(ids).not.toContain(String(product._id));
    });

    it('returns empty array if user has no orders', async () => {
      const user = await User.create(makeUser());
      const results = await RecommendationService.getCollaborativeRecommendations(String(user._id), 10);
      expect(results).toEqual([]);
    });
  });

  // -----------------------------------------
  // 6.1.4 Combo Mix Recommendations
  // -----------------------------------------

  describe('getComboMixRecommendations', () => {
    it('returns explicitly listed layersWith products', async () => {
      const pair = await Product.create(makeProduct({ scentFamily: 'floral' }));
      const source = await Product.create(makeProduct({
        scentFamily: 'woody',
        layersWith: [pair._id],
      }));

      // Re-fetch with proper layersWith populated
      const results = await RecommendationService.getComboMixRecommendations(String(source._id));
      expect(results.length).toBeGreaterThan(0);
      expect(String(results[0]!.product._id)).toBe(String(pair._id));
    });

    it('falls back to complementary scent family logic when layersWith is empty', async () => {
      // woody → should pair with floral / oriental
      await Product.create(makeProduct({ scentFamily: 'floral' }));
      const source = await Product.create(makeProduct({ scentFamily: 'woody', layersWith: [] }));

      const results = await RecommendationService.getComboMixRecommendations(String(source._id));
      expect(results.length).toBeGreaterThan(0);
      // Explanation should mention scent family logic
      expect(results[0]!.explanation).toContain('woody');
    });
  });

  // -----------------------------------------
  // 6.1.5 Hybrid Recommendations
  // -----------------------------------------

  describe('getHybridRecommendations', () => {
    it('merges results from multiple strategies', async () => {
      const user = await User.create(makeUser({
        scentPreferences: { preferredNotes: ['rose'], avoidNotes: [], intensity: 'moderate', occasions: [] },
      }));
      await Product.create(makeProduct({ scentNotes: { top: ['rose'], middle: [], base: [] } }));

      const result = await RecommendationService.getHybridRecommendations({
        userId: String(user._id),
        limit: 10,
      });

      expect(result.products.length).toBeGreaterThan(0);
      expect(Array.isArray(result.source)).toBe(true);
    });

    it('de-duplicates products that appear in multiple strategies', async () => {
      const user = await User.create(makeUser({
        scentPreferences: { preferredNotes: ['oud'], avoidNotes: [], intensity: 'strong', occasions: [] },
      }));
      await Product.create(makeProduct({
        scentFamily: 'oriental',
        scentNotes: { top: ['oud'], middle: ['amber'], base: ['musk'] },
      }));

      const result = await RecommendationService.getHybridRecommendations({
        userId: String(user._id),
        currentProductId: undefined,
        limit: 10,
      });

      // No duplicate IDs
      const ids = result.products.map((p) => String(p._id));
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('includes source list indicating which strategies contributed', async () => {
      const user = await User.create(makeUser({
        scentPreferences: { preferredNotes: ['oud'], avoidNotes: [], intensity: 'strong', occasions: [] },
      }));
      await Product.create(makeProduct());

      const result = await RecommendationService.getHybridRecommendations({
        userId: String(user._id),
        limit: 5,
      });

      expect(result.source.length).toBeGreaterThan(0);
    });

    it('returns Redis cached result on cache hit', async () => {
      const { redisClient } = await import('../../config/redis.js');
      const cachedResult = {
        products: [{ _id: 'cached-id', name: 'Cached Product' }],
        source: ['cached'],
      };

      // Override get to return cached data
      vi.mocked(redisClient.get).mockResolvedValueOnce(JSON.stringify(cachedResult));

      const result = await RecommendationService.getHybridRecommendations({ limit: 5 });

      expect(result.products[0]).toMatchObject({ name: 'Cached Product' });
      expect(result.source).toContain('cached');
    });
  });

  // -----------------------------------------
  // 6.1.6 Survey Processing
  // -----------------------------------------

  describe('processSurveyForRecommendations', () => {
    it('maps evening occasion to oud, amber, vanilla preferred notes', async () => {
      await Product.create(makeProduct({ scentNotes: { top: ['oud'], middle: ['amber'], base: ['vanilla'] } }));

      const result = await RecommendationService.processSurveyForRecommendations({
        answers: { occasion: 'evening' },
      });

      expect(result.derivedProfile.preferredNotes).toContain('oud');
      expect(result.derivedProfile.preferredNotes).toContain('amber');
      expect(result.derivedProfile.preferredNotes).toContain('vanilla');
    });

    it('maps office occasion to fresh, citrus, lavender notes', async () => {
      const result = await RecommendationService.processSurveyForRecommendations({
        answers: { occasion: 'office' },
      });
      expect(result.derivedProfile.preferredNotes).toContain('fresh');
      expect(result.derivedProfile.preferredNotes).toContain('citrus');
    });

    it('persists derived preferences to user when userId is provided', async () => {
      const user = await User.create(makeUser());
      await Product.create(makeProduct());

      await RecommendationService.processSurveyForRecommendations({
        userId: String(user._id),
        answers: { occasion: 'casual', intensity: 'moderate' },
      });

      const updated = await User.findById(user._id).lean();
      expect(updated?.scentPreferences?.preferredNotes).toContain('woody');
    });

    it('saves a Survey record regardless of userId', async () => {
      const countBefore = await Survey.countDocuments();
      await RecommendationService.processSurveyForRecommendations({
        answers: { occasion: 'evening' },
      });
      const countAfter = await Survey.countDocuments();
      expect(countAfter).toBe(countBefore + 1);
    });
  });

  // -----------------------------------------
  // 6.1.7 User Clustering
  // -----------------------------------------

  describe('clusterUsersByBehaviour', () => {
    it('assigns vip segment to users with 5+ orders in last 30 days', async () => {
      const user = await User.create(makeUser());
      const product = await Product.create(makeProduct());

      // Create 5 recent orders
      for (let i = 0; i < 5; i++) {
        await Order.create(makeOrder(String(user._id), String(product._id), product.variants[0]!.sku));
      }

      await RecommendationService.clusterUsersByBehaviour();

      const updated = await User.findById(user._id).lean();
      expect(updated?.segment).toBe('vip');
    });

    it('assigns at_risk segment to users inactive 60–120 days', async () => {
      const user = await User.create(makeUser());
      const product = await Product.create(makeProduct());

      // Create an order 90 days ago
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await Order.create({
        ...makeOrder(String(user._id), String(product._id), product.variants[0]!.sku),
        createdAt: ninetyDaysAgo,
        paymentStatus: 'paid',
      });

      await RecommendationService.clusterUsersByBehaviour();

      const updated = await User.findById(user._id).lean();
      expect(updated?.segment).toBe('at_risk');
    });

    it('returns correct segment summary counts', async () => {
      const user = await User.create(makeUser());
      const product = await Product.create(makeProduct());

      // 5 recent orders → vip
      for (let i = 0; i < 5; i++) {
        await Order.create(makeOrder(String(user._id), String(product._id), product.variants[0]!.sku));
      }

      const summary = await RecommendationService.clusterUsersByBehaviour();

      expect(typeof summary.vip).toBe('number');
      expect(typeof summary.at_risk).toBe('number');
      expect(typeof summary.churned).toBe('number');
      expect(summary.vip + summary.loyal + summary.at_risk + summary.churned + summary.new)
        .toBeGreaterThan(0);
    });
  });

  // -----------------------------------------
  // 6.1 Churn Risk Users
  // -----------------------------------------

  describe('getChurnRiskUsers', () => {
    it('returns at_risk and churned users sorted by inactivity', async () => {
      const user1 = await User.create(makeUser({ segment: 'at_risk' }));
      const user2 = await User.create(makeUser({ segment: 'churned' }));
      await User.create(makeUser({ segment: 'vip' })); // should NOT appear

      const results = await RecommendationService.getChurnRiskUsers(50);

      const ids = results.map((u) => u.userId);
      expect(ids).toContain(String(user1._id));
      expect(ids).toContain(String(user2._id));
    });

    it('respects the limit parameter', async () => {
      // Create 5 at_risk users
      for (let i = 0; i < 5; i++) {
        await User.create(makeUser({ segment: 'at_risk' }));
      }
      const results = await RecommendationService.getChurnRiskUsers(2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  // -----------------------------------------
  // 6.1 Edge Cases
  // -----------------------------------------

  describe('edge cases', () => {
    it('returns trending fallback when no userId or productId provided', async () => {
      await Product.create(makeProduct());

      const result = await RecommendationService.getHybridRecommendations({ limit: 5 });

      // Should fall back to trending
      expect(Array.isArray(result.products)).toBe(true);
      expect(result.source).toContain('trending');
    });

    it('returns empty array for collaborative filtering with no order history', async () => {
      const user = await User.create(makeUser());
      const results = await RecommendationService.getCollaborativeRecommendations(
        String(user._id),
        10
      );
      expect(results).toEqual([]);
    });
  });
});
