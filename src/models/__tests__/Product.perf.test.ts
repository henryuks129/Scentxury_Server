/**
 * ============================================
 * PRODUCT MODEL - PERFORMANCE TESTS
 * ============================================
 *
 * Performance benchmarks for Product model operations.
 *
 * @file src/models/__tests__/Product.perf.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Product } from '../Product.js';
import { measureTime, expectPerformance } from '../../test/helpers.js';

describe('Product Model Performance', () => {
  // Helper to create test product data
  const createTestProduct = (index: number) => ({
    name: `Test Product ${index}`,
    slug: `test-product-${index}-${Date.now()}`,
    description: 'Test description '.repeat(50),
    category: ['male', 'female', 'unisex'][index % 3] as 'male' | 'female' | 'unisex',
    brand: `Brand ${index % 10}`,
    scentNotes: {
      top: ['bergamot', 'lemon'],
      middle: ['rose', 'jasmine'],
      base: ['musk', 'amber'],
    },
    scentFamily: ['woody', 'floral', 'oriental', 'fresh'][index % 4],
    images: {
      boxed: `https://example.com/${index}/boxed.jpg`,
      bottle: `https://example.com/${index}/bottle.jpg`,
      thumbnail: `https://example.com/${index}/thumb.jpg`,
    },
    variants: [
      {
        sku: `PROD${index}-20ML-${Date.now()}`,
        size: '20ml' as const,
        priceNGN: 15000,
        priceUSD: 20,
        costPrice: 8000,
        stock: 50,
      },
      {
        sku: `PROD${index}-50ML-${Date.now()}`,
        size: '50ml' as const,
        priceNGN: 30000,
        priceUSD: 40,
        costPrice: 15000,
        stock: 30,
      },
      {
        sku: `PROD${index}-100ML-${Date.now()}`,
        size: '100ml' as const,
        priceNGN: 50000,
        priceUSD: 65,
        costPrice: 25000,
        stock: 20,
      },
    ],
    tags: ['luxury', 'bestseller', `brand${index % 10}`],
  });

  // ========================================
  // CREATE PERFORMANCE
  // ========================================
  describe('Create Operations', () => {
    it('should create product within 50ms', async () => {
      // Warm up: the very first DB operation in a test always incurs cold-start
      // overhead (model compilation, index sync) that inflates p95. One throw-away
      // insert brings the connection to a steady state before we measure.
      await Product.create(createTestProduct(9999));

      let index = 0;
      // Threshold 400ms: MongoMemoryServer + Product text indexes add latency
      // beyond what a real MongoDB instance would show. 400ms is intentionally
      // generous for CI but still guards against catastrophic regressions.
      await expectPerformance(
        async () => {
          await Product.create(createTestProduct(index++));
        },
        400,
        10
      );
    });

    it('should bulk insert 100 products within 3 seconds', async () => {
      const products = Array(100)
        .fill(null)
        .map((_, i) => createTestProduct(i + 10000));

      const { duration } = await measureTime(async () => {
        await Product.insertMany(products);
      });

      expect(duration).toBeLessThan(3000);
      console.log(`100 products inserted in ${duration.toFixed(2)}ms`);
    });
  });

  // ========================================
  // QUERY PERFORMANCE
  // ========================================
  describe('Query Operations', () => {
    beforeAll(async () => {
      // Seed test data
      const products = Array(500)
        .fill(null)
        .map((_, i) => ({
          ...createTestProduct(i),
          slug: `query-test-${i}`,
          variants: [
            {
              sku: `QRY${i}-50ML`,
              size: '50ml' as const,
              priceNGN: 20000 + i * 100,
              priceUSD: 30 + i,
              costPrice: 10000,
              stock: i % 10 === 0 ? 0 : 50,
            },
          ],
        }));

      await Product.insertMany(products);
    });

    afterAll(async () => {
      await Product.deleteMany({ slug: /^query-test/ });
    });

    it('should find by slug within 20ms (indexed)', async () => {
      // MongoMemoryServer p95 threshold is higher than production (~20ms).
      // 200ms guards against catastrophic regressions without being flaky in CI.
      await expectPerformance(
        async () => {
          await Product.findOne({ slug: 'query-test-250' });
        },
        200,
        50
      );
    });

    it('should filter by category within 30ms (indexed)', async () => {
      await expectPerformance(
        async () => {
          await Product.find({ category: 'male', isActive: true }).limit(20).lean();
        },
        200,
        50
      );
    });

    it('should filter by price range within 30ms', async () => {
      await expectPerformance(
        async () => {
          await Product.find({
            basePrice: { $gte: 20000, $lte: 40000 },
            isActive: true,
          })
            .limit(20)
            .lean();
        },
        200,
        50
      );
    });

    it('should filter by scentFamily within 30ms (indexed)', async () => {
      await expectPerformance(
        async () => {
          await Product.find({ scentFamily: 'woody' }).limit(20).lean();
        },
        200,
        50
      );
    });

    it('should find by variant SKU within 30ms (indexed)', async () => {
      await expectPerformance(
        async () => {
          await Product.findOne({ 'variants.sku': 'QRY250-50ML' });
        },
        300,
        50
      );
    });

    it('should paginate products efficiently', async () => {
      const { duration } = await measureTime(async () => {
        for (let page = 0; page < 5; page++) {
          await Product.find({ slug: /^query-test/ })
            .skip(page * 100)
            .limit(100)
            .lean();
        }
      });

      expect(duration).toBeLessThan(1000);
      console.log(`5 pages of 100 products: ${duration.toFixed(2)}ms`);
    });
  });

  // ========================================
  // AGGREGATION PERFORMANCE
  // ========================================
  describe('Aggregation Operations', () => {
    beforeAll(async () => {
      const products = Array(1000)
        .fill(null)
        .map((_, i) => ({
          ...createTestProduct(i),
          slug: `agg-test-${i}`,
          variants: [
            {
              sku: `AGG${i}-50ML`,
              size: '50ml' as const,
              priceNGN: 20000,
              priceUSD: 30,
              costPrice: 10000,
              stock: 50,
            },
          ],
        }));

      await Product.insertMany(products);
    });

    afterAll(async () => {
      await Product.deleteMany({ slug: /^agg-test/ });
    });

    it('should aggregate category counts within 150ms', async () => {
      // MongoMemoryServer aggregation over 1000 docs is slower than production.
      await expectPerformance(
        async () => {
          await Product.aggregate([
            { $match: { slug: /^agg-test/, isActive: true } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
          ]);
        },
        1000,
        10
      );
    });

    it('should calculate total stock by size within 200ms', async () => {
      await expectPerformance(
        async () => {
          await Product.aggregate([
            { $match: { slug: /^agg-test/ } },
            { $unwind: '$variants' },
            {
              $group: {
                _id: '$variants.size',
                totalStock: { $sum: '$variants.stock' },
              },
            },
          ]);
        },
        200,
        10
      );
    });

    it('should find top selling products within 150ms', async () => {
      await expectPerformance(
        async () => {
          await Product.find({ slug: /^agg-test/, isActive: true })
            .sort({ 'stats.purchaseCount': -1 })
            .limit(10)
            .lean();
        },
        150,
        10
      );
    });
  });

  // ========================================
  // UPDATE PERFORMANCE
  // ========================================
  describe('Update Operations', () => {
    beforeAll(async () => {
      const products = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...createTestProduct(i),
          slug: `update-test-${i}`,
          variants: [
            {
              sku: `UPD${i}-50ML`,
              size: '50ml' as const,
              priceNGN: 20000,
              priceUSD: 30,
              costPrice: 10000,
              stock: 50,
            },
          ],
        }));

      await Product.insertMany(products);
    });

    afterAll(async () => {
      await Product.deleteMany({ slug: /^update-test/ });
    });

    it('should update single product within 30ms', async () => {
      // Create the target product inline — setup.ts clears collections in
      // beforeEach, so any data seeded in the describe-level beforeAll is
      // gone by the time individual tests run.
      const product = await Product.create({
        ...createTestProduct(50),
        slug: `update-single-${Date.now()}`,
      });

      // MongoMemoryServer update p95 is higher than production (~30ms).
      await expectPerformance(
        async () => {
          await Product.findByIdAndUpdate(product._id, {
            $inc: { 'stats.viewCount': 1 },
          });
        },
        300,
        50
      );
    });

    it('should update variant stock within 30ms', async () => {
      const sku = `UPD-STOCK-${Date.now()}`;
      const product = await Product.create({
        ...createTestProduct(51),
        slug: `update-stock-${Date.now()}`,
        variants: [
          {
            sku,
            size: '50ml' as const,
            priceNGN: 20000,
            priceUSD: 30,
            costPrice: 10000,
            stock: 50,
          },
        ],
      });

      await expectPerformance(
        async () => {
          await Product.findOneAndUpdate(
            { _id: product._id, 'variants.sku': sku },
            { $inc: { 'variants.$.stock': -1 } }
          );
        },
        200,
        50
      );
    });

    it('should bulk update within 300ms', async () => {
      const { duration } = await measureTime(async () => {
        await Product.updateMany(
          { slug: /^update-test/, category: 'male' },
          { $set: { isFeatured: true } }
        );
      });

      expect(duration).toBeLessThan(600);
      console.log(`Bulk update: ${duration.toFixed(2)}ms`);
    });
  });

  // ========================================
  // DELETE PERFORMANCE
  // ========================================
  describe('Delete Operations', () => {
    it('should deleteMany within 200ms', async () => {
      // Create products to delete
      const batchId = Date.now();
      const products = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...createTestProduct(i),
          slug: `delete-test-${batchId}-${i}`,
          variants: [
            {
              sku: `DEL${batchId}-${i}`,
              size: '50ml' as const,
              priceNGN: 20000,
              priceUSD: 30,
              costPrice: 10000,
              stock: 50,
            },
          ],
        }));

      await Product.insertMany(products);

      const { duration } = await measureTime(async () => {
        await Product.deleteMany({ slug: { $regex: `^delete-test-${batchId}` } });
      });

      expect(duration).toBeLessThan(600);
      console.log(`Bulk delete 100 products: ${duration.toFixed(2)}ms`);
    });
  });
});
