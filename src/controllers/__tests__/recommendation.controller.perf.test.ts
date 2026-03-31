/**
 * ============================================
 * RECOMMENDATION CONTROLLER — PERFORMANCE TESTS
 * ============================================
 *
 * Benchmarks HTTP handler response times for the
 * recommendation controller under realistic load.
 *
 * Targets (matching DAY6_CHECKLIST Task 6.7.1):
 *   - GET /api/v1/recommendations        < 200ms p95
 *   - GET /api/v1/recommendations/product/:id  < 150ms p95
 *
 * RecommendationService is mocked — latency tested is
 * purely the HTTP handling + serialisation layer.
 *
 * @file src/controllers/__tests__/recommendation.controller.perf.test.ts
 */

import { describe, it, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import {
  getHybridRecommendations,
  getProductRecommendations,
} from '../recommendation.controller.js';
import { mockRequest, mockResponse, mockNext, expectPerformance } from '../../test/helpers.js';

// ============================================
// MOCK RECOMMENDATION SERVICE
// ============================================
import { vi } from 'vitest';

// Build a realistic-size fake product list to approximate serialisation cost
const fakeCatalog = Array.from({ length: 20 }, (_, i) => ({
  _id: new mongoose.Types.ObjectId().toString(),
  name: `Perf Fragrance ${i}`,
  scentFamily: 'oriental',
  category: 'unisex',
  basePrice: 20000 + i * 1000,
  variants: [{ sku: `SKU-CTRL-${i}`, size: '50ml', priceNGN: 20000, stock: 30 }],
}));

// vi.hoisted() ensures variables are available when vi.mock factory is hoisted.
const { mockHybrid, mockContentBased } = vi.hoisted(() => ({
  mockHybrid: vi.fn(),
  mockContentBased: vi.fn(),
}));

vi.mock('../../services/recommendation.service.js', () => ({
  RecommendationService: {
    getHybridRecommendations: mockHybrid,
    getContentBasedRecommendations: mockContentBased,
    getComboMixRecommendations: vi.fn().mockResolvedValue([]),
    getUserBasedRecommendations: vi.fn().mockResolvedValue([]),
    getChurnRiskUsers: vi.fn().mockResolvedValue([]),
    clusterUsersByBehaviour: vi.fn().mockResolvedValue({}),
  },
}));

// ============================================
// PERFORMANCE TESTS
// ============================================

describe('RecommendationController Performance', () => {
  beforeEach(() => {
    // vi.resetAllMocks() in setup.ts afterEach wipes implementations;
    // restore them here so each test starts with working mocks.
    mockHybrid.mockResolvedValue({
      products: fakeCatalog,
      source: ['user-based', 'content-based'],
    });
    mockContentBased.mockResolvedValue(fakeCatalog);
  });

  // -----------------------------------------
  // GET /api/v1/recommendations — hybrid
  // -----------------------------------------

  it('getHybridRecommendations handler responds within 200ms p95 (50 iterations)', async () => {
    await expectPerformance(
      async () => {
        const req = mockRequest({
          user: { id: new mongoose.Types.ObjectId().toString(), role: 'user' },
          query: { limit: '20' },
        });
        const res = mockResponse();
        const next = mockNext();
        await getHybridRecommendations(req as never, res as never, next);
      },
      200,
      50,
      95
    );
  });

  // -----------------------------------------
  // GET /api/v1/recommendations/product/:id — content-based
  // -----------------------------------------

  it('getProductRecommendations handler responds within 150ms p95 (50 iterations)', async () => {
    const productId = new mongoose.Types.ObjectId().toString();

    await expectPerformance(
      async () => {
        const req = mockRequest({ params: { productId } });
        const res = mockResponse();
        const next = mockNext();
        await getProductRecommendations(req as never, res as never, next);
      },
      150,
      50,
      95
    );
  });
});
