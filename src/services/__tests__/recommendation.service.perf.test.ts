/**
 * ============================================
 * RECOMMENDATION SERVICE — PERFORMANCE TESTS
 * ============================================
 *
 * Benchmarks response times for the recommendation engine
 * under realistic data volumes. Seeds 50 products, 10 users,
 * and 30 orders before running timing assertions.
 *
 * Targets (matching DAY6_CHECKLIST Task 6.1.8):
 *   - Content-based:   < 100ms per call
 *   - User-based:      < 150ms per call
 *   - Collaborative:   < 300ms per call
 *   - Hybrid:          < 500ms per call
 *   - 20 concurrent:   < 5000ms total
 *
 * @file src/services/__tests__/recommendation.service.perf.test.ts
 */

import { describe, it, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { RecommendationService } from '../recommendation.service.js';
import { Product } from '../../models/Product.js';
import { User } from '../../models/User.js';
import { Order } from '../../models/Order.js';
import { measureTime, expectPerformance } from '../../test/helpers.js';

// ============================================
// MOCK REDIS (no real Redis in CI)
// ============================================
import { vi } from 'vitest';
vi.mock('../../config/redis.js', () => ({
  redisClient: {
    get: vi.fn().mockResolvedValue(null),
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
// SEED DATA
// ============================================

let seedProductId: string;
let seedUserId: string;
const SCENT_FAMILIES = ['woody', 'floral', 'oriental', 'fresh', 'citrus', 'aquatic'];
const NOTES = ['oud', 'rose', 'musk', 'amber', 'citrus', 'vanilla', 'bergamot', 'jasmine'];

beforeAll(async () => {
  // Seed 50 products
  const products = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      Product.create({
        name: `Perf Fragrance ${i}`,
        description: 'Performance test fragrance',
        category: i % 2 === 0 ? 'male' : 'female',
        brand: 'Chi',
        scentFamily: SCENT_FAMILIES[i % SCENT_FAMILIES.length]!,
        scentNotes: {
          top: [NOTES[i % NOTES.length]!],
          middle: [NOTES[(i + 2) % NOTES.length]!],
          base: [NOTES[(i + 4) % NOTES.length]!],
        },
        images: { boxed: 'http://b.jpg', bottle: 'http://bt.jpg', thumbnail: 'http://th.jpg' },
        variants: [{
          sku: `SKU-PERF-${i}-${Date.now()}`,
          size: '50ml',
          priceNGN: 20000 + i * 1000,
          priceUSD: 25 + i,
          costPrice: 10000,
          stock: 50,
        }],
        isActive: true,
        basePrice: 20000 + i * 1000,
        stats: { purchaseCount: Math.floor(Math.random() * 100), viewCount: 200, averageRating: 4.5, reviewCount: 10 },
      })
    )
  );
  seedProductId = String(products[0]!._id);

  // Seed 10 users
  const users = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      User.create({
        email: `perfuser${i}@test.com`,
        password: 'Password123!',
        firstName: `User${i}`,
        lastName: 'Perf',
        role: 'user',
        isVerified: true,
        isActive: true,
        scentPreferences: {
          preferredNotes: [NOTES[i % NOTES.length]!],
          avoidNotes: [],
          intensity: 'moderate',
          occasions: ['evening'],
        },
      })
    )
  );
  seedUserId = String(users[0]!._id);

  // Seed 30 orders spread across products and users
  await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      Order.create({
        orderNumber: `PERF-ORD-${i}-${Date.now()}`,
        userId: new mongoose.Types.ObjectId(String(users[i % users.length]!._id)),
        items: [{
          productId: new mongoose.Types.ObjectId(String(products[i % products.length]!._id)),
          productName: `Perf Fragrance ${i}`,
          variantSku: `SKU-PERF-${i % 50}-${Date.now()}`,
          variantSize: '50ml',
          quantity: 1,
          unitPrice: 30000,
          costPrice: 10000,
          discount: 0,
          total: 30000,
        }],
        subtotal: 30000,
        discount: 0,
        deliveryFee: 1500,
        total: 31500,
        currency: 'NGN',
        status: 'delivered',
        paymentStatus: 'paid',
        paymentMethod: 'paystack',
        shippingAddress: { street: '1 Test', city: 'Lagos', state: 'Lagos', country: 'Nigeria', phone: '+234', recipientName: 'Test' },
        deliveryType: 'standard',
        trackingHistory: [],
      })
    )
  );
}, 60000);

// ============================================
// PERFORMANCE TESTS
// ============================================

describe('RecommendationService Performance', () => {
  it('content-based completes within 100ms (20 iterations)', async () => {
    await expectPerformance(
      () => RecommendationService.getContentBasedRecommendations(seedProductId, 10),
      100,
      20,
      95
    );
  });

  it('user-based completes within 150ms (20 iterations)', async () => {
    await expectPerformance(
      () => RecommendationService.getUserBasedRecommendations(seedUserId, 10),
      150,
      20,
      95
    );
  });

  it('collaborative filtering completes within 300ms (10 iterations)', async () => {
    await expectPerformance(
      () => RecommendationService.getCollaborativeRecommendations(seedUserId, 10),
      300,
      10,
      95
    );
  });

  it('hybrid recommendations complete within 500ms (10 iterations)', async () => {
    await expectPerformance(
      () => RecommendationService.getHybridRecommendations({ userId: seedUserId, currentProductId: seedProductId, limit: 10 }),
      500,
      10,
      95
    );
  });

  it('20 concurrent recommendation requests complete within 5000ms', async () => {
    const { duration } = await measureTime(() =>
      Promise.all(
        Array.from({ length: 20 }, () =>
          RecommendationService.getHybridRecommendations({ userId: seedUserId, limit: 5 })
        )
      )
    );
    // Must complete within 5 seconds total
    expect(duration).toBeLessThan(5000);
  });
});
