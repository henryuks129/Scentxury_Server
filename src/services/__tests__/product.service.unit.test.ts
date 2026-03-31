/**
 * ============================================
 * PRODUCT SERVICE — UNIT TESTS
 * ============================================
 *
 * Tests ProductService business logic.
 * Uses in-memory MongoDB for real model interactions.
 *
 * @file src/services/__tests__/product.service.unit.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProductService } from '../product.service.js';
import { Product } from '../../models/Product.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors.js';

// MongoMemoryServer is configured in test/setup.ts

// ============================================
// FIXTURES
// ============================================

const baseProduct = () => ({
  name: `Test Fragrance ${Date.now()}-${Math.random()}`,
  description: 'A luxurious test fragrance for unit testing',
  category: 'unisex' as const,
  brand: 'Chi',
  scentFamily: 'woody',
  scentNotes: { top: ['bergamot'], middle: ['rose'], base: ['musk'] },
  images: { boxed: 'http://box.jpg', bottle: 'http://bottle.jpg', thumbnail: 'http://thumb.jpg' },
  variants: [
    { sku: `SKU-20ML-${Date.now()}-${Math.random().toString(36).slice(2)}`, size: '20ml' as const, priceNGN: 15000, priceUSD: 20, costPrice: 7500, stock: 50 },
    { sku: `SKU-50ML-${Date.now()}-${Math.random().toString(36).slice(2)}`, size: '50ml' as const, priceNGN: 30000, priceUSD: 40, costPrice: 15000, stock: 30 },
  ],
});

// ============================================
// TESTS
// ============================================

// Tests ProductService business logic against a real in-memory MongoDB instance.
// Each test operates on isolated data seeded in beforeEach to prevent cross-test pollution.
describe('ProductService', () => {
  // getProducts: paginated + filtered product list
  // Verifies that filters, sort, and pagination are correctly applied to the Mongoose query.
  describe('getProducts', () => {
    beforeEach(async () => {
      const ts = Date.now();
      // Use create() so pre-save hooks (slug generation) run properly
      await Promise.all([
        Product.create({ ...baseProduct(), slug: `male-prod-${ts}`, category: 'male', scentFamily: 'oriental' }),
        Product.create({ ...baseProduct(), slug: `female-prod-${ts}`, category: 'female', scentFamily: 'floral' }),
        Product.create({ ...baseProduct(), slug: `unisex-prod-${ts}`, category: 'unisex', scentFamily: 'woody', isFeatured: true }),
      ]);
    });

    // Happy path: pagination metadata matches request params
    it('should return paginated products', async () => {
      const result = await ProductService.getProducts({ page: 1, limit: 10 });
      expect(result.products.length).toBeGreaterThan(0);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBeGreaterThan(0);
    });

    // Filter by category: only products with category === 'male' should be returned
    it('should filter by category', async () => {
      const result = await ProductService.getProducts({
        filter: { category: 'male' },
      });
      expect(result.products.every((p) => p.category === 'male')).toBe(true);
    });

    // Filter by scentFamily: only 'woody' scent products should be returned
    it('should filter by scentFamily', async () => {
      const result = await ProductService.getProducts({
        filter: { scentFamily: 'woody' },
      });
      expect(result.products.every((p) => p.scentFamily === 'woody')).toBe(true);
    });

    // Feature flag filter: isFeatured:true filter must only return featured products
    it('should filter by isFeatured', async () => {
      const result = await ProductService.getProducts({
        filter: { isFeatured: true },
      });
      expect(result.products.every((p) => p.isFeatured)).toBe(true);
    });

    // Pagination: limit=1 should return exactly 1 product even when more exist
    it('should respect pagination limits', async () => {
      const result = await ProductService.getProducts({ page: 1, limit: 1 });
      expect(result.products).toHaveLength(1);
      expect(result.pagination.totalPages).toBeGreaterThanOrEqual(result.pagination.total);
    });
  });

  // getProductBySlug: fetch single active product + increment view count
  describe('getProductBySlug', () => {
    // Happy path: existing active product found by slug
    it('should return a product by slug', async () => {
      const created = await Product.create(baseProduct());
      const found = await ProductService.getProductBySlug(created.slug);
      expect(found.slug).toBe(created.slug);
      expect(found.name).toBe(created.name);
    });

    // Not found: unknown slug must throw NotFoundError (→ 404 in controller)
    it('should throw NotFoundError for unknown slug', async () => {
      await expect(
        ProductService.getProductBySlug('does-not-exist-xyz')
      ).rejects.toThrow(NotFoundError);
    });

    // Soft-deleted products must be treated as 404 — isActive:false is invisible
    it('should not return inactive products', async () => {
      const product = await Product.create({ ...baseProduct(), isActive: false });
      await expect(
        ProductService.getProductBySlug(product.slug)
      ).rejects.toThrow(NotFoundError);
    });
  });

  // searchProducts: MongoDB $text full-text search
  // Empty/whitespace queries short-circuit before hitting MongoDB to avoid empty $text errors.
  describe('searchProducts', () => {
    // Guard: blank query should short-circuit and return [] without a DB call
    it('should return empty array for blank query', async () => {
      const results = await ProductService.searchProducts('');
      expect(results).toEqual([]);
    });

    // Guard: whitespace-only query (e.g. "   ") should also short-circuit
    it('should return empty array for whitespace-only query', async () => {
      const results = await ProductService.searchProducts('   ');
      expect(results).toEqual([]);
    });
  });

  // createProduct: insert new product with SKU uniqueness check + auto-slug + price range
  describe('createProduct', () => {
    // Happy path: product created, slug auto-generated by pre-save hook
    it('should create a product with auto-generated slug', async () => {
      const data = baseProduct();
      const product = await ProductService.createProduct(data);
      expect(product._id).toBeDefined();
      expect(product.slug).toBeDefined();
      expect(product.slug).toMatch(/^[a-z0-9-]+$/);
    });

    // Price range: basePrice = min(variantPriceNGN), maxPrice = max(variantPriceNGN)
    it('should compute basePrice and maxPrice from variants', async () => {
      const data = baseProduct();
      const product = await ProductService.createProduct(data);
      expect(product.basePrice).toBe(15000); // min of variant prices
      expect(product.maxPrice).toBe(30000);  // max of variant prices
    });

    // SKU uniqueness: duplicate SKU across products must throw ConflictError (→ 409)
    it('should throw ConflictError on duplicate SKU', async () => {
      const data = baseProduct();
      await ProductService.createProduct(data);

      // Same SKU, different product
      const data2 = { ...baseProduct(), variants: data.variants };
      await expect(ProductService.createProduct(data2)).rejects.toThrow(ConflictError);
    });
  });

  // updateProduct: partial update by slug, re-checks SKU conflicts for variant changes
  describe('updateProduct', () => {
    // Happy path: updated field persisted and returned
    it('should update product fields', async () => {
      const data = baseProduct();
      const created = await ProductService.createProduct(data);
      const updated = await ProductService.updateProduct(created.slug, {
        brand: 'New Brand',
      });
      expect(updated.brand).toBe('New Brand');
    });

    // Not found: unknown slug → NotFoundError (→ 404)
    it('should throw NotFoundError for unknown slug', async () => {
      await expect(
        ProductService.updateProduct('ghost-product', { brand: 'x' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  // deleteProduct: soft-delete — sets isActive:false so product is hidden from listings
  describe('deleteProduct', () => {
    // Soft delete: DB record persists but isActive is false
    it('should soft-delete (set isActive to false)', async () => {
      const data = baseProduct();
      const created = await ProductService.createProduct(data);
      await ProductService.deleteProduct(created.slug);

      const found = await Product.findById(created._id);
      expect(found?.isActive).toBe(false);
    });

    // Not found: unknown slug on delete → NotFoundError (→ 404)
    it('should throw NotFoundError for unknown slug', async () => {
      await expect(
        ProductService.deleteProduct('ghost-product')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // updateStock: directly modify a variant's stock level (set/increment/decrement)
  // Used by admin stock management endpoint; uses in-memory load + save (not atomic).
  describe('updateStock', () => {
    // Set operation: replaces stock value entirely
    it('should set stock to a specific value', async () => {
      const data = baseProduct();
      const created = await ProductService.createProduct(data);
      const sku = created.variants[0]!.sku;

      const updated = await ProductService.updateStock(
        created._id.toString(),
        sku,
        100,
        'set'
      );

      const variant = updated.variants.find((v) => v.sku === sku);
      expect(variant?.stock).toBe(100);
    });

    // Increment operation: adds quantity to existing stock
    it('should increment stock', async () => {
      const data = baseProduct();
      const created = await ProductService.createProduct(data);
      const sku = created.variants[0]!.sku;
      const initial = created.variants[0]!.stock;

      const updated = await ProductService.updateStock(
        created._id.toString(),
        sku,
        10,
        'increment'
      );

      const variant = updated.variants.find((v) => v.sku === sku);
      expect(variant?.stock).toBe(initial + 10);
    });

    // Decrement operation: subtracts quantity from existing stock
    it('should decrement stock', async () => {
      const data = baseProduct();
      const created = await ProductService.createProduct(data);
      const sku = created.variants[0]!.sku;
      const initial = created.variants[0]!.stock;

      const updated = await ProductService.updateStock(
        created._id.toString(),
        sku,
        5,
        'decrement'
      );

      const variant = updated.variants.find((v) => v.sku === sku);
      expect(variant?.stock).toBe(initial - 5);
    });

    // Guard: decrementing more than available stock must throw BadRequestError (→ 400)
    it('should throw BadRequestError when decrementing below zero', async () => {
      const data = baseProduct();
      const created = await ProductService.createProduct(data);
      const sku = created.variants[0]!.sku;

      await expect(
        ProductService.updateStock(created._id.toString(), sku, 999999, 'decrement')
      ).rejects.toThrow(BadRequestError);
    });

    // Not found: unknown variant SKU must throw NotFoundError (→ 404)
    it('should throw NotFoundError for unknown variant SKU', async () => {
      const data = baseProduct();
      const created = await ProductService.createProduct(data);

      await expect(
        ProductService.updateStock(created._id.toString(), 'GHOST-SKU', 10, 'set')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // validateStock: pre-order stock check — throws BadRequestError if any variant is unavailable
  describe('validateStock', () => {
    // Happy path: all items have sufficient stock — no error thrown
    it('should not throw when stock is sufficient', async () => {
      const data = baseProduct();
      const created = await ProductService.createProduct(data);

      await expect(
        ProductService.validateStock([
          { productId: created._id.toString(), variantSku: created.variants[0]!.sku, quantity: 1 },
        ])
      ).resolves.not.toThrow();
    });

    // Out of stock: stock=0 variant must cause BadRequestError (→ 400)
    it('should throw BadRequestError when stock is insufficient', async () => {
      const data = { ...baseProduct() };
      data.variants[0]!.stock = 0;
      const created = await Product.create(data);

      await expect(
        ProductService.validateStock([
          { productId: created._id.toString(), variantSku: created.variants[0]!.sku, quantity: 1 },
        ])
      ).rejects.toThrow(BadRequestError);
    });
  });

  // getFeaturedProducts: returns two separate lists for hero carousels
  describe('getFeaturedProducts', () => {
    // Happy path: seeded featured + newArrival products appear in their respective lists
    it('should return featured and newArrival products', async () => {
      await Product.create({ ...baseProduct(), isFeatured: true });
      await Product.create({ ...baseProduct(), isNewArrival: true });

      const result = await ProductService.getFeaturedProducts(10);

      expect(Array.isArray(result.featured)).toBe(true);
      expect(Array.isArray(result.newArrivals)).toBe(true);
      expect(result.featured.length).toBeGreaterThan(0);
    });
  });
});
