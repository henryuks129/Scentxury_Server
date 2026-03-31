/**
 * ============================================
 * PRODUCT VALIDATORS - TESTS
 * ============================================
 *
 * Tests for product validation schemas.
 *
 * @file src/validators/__tests__/product.validator.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductQuerySchema,
  ProductSearchSchema,
  VariantSchema,
  ScentNotesSchema,
  ProductImageSchema,
  UpdateStockSchema,
  BulkStockUpdateSchema,
  objectIdSchema,
  priceSchema,
  percentageSchema,
} from '../product.validator.js';

describe('Product Validators', () => {
  // ========================================
  // HELPER SCHEMAS
  // ========================================
  describe('objectIdSchema', () => {
    it('should accept valid ObjectId', () => {
      const result = objectIdSchema.safeParse('507f1f77bcf86cd799439011');
      expect(result.success).toBe(true);
    });

    it('should reject invalid ObjectId', () => {
      const result = objectIdSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });

    it('should reject ObjectId with wrong length', () => {
      const result = objectIdSchema.safeParse('507f1f77bcf86cd79943901');
      expect(result.success).toBe(false);
    });
  });

  describe('priceSchema', () => {
    it('should accept positive price', () => {
      const result = priceSchema.safeParse(99.99);
      expect(result.success).toBe(true);
    });

    it('should round to 2 decimal places', () => {
      const result = priceSchema.safeParse(99.999);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(100);
      }
    });

    it('should reject zero price', () => {
      const result = priceSchema.safeParse(0);
      expect(result.success).toBe(false);
    });

    it('should reject negative price', () => {
      const result = priceSchema.safeParse(-10);
      expect(result.success).toBe(false);
    });

    it('should reject price exceeding maximum', () => {
      const result = priceSchema.safeParse(100000001);
      expect(result.success).toBe(false);
    });
  });

  describe('percentageSchema', () => {
    it('should accept valid percentage', () => {
      const result = percentageSchema.safeParse(50);
      expect(result.success).toBe(true);
    });

    it('should accept 0', () => {
      const result = percentageSchema.safeParse(0);
      expect(result.success).toBe(true);
    });

    it('should accept 100', () => {
      const result = percentageSchema.safeParse(100);
      expect(result.success).toBe(true);
    });

    it('should reject negative percentage', () => {
      const result = percentageSchema.safeParse(-1);
      expect(result.success).toBe(false);
    });

    it('should reject percentage over 100', () => {
      const result = percentageSchema.safeParse(101);
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // VARIANT SCHEMA
  // ========================================
  describe('VariantSchema', () => {
    // NOTE: field is "stock" to match the Product model (was "stockQuantity" in the old schema)
    const validVariant = {
      size: '50ml' as const,
      sku: 'CHI-PROD-001-50ML',
      priceNGN: 25000,
      priceUSD: 50,
      stock: 100,
    };

    it('should accept valid variant', () => {
      const result = VariantSchema.safeParse(validVariant);
      expect(result.success).toBe(true);
    });

    it('should accept all valid sizes', () => {
      const sizes = ['20ml', '50ml', '100ml'] as const;
      sizes.forEach((size) => {
        const result = VariantSchema.safeParse({ ...validVariant, size });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid size', () => {
      const result = VariantSchema.safeParse({ ...validVariant, size: '30ml' });
      expect(result.success).toBe(false);
    });

    it('should default isAvailable to true', () => {
      const result = VariantSchema.safeParse(validVariant);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isAvailable).toBe(true);
      }
    });

    it('should reject SKU with lowercase', () => {
      const result = VariantSchema.safeParse({ ...validVariant, sku: 'chi-prod-001' });
      expect(result.success).toBe(false);
    });

    it('should reject SKU with special characters', () => {
      const result = VariantSchema.safeParse({ ...validVariant, sku: 'CHI_PROD@001' });
      expect(result.success).toBe(false);
    });

    it('should reject negative stock quantity', () => {
      // "stock" is the correct field name (renamed from stockQuantity to match the model)
      const result = VariantSchema.safeParse({ ...validVariant, stock: -5 });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // SCENT NOTES SCHEMA
  // ========================================
  describe('ScentNotesSchema', () => {
    const validScentNotes = {
      top: ['Bergamot', 'Lemon'],
      middle: ['Jasmine', 'Rose'],
      base: ['Sandalwood', 'Vanilla'],
    };

    it('should accept valid scent notes', () => {
      const result = ScentNotesSchema.safeParse(validScentNotes);
      expect(result.success).toBe(true);
    });

    it('should require at least one top note', () => {
      const result = ScentNotesSchema.safeParse({ ...validScentNotes, top: [] });
      expect(result.success).toBe(false);
    });

    it('should require at least one middle note', () => {
      const result = ScentNotesSchema.safeParse({ ...validScentNotes, middle: [] });
      expect(result.success).toBe(false);
    });

    it('should require at least one base note', () => {
      const result = ScentNotesSchema.safeParse({ ...validScentNotes, base: [] });
      expect(result.success).toBe(false);
    });

    it('should reject empty note strings', () => {
      const result = ScentNotesSchema.safeParse({ ...validScentNotes, top: [''] });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // PRODUCT IMAGE SCHEMA
  // ========================================
  describe('ProductImageSchema', () => {
    it('should accept valid image', () => {
      const result = ProductImageSchema.safeParse({
        url: 'https://example.com/image.jpg',
      });
      expect(result.success).toBe(true);
    });

    it('should accept full image data', () => {
      const result = ProductImageSchema.safeParse({
        url: 'https://example.com/image.jpg',
        publicId: 'prod_001',
        alt: 'Product image',
        isPrimary: true,
        order: 1,
      });
      expect(result.success).toBe(true);
    });

    it('should default isPrimary to false', () => {
      const result = ProductImageSchema.safeParse({
        url: 'https://example.com/image.jpg',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isPrimary).toBe(false);
      }
    });

    it('should default order to 0', () => {
      const result = ProductImageSchema.safeParse({
        url: 'https://example.com/image.jpg',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.order).toBe(0);
      }
    });

    it('should reject invalid URL', () => {
      const result = ProductImageSchema.safeParse({
        url: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // CREATE PRODUCT SCHEMA
  // ========================================
  describe('CreateProductSchema', () => {
    // Use "stock" to match the renamed VariantSchema field (aligned with Product model)
    const validProduct = {
      name: 'Elegant Oud',
      brand: 'Chi Fragrance',
      category: 'unisex' as const,
      variants: [
        {
          size: '50ml' as const,
          sku: 'CHI-EO-001-50ML',
          priceNGN: 35000,
          priceUSD: 70,
          stock: 50,
        },
      ],
    };

    it('should accept valid product', () => {
      const result = CreateProductSchema.safeParse(validProduct);
      expect(result.success).toBe(true);
    });

    it('should accept product with all optional fields', () => {
      const fullProduct = {
        ...validProduct,
        description: 'A luxurious oud fragrance with notes of rose and sandalwood.',
        shortDescription: 'Luxurious oud',
        scentFamily: 'woody',
        concentration: 'eau_de_parfum' as const,
        scentNotes: {
          top: ['Rose'],
          middle: ['Oud'],
          base: ['Sandalwood'],
        },
        // images is now a named-slot object matching IProductImages in Product.ts
        images: {
          boxed: 'https://example.com/boxed.jpg',
          bottle: 'https://example.com/bottle.jpg',
          thumbnail: 'https://example.com/thumb.jpg',
        },
        tags: ['oud', 'luxury'],
        isFeatured: true,
        // seo (not seoMetadata) matches Product model's IProductSEO
        seo: {
          metaTitle: 'Elegant Oud - Chi Fragrance',
          metaDescription: 'Shop our elegant oud fragrance',
        },
      };
      const result = CreateProductSchema.safeParse(fullProduct);
      expect(result.success).toBe(true);
    });

    it('should accept all valid categories', () => {
      const categories = ['male', 'female', 'unisex', 'children', 'combo_mix'] as const;
      categories.forEach((category) => {
        const result = CreateProductSchema.safeParse({ ...validProduct, category });
        expect(result.success).toBe(true);
      });
    });

    it('should require at least one variant', () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        variants: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject product name less than 2 characters', () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        name: 'A',
      });
      expect(result.success).toBe(false);
    });

    it('should reject description less than 10 characters', () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        description: 'Short',
      });
      expect(result.success).toBe(false);
    });

    it('should reject more than 20 tags', () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        tags: Array(21).fill('tag'),
      });
      expect(result.success).toBe(false);
    });

    it('should default isActive to true', () => {
      const result = CreateProductSchema.safeParse(validProduct);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isActive).toBe(true);
      }
    });

    it('should default isFeatured to false', () => {
      const result = CreateProductSchema.safeParse(validProduct);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isFeatured).toBe(false);
      }
    });

    it('should reject invalid concentration', () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        concentration: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // UPDATE PRODUCT SCHEMA
  // ========================================
  describe('UpdateProductSchema', () => {
    it('should accept partial updates', () => {
      const result = UpdateProductSchema.safeParse({
        name: 'Updated Name',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty object', () => {
      const result = UpdateProductSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should require at least one variant if variants provided', () => {
      const result = UpdateProductSchema.safeParse({
        variants: [],
      });
      expect(result.success).toBe(false);
    });

    it('should validate variant data when provided', () => {
      const result = UpdateProductSchema.safeParse({
        variants: [{ size: 'invalid' }],
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // PRODUCT QUERY SCHEMA
  // ========================================
  describe('ProductQuerySchema', () => {
    it('should accept empty query (defaults)', () => {
      const result = ProductQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sort).toBe('-createdAt');
      }
    });

    it('should coerce string numbers', () => {
      const result = ProductQuerySchema.safeParse({
        page: '2',
        limit: '30',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(30);
      }
    });

    it('should accept valid sort options', () => {
      const sortOptions = ['name', 'price', 'createdAt', 'popularity', '-name', '-price', '-createdAt', '-popularity'];
      sortOptions.forEach((sort) => {
        const result = ProductQuerySchema.safeParse({ sort });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid sort option', () => {
      const result = ProductQuerySchema.safeParse({ sort: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should split tags string into array', () => {
      const result = ProductQuerySchema.safeParse({
        tags: 'oud,luxury,premium',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual(['oud', 'luxury', 'premium']);
      }
    });

    it('should coerce boolean values', () => {
      const result = ProductQuerySchema.safeParse({
        inStock: true,
        isActive: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.inStock).toBe(true);
        expect(result.data.isActive).toBe(false);
      }
    });

    it('should reject limit over 100', () => {
      const result = ProductQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // PRODUCT SEARCH SCHEMA
  // ========================================
  describe('ProductSearchSchema', () => {
    it('should accept valid search query', () => {
      const result = ProductSearchSchema.safeParse({
        query: 'oud perfume',
      });
      expect(result.success).toBe(true);
    });

    it('should default limit to 10', () => {
      const result = ProductSearchSchema.safeParse({
        query: 'oud',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });

    it('should reject empty query', () => {
      const result = ProductSearchSchema.safeParse({
        query: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit over 50', () => {
      const result = ProductSearchSchema.safeParse({
        query: 'oud',
        limit: 51,
      });
      expect(result.success).toBe(false);
    });

    it('should accept category filter', () => {
      const result = ProductSearchSchema.safeParse({
        query: 'oud',
        category: 'male',
      });
      expect(result.success).toBe(true);
    });
  });

  // ========================================
  // UPDATE STOCK SCHEMA
  // ========================================
  describe('UpdateStockSchema', () => {
    it('should accept valid stock update', () => {
      const result = UpdateStockSchema.safeParse({
        variantSku: 'CHI-PROD-001',
        quantity: 50,
      });
      expect(result.success).toBe(true);
    });

    it('should default operation to set', () => {
      const result = UpdateStockSchema.safeParse({
        variantSku: 'CHI-PROD-001',
        quantity: 50,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe('set');
      }
    });

    it('should accept all valid operations', () => {
      const operations = ['set', 'increment', 'decrement'] as const;
      operations.forEach((operation) => {
        const result = UpdateStockSchema.safeParse({
          variantSku: 'CHI-PROD-001',
          quantity: 50,
          operation,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should allow negative quantity for decrement', () => {
      const result = UpdateStockSchema.safeParse({
        variantSku: 'CHI-PROD-001',
        quantity: -10,
        operation: 'increment',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid SKU format', () => {
      const result = UpdateStockSchema.safeParse({
        variantSku: 'invalid_sku',
        quantity: 50,
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // BULK STOCK UPDATE SCHEMA
  // ========================================
  describe('BulkStockUpdateSchema', () => {
    it('should accept valid bulk update', () => {
      const result = BulkStockUpdateSchema.safeParse({
        updates: [
          { variantSku: 'CHI-001', quantity: 50 },
          { variantSku: 'CHI-002', quantity: 30 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should require at least one update', () => {
      const result = BulkStockUpdateSchema.safeParse({
        updates: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject more than 100 updates', () => {
      const updates = Array(101)
        .fill(null)
        .map((_, i) => ({
          variantSku: `CHI-${String(i).padStart(3, '0')}`,
          quantity: 50,
        }));
      const result = BulkStockUpdateSchema.safeParse({ updates });
      expect(result.success).toBe(false);
    });
  });
});
