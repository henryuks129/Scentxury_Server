/**
 * ============================================
 * PRODUCT MODEL - UNIT TESTS
 * ============================================
 *
 * TDD: Tests written first, then implementation.
 * Uses MongoDB Memory Server from test setup.
 *
 * @file src/models/__tests__/Product.unit.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { Product, IProduct } from '../Product.js';

describe('Product Model', () => {
  // Helper to create valid product data
  const createValidProduct = (overrides = {}) => ({
    name: 'Oud Wood Intense',
    slug: 'oud-wood-intense',
    description: 'A luxurious woody fragrance with notes of oud and sandalwood',
    shortDescription: 'Luxury oud fragrance',
    category: 'unisex' as const,
    brand: 'Tom Ford',
    scentNotes: {
      top: ['oud', 'cardamom'],
      middle: ['sandalwood', 'rose'],
      base: ['amber', 'musk'],
    },
    scentFamily: 'woody',
    images: {
      boxed: 'https://example.com/boxed.jpg',
      bottle: 'https://example.com/bottle.jpg',
      thumbnail: 'https://example.com/thumb.jpg',
    },
    variants: [
      {
        sku: 'OUD-20ML',
        size: '20ml' as const,
        priceNGN: 25000,
        priceUSD: 35,
        costPrice: 12000,
        stock: 50,
      },
      {
        sku: 'OUD-50ML',
        size: '50ml' as const,
        priceNGN: 45000,
        priceUSD: 60,
        costPrice: 22000,
        stock: 30,
      },
      {
        sku: 'OUD-100ML',
        size: '100ml' as const,
        priceNGN: 75000,
        priceUSD: 100,
        costPrice: 35000,
        stock: 20,
      },
    ],
    ...overrides,
  });

  // ========================================
  // SCHEMA VALIDATION TESTS
  // ========================================
  describe('Schema Validation', () => {
    it('should create a valid product', async () => {
      const product = await Product.create(createValidProduct());

      expect(product._id).toBeDefined();
      expect(product.name).toBe('Oud Wood Intense');
      expect(product.variants).toHaveLength(3);
      expect(product.isActive).toBe(true);
    });

    it('should require name', async () => {
      const product = new Product(createValidProduct({ name: undefined }));

      await expect(product.save()).rejects.toThrow(/name/i);
    });

    it('should require description', async () => {
      const product = new Product(createValidProduct({ description: undefined }));

      await expect(product.save()).rejects.toThrow(/description/i);
    });

    it('should require category', async () => {
      const product = new Product(createValidProduct({ category: undefined }));

      await expect(product.save()).rejects.toThrow(/category/i);
    });

    it('should validate category enum', async () => {
      const product = new Product(createValidProduct({ category: 'invalid' as any }));

      await expect(product.save()).rejects.toThrow();
    });

    it('should accept valid category values', async () => {
      const categories = ['male', 'female', 'unisex', 'children', 'combo_mix'];

      for (const category of categories) {
        const product = await Product.create(
          createValidProduct({
            slug: `test-${category}-${Date.now()}`,
            category,
            variants: [
              {
                sku: `TEST-${category}-${Date.now()}`,
                size: '50ml',
                priceNGN: 30000,
                priceUSD: 40,
                costPrice: 15000,
                stock: 10,
              },
            ],
          })
        );
        expect(product.category).toBe(category);
      }
    });

    it('should require brand', async () => {
      const product = new Product(createValidProduct({ brand: undefined }));

      await expect(product.save()).rejects.toThrow(/brand/i);
    });

    it('should require scentFamily', async () => {
      const product = new Product(createValidProduct({ scentFamily: undefined }));

      await expect(product.save()).rejects.toThrow(/scentFamily/i);
    });

    it('should require images.boxed', async () => {
      const product = new Product(
        createValidProduct({ images: { bottle: 'url', thumbnail: 'url' } })
      );

      await expect(product.save()).rejects.toThrow(/boxed/i);
    });

    it('should require images.bottle', async () => {
      const product = new Product(
        createValidProduct({ images: { boxed: 'url', thumbnail: 'url' } })
      );

      await expect(product.save()).rejects.toThrow(/bottle/i);
    });

    it('should require images.thumbnail', async () => {
      const product = new Product(
        createValidProduct({ images: { boxed: 'url', bottle: 'url' } })
      );

      await expect(product.save()).rejects.toThrow(/thumbnail/i);
    });

    it('should enforce unique slug', async () => {
      await Product.create(createValidProduct());

      const duplicateProduct = new Product(
        createValidProduct({ name: 'Different Name' })
      );

      await expect(duplicateProduct.save()).rejects.toThrow(/duplicate/i);
    });

    it('should default isActive to true', async () => {
      const product = await Product.create(
        createValidProduct({ slug: 'active-test' })
      );

      expect(product.isActive).toBe(true);
    });

    it('should default isFeatured to false', async () => {
      const product = await Product.create(
        createValidProduct({ slug: 'featured-test' })
      );

      expect(product.isFeatured).toBe(false);
    });

    it('should default isNewArrival to true', async () => {
      const product = await Product.create(
        createValidProduct({ slug: 'newarrival-test' })
      );

      expect(product.isNewArrival).toBe(true);
    });
  });

  // ========================================
  // VARIANT TESTS
  // ========================================
  describe('Variants', () => {
    it('should store all three sizes', async () => {
      const product = await Product.create(createValidProduct({ slug: 'var1' }));

      const sizes = product.variants.map((v) => v.size);
      expect(sizes).toContain('20ml');
      expect(sizes).toContain('50ml');
      expect(sizes).toContain('100ml');
    });

    it('should calculate basePrice from minimum variant price', async () => {
      const product = await Product.create(createValidProduct({ slug: 'var2' }));

      expect(product.basePrice).toBe(25000); // Minimum of 25000, 45000, 75000
    });

    it('should calculate maxPrice from maximum variant price', async () => {
      const product = await Product.create(createValidProduct({ slug: 'var3' }));

      expect(product.maxPrice).toBe(75000); // Maximum of 25000, 45000, 75000
    });

    it('should track stock per variant', async () => {
      const product = await Product.create(createValidProduct({ slug: 'var4' }));

      const variant20ml = product.variants.find((v) => v.size === '20ml');
      const variant50ml = product.variants.find((v) => v.size === '50ml');

      expect(variant20ml?.stock).toBe(50);
      expect(variant50ml?.stock).toBe(30);
    });

    it('should track costPrice per variant', async () => {
      const product = await Product.create(createValidProduct({ slug: 'var5' }));

      const variant20ml = product.variants.find((v) => v.size === '20ml');
      expect(variant20ml?.costPrice).toBe(12000);
    });

    it('should validate variant size enum', async () => {
      const product = new Product(
        createValidProduct({
          slug: 'var6',
          variants: [
            {
              sku: 'BAD-SIZE',
              size: '30ml' as any,
              priceNGN: 10000,
              priceUSD: 15,
              costPrice: 5000,
              stock: 10,
            },
          ],
        })
      );

      await expect(product.save()).rejects.toThrow();
    });

    it('should require variant sku', async () => {
      const product = new Product(
        createValidProduct({
          slug: 'var7',
          variants: [
            {
              size: '50ml',
              priceNGN: 10000,
              priceUSD: 15,
              costPrice: 5000,
              stock: 10,
            } as any,
          ],
        })
      );

      await expect(product.save()).rejects.toThrow(/sku/i);
    });

    it('should default lowStockThreshold to 10', async () => {
      const product = await Product.create(createValidProduct({ slug: 'var8' }));

      expect(product.variants[0].lowStockThreshold).toBe(10);
    });

    it('should default variant isAvailable to true', async () => {
      const product = await Product.create(createValidProduct({ slug: 'var9' }));

      expect(product.variants[0].isAvailable).toBe(true);
    });
  });

  // ========================================
  // VIRTUAL PROPERTIES TESTS
  // ========================================
  describe('Virtual Properties', () => {
    it('should calculate totalStock', async () => {
      const product = await Product.create(createValidProduct({ slug: 'virt1' }));

      expect(product.totalStock).toBe(100); // 50 + 30 + 20
    });

    it('should return inStock true when stock available', async () => {
      const product = await Product.create(createValidProduct({ slug: 'virt2' }));

      expect(product.inStock).toBe(true);
    });

    it('should return inStock false when no stock', async () => {
      const product = await Product.create(
        createValidProduct({
          slug: 'virt3',
          variants: [
            {
              sku: 'NOSTOCK',
              size: '50ml',
              priceNGN: 30000,
              priceUSD: 40,
              costPrice: 15000,
              stock: 0,
            },
          ],
        })
      );

      expect(product.inStock).toBe(false);
    });

    it('should return inStock false when variant unavailable', async () => {
      const product = await Product.create(
        createValidProduct({
          slug: 'virt4',
          variants: [
            {
              sku: 'UNAVAIL',
              size: '50ml',
              priceNGN: 30000,
              priceUSD: 40,
              costPrice: 15000,
              stock: 50,
              isAvailable: false,
            },
          ],
        })
      );

      expect(product.inStock).toBe(false);
    });

    it('should return isOnSale false when no discount', async () => {
      const product = await Product.create(createValidProduct({ slug: 'virt5' }));

      expect(product.isOnSale).toBe(false);
    });

    it('should return isOnSale true during discount period', async () => {
      const now = new Date();
      const product = await Product.create(
        createValidProduct({
          slug: 'virt6',
          discountType: 'percentage',
          discountValue: 20,
          discountStartDate: new Date(now.getTime() - 86400000), // Yesterday
          discountEndDate: new Date(now.getTime() + 86400000), // Tomorrow
        })
      );

      expect(product.isOnSale).toBe(true);
    });

    it('should return isOnSale false after discount period', async () => {
      const now = new Date();
      const product = await Product.create(
        createValidProduct({
          slug: 'virt7',
          discountType: 'percentage',
          discountValue: 20,
          discountStartDate: new Date(now.getTime() - 172800000), // 2 days ago
          discountEndDate: new Date(now.getTime() - 86400000), // Yesterday
        })
      );

      expect(product.isOnSale).toBe(false);
    });
  });

  // ========================================
  // DISCOUNT CALCULATION TESTS
  // ========================================
  describe('getDiscountedPrice', () => {
    it('should return original price when no discount', async () => {
      const product = await Product.create(createValidProduct({ slug: 'disc1' }));

      const price = product.getDiscountedPrice('OUD-50ML');
      expect(price).toBe(45000);
    });

    it('should calculate percentage discount correctly', async () => {
      const now = new Date();
      const product = await Product.create(
        createValidProduct({
          slug: 'disc2',
          discountType: 'percentage',
          discountValue: 20, // 20% off
          discountStartDate: new Date(now.getTime() - 86400000),
          discountEndDate: new Date(now.getTime() + 86400000),
        })
      );

      const price = product.getDiscountedPrice('OUD-50ML');
      expect(price).toBe(36000); // 45000 * 0.8
    });

    it('should calculate fixed discount correctly', async () => {
      const now = new Date();
      const product = await Product.create(
        createValidProduct({
          slug: 'disc3',
          discountType: 'fixed',
          discountValue: 5000, // N5000 off
          discountStartDate: new Date(now.getTime() - 86400000),
          discountEndDate: new Date(now.getTime() + 86400000),
        })
      );

      const price = product.getDiscountedPrice('OUD-50ML');
      expect(price).toBe(40000); // 45000 - 5000
    });

    it('should return USD price when specified', async () => {
      const product = await Product.create(createValidProduct({ slug: 'disc4' }));

      const price = product.getDiscountedPrice('OUD-50ML', 'USD');
      expect(price).toBe(60);
    });

    it('should return 0 for non-existent variant', async () => {
      const product = await Product.create(createValidProduct({ slug: 'disc5' }));

      const price = product.getDiscountedPrice('INVALID-SKU');
      expect(price).toBe(0);
    });

    it('should not go below 0 with fixed discount', async () => {
      const now = new Date();
      const product = await Product.create(
        createValidProduct({
          slug: 'disc6',
          discountType: 'fixed',
          discountValue: 100000, // More than price
          discountStartDate: new Date(now.getTime() - 86400000),
          discountEndDate: new Date(now.getTime() + 86400000),
        })
      );

      const price = product.getDiscountedPrice('OUD-20ML');
      expect(price).toBe(0);
    });
  });

  // ========================================
  // SCENT NOTES TESTS
  // ========================================
  describe('Scent Notes', () => {
    it('should store top, middle, and base notes', async () => {
      const product = await Product.create(createValidProduct({ slug: 'scent1' }));

      expect(product.scentNotes.top).toContain('oud');
      expect(product.scentNotes.middle).toContain('sandalwood');
      expect(product.scentNotes.base).toContain('amber');
    });

    it('should lowercase scent notes', async () => {
      const product = await Product.create(
        createValidProduct({
          slug: 'scent2',
          scentNotes: {
            top: ['OUD', 'BERGAMOT'],
            middle: ['ROSE'],
            base: ['MUSK'],
          },
        })
      );

      expect(product.scentNotes.top).toContain('oud');
      expect(product.scentNotes.top).toContain('bergamot');
    });
  });

  // ========================================
  // SLUG GENERATION TESTS
  // ========================================
  describe('Slug Generation', () => {
    it('should auto-generate slug from name if not provided', async () => {
      const product = await Product.create(
        createValidProduct({
          name: 'New Fragrance Name',
          slug: undefined,
        })
      );

      expect(product.slug).toBe('new-fragrance-name');
    });

    it('should handle special characters in slug', async () => {
      const product = await Product.create(
        createValidProduct({
          name: "Tom Ford's Oud #1 Collection!",
          slug: undefined,
        })
      );

      expect(product.slug).toMatch(/^tom-ford-s-oud-1-collection$/);
    });

    it('should use provided slug if given', async () => {
      const product = await Product.create(
        createValidProduct({
          name: 'Test Product',
          slug: 'custom-slug-here',
        })
      );

      expect(product.slug).toBe('custom-slug-here');
    });
  });

  // ========================================
  // LONGEVITY AND SILLAGE TESTS
  // ========================================
  describe('Longevity and Sillage', () => {
    it('should default longevity to moderate', async () => {
      const product = await Product.create(createValidProduct({ slug: 'long1' }));

      expect(product.longevity).toBe('moderate');
    });

    it('should accept valid longevity values', async () => {
      const values = ['light', 'moderate', 'long-lasting', 'beast-mode'];

      for (const longevity of values) {
        const product = await Product.create(
          createValidProduct({
            slug: `long-${longevity}`,
            longevity: longevity as any,
          })
        );
        expect(product.longevity).toBe(longevity);
      }
    });

    it('should default sillage to moderate', async () => {
      const product = await Product.create(createValidProduct({ slug: 'sill1' }));

      expect(product.sillage).toBe('moderate');
    });

    it('should accept valid sillage values', async () => {
      const values = ['intimate', 'moderate', 'strong', 'enormous'];

      for (const sillage of values) {
        const product = await Product.create(
          createValidProduct({
            slug: `sill-${sillage}`,
            sillage: sillage as any,
          })
        );
        expect(product.sillage).toBe(sillage);
      }
    });
  });

  // ========================================
  // STATS TESTS
  // ========================================
  describe('Product Stats', () => {
    it('should initialize stats to zero', async () => {
      const product = await Product.create(createValidProduct({ slug: 'stats1' }));

      expect(product.stats.viewCount).toBe(0);
      expect(product.stats.purchaseCount).toBe(0);
      expect(product.stats.averageRating).toBe(0);
      expect(product.stats.reviewCount).toBe(0);
    });

    it('should track viewCount', async () => {
      const product = await Product.create(createValidProduct({ slug: 'stats2' }));

      await Product.findByIdAndUpdate(product._id, {
        $inc: { 'stats.viewCount': 1 },
      });

      const updated = await Product.findById(product._id);
      expect(updated?.stats.viewCount).toBe(1);
    });
  });

  // ========================================
  // TAGS TESTS
  // ========================================
  describe('Tags', () => {
    it('should store tags', async () => {
      const product = await Product.create(
        createValidProduct({
          slug: 'tags1',
          tags: ['luxury', 'bestseller', 'gift'],
        })
      );

      expect(product.tags).toContain('luxury');
      expect(product.tags).toHaveLength(3);
    });

    it('should lowercase tags', async () => {
      const product = await Product.create(
        createValidProduct({
          slug: 'tags2',
          tags: ['LUXURY', 'BestSeller'],
        })
      );

      expect(product.tags).toContain('luxury');
      expect(product.tags).toContain('bestseller');
    });
  });

  // ========================================
  // TIMESTAMPS TESTS
  // ========================================
  describe('Timestamps', () => {
    it('should have createdAt and updatedAt', async () => {
      const product = await Product.create(createValidProduct({ slug: 'time1' }));

      expect(product.createdAt).toBeInstanceOf(Date);
      expect(product.updatedAt).toBeInstanceOf(Date);
    });
  });
});
